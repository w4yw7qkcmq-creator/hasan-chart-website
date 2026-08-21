import { randomUUID } from "node:crypto";
import {
  buildTelegramContentDisplayTitle,
  buildTelegramContentPublicSlug,
} from "./channel-map.js";
import { downloadTelegramPhotoBuffer } from "./telegram-api.js";
import { validateTelegramImageBuffer } from "./image-validation.js";
import { uploadTelegramContentImage, compensateOrphanStoragePaths } from "./storage.js";
import { enforceTelegramSectionRetention } from "./retention.js";
import { revalidateTelegramSectionContent } from "./revalidation.js";
import {
  TELEGRAM_CONTENT_MAX_ALBUM_PHOTOS,
  TELEGRAM_CONTENT_MAX_FINALIZE_ATTEMPTS,
} from "./constants.js";

function pickAlbumBody(rows) {
  for (const row of rows) {
    const body = String(row.body || "").trim();
    if (body) {
      return { body, entities: row.body_entities || null };
    }
  }
  return { body: "(album)", entities: null };
}

export async function finalizeStaleAlbumGroups(supabase, {
  now = new Date(),
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const nowIso = now.toISOString();

  const { data: staleGroups, error: staleError } = await supabase
    .from("telegram_media_group_state")
    .select("*")
    .eq("status", "buffering")
    .lte("finalize_after", nowIso)
    .order("finalize_after", { ascending: true })
    .limit(20);

  if (staleError) throw staleError;

  const outcomes = [];

  for (const group of staleGroups || []) {
    const outcome = await finalizeOneAlbumGroup(supabase, group, { env, fetchImpl, now });
    outcomes.push(outcome);
  }

  return outcomes;
}

export async function finalizeOneAlbumGroup(supabase, groupState, {
  env = process.env,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  const channelId = groupState.telegram_channel_id;
  const mediaGroupId = groupState.telegram_media_group_id;

  const { data: claimed, error: claimError } = await supabase
    .from("telegram_media_group_state")
    .update({ status: "finalizing" })
    .eq("telegram_channel_id", channelId)
    .eq("telegram_media_group_id", mediaGroupId)
    .eq("status", "buffering")
    .select("*")
    .maybeSingle();

  if (claimError) throw claimError;
  if (!claimed) {
    return { ok: true, skipped: true, reason: "not_claimed" };
  }

  if (claimed.has_ineligible_media) {
    await markAlbumGroupRejected(supabase, channelId, mediaGroupId, claimed.ineligible_reason);
    return { ok: true, rejected: true, reason: claimed.ineligible_reason };
  }

  const { data: bufferRows, error: bufferError } = await supabase
    .from("telegram_media_group_buffer")
    .select("*")
    .eq("telegram_channel_id", channelId)
    .eq("telegram_media_group_id", mediaGroupId)
    .eq("processing_status", "pending")
    .order("telegram_message_id", { ascending: true });

  if (bufferError) {
    await incrementFinalizeFailure(supabase, channelId, mediaGroupId, bufferError.message);
    throw bufferError;
  }

  const rows = bufferRows || [];
  if (!rows.length) {
    await markAlbumGroupRejected(supabase, channelId, mediaGroupId, "empty_buffer");
    return { ok: true, rejected: true, reason: "empty_buffer" };
  }

  const photoRows = rows.filter((row) => row.photo_file_id);
  if (!photoRows.length) {
    await markAlbumGroupRejected(supabase, channelId, mediaGroupId, "no_photos");
    return { ok: true, rejected: true, reason: "no_photos" };
  }

  if (photoRows.length > TELEGRAM_CONTENT_MAX_ALBUM_PHOTOS) {
    await markAlbumGroupRejected(supabase, channelId, mediaGroupId, "album_too_large");
    return { ok: true, rejected: true, reason: "album_too_large" };
  }

  const canonicalMessageId = Math.min(...rows.map((row) => Number(row.telegram_message_id)));
  const section = claimed.section;
  const postId = randomUUID();
  const publicSlug = buildTelegramContentPublicSlug(section, canonicalMessageId);
  const text = pickAlbumBody(rows);
  const publishedAt = new Date(now).toISOString();
  const uploadedPaths = [];

  try {
    const imageInserts = [];

    for (let index = 0; index < photoRows.length; index += 1) {
      const row = photoRows[index];
      const buffer = await downloadTelegramPhotoBuffer(row.photo_file_id, { env, fetchImpl });
      const validation = validateTelegramImageBuffer(buffer);
      if (!validation.ok) {
        await markAlbumGroupRejected(supabase, channelId, mediaGroupId, validation.code);
        await compensateOrphanStoragePaths(supabase, uploadedPaths);
        return { ok: true, rejected: true, reason: validation.code };
      }

      const storagePath = await uploadTelegramContentImage(supabase, {
        section,
        postId,
        sortOrder: index,
        extension: validation.extension,
        buffer,
        contentType: validation.mime,
      });
      uploadedPaths.push(storagePath);

      imageInserts.push({
        post_id: postId,
        sort_order: index,
        storage_path: storagePath,
        telegram_file_id: row.photo_file_id,
        telegram_file_unique_id: row.photo_file_unique_id,
        source_message_id: row.telegram_message_id,
        mime_type: validation.mime,
        width: row.photo_width || validation.width,
        height: row.photo_height || validation.height,
        file_size_bytes: validation.bytes,
      });
    }

    const { error: postError } = await supabase.from("telegram_content_posts").insert({
      id: postId,
      section,
      telegram_channel_id: channelId,
      telegram_message_id: canonicalMessageId,
      telegram_media_group_id: mediaGroupId,
      body: text.body,
      body_entities: text.entities,
      public_slug: publicSlug,
      display_title: buildTelegramContentDisplayTitle(text.body),
      sync_status: "published",
      qualification_status: "eligible",
      aggregation_key: mediaGroupId,
      message_count: rows.length,
      published_at: publishedAt,
    });

    if (postError) {
      if (postError.code === "23505") {
        await compensateOrphanStoragePaths(supabase, uploadedPaths);
        await markAlbumGroupFinalizedWithoutPost(supabase, channelId, mediaGroupId);
        return { ok: true, duplicate: true };
      }
      throw postError;
    }

    const { error: imagesError } = await supabase.from("telegram_content_images").insert(imageInserts);
    if (imagesError) {
      await supabase.from("telegram_content_posts").delete().eq("id", postId);
      await compensateOrphanStoragePaths(supabase, uploadedPaths);
      throw imagesError;
    }

    await supabase
      .from("telegram_media_group_buffer")
      .update({ processing_status: "consumed" })
      .eq("telegram_channel_id", channelId)
      .eq("telegram_media_group_id", mediaGroupId);

    await supabase
      .from("telegram_media_group_state")
      .update({ status: "finalized", last_error: null })
      .eq("telegram_channel_id", channelId)
      .eq("telegram_media_group_id", mediaGroupId);

    await enforceTelegramSectionRetention(supabase, section);
    revalidateTelegramSectionContent(section, { publicSlug });

    return { ok: true, postId, publicSlug, imageCount: imageInserts.length };
  } catch (error) {
    await compensateOrphanStoragePaths(supabase, uploadedPaths);
    await incrementFinalizeFailure(supabase, channelId, mediaGroupId, error.message);
    throw error;
  }
}

async function incrementFinalizeFailure(supabase, channelId, mediaGroupId, message) {
  const { data: current } = await supabase
    .from("telegram_media_group_state")
    .select("finalize_attempts")
    .eq("telegram_channel_id", channelId)
    .eq("telegram_media_group_id", mediaGroupId)
    .maybeSingle();

  const attempts = Number(current?.finalize_attempts || 0) + 1;
  const status = attempts >= TELEGRAM_CONTENT_MAX_FINALIZE_ATTEMPTS ? "poison" : "buffering";

  await supabase
    .from("telegram_media_group_state")
    .update({
      finalize_attempts: attempts,
      last_error: String(message || "finalize_failed").slice(0, 500),
      status,
      finalize_after: new Date(Date.now() + 3000).toISOString(),
    })
    .eq("telegram_channel_id", channelId)
    .eq("telegram_media_group_id", mediaGroupId);
}

async function markAlbumGroupRejected(supabase, channelId, mediaGroupId, reason) {
  await supabase
    .from("telegram_media_group_state")
    .update({
      status: "rejected",
      has_ineligible_media: true,
      ineligible_reason: reason,
    })
    .eq("telegram_channel_id", channelId)
    .eq("telegram_media_group_id", mediaGroupId);

  await supabase
    .from("telegram_media_group_buffer")
    .update({ processing_status: "rejected" })
    .eq("telegram_channel_id", channelId)
    .eq("telegram_media_group_id", mediaGroupId);
}

async function markAlbumGroupFinalizedWithoutPost(supabase, channelId, mediaGroupId) {
  await supabase
    .from("telegram_media_group_buffer")
    .update({ processing_status: "consumed" })
    .eq("telegram_channel_id", channelId)
    .eq("telegram_media_group_id", mediaGroupId);

  await supabase
    .from("telegram_media_group_state")
    .update({ status: "finalized" })
    .eq("telegram_channel_id", channelId)
    .eq("telegram_media_group_id", mediaGroupId);
}
