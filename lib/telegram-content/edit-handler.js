import { extractTelegramMessageText, selectLargestTelegramPhoto } from "./update-parser.js";
import { detectIneligibleTelegramMedia, hasTelegramPhoto } from "./qualification.js";
import { downloadTelegramPhotoBuffer } from "./telegram-api.js";
import { validateTelegramImageBuffer } from "./image-validation.js";
import {
  uploadTelegramContentImage,
  compensateOrphanStoragePaths,
  removeTelegramContentStoragePaths,
} from "./storage.js";
import { revalidateTelegramSectionContent } from "./revalidation.js";
import { TELEGRAM_CONTENT_REVIEW_FLAGS } from "./constants.js";

async function findTelegramPostForEdit(supabase, { channelId, messageId, mediaGroupId }) {
  if (mediaGroupId) {
    const { data } = await supabase
      .from("telegram_content_posts")
      .select("*")
      .eq("telegram_channel_id", channelId)
      .eq("telegram_media_group_id", mediaGroupId)
      .eq("sync_status", "published")
      .maybeSingle();
    if (data) return data;
  }

  const { data } = await supabase
    .from("telegram_content_posts")
    .select("*")
    .eq("telegram_channel_id", channelId)
    .eq("telegram_message_id", messageId)
    .eq("sync_status", "published")
    .maybeSingle();

  return data || null;
}

export async function handleEditedTelegramChannelPost(ctx) {
  const {
    supabase,
    channelId,
    messageId,
    mediaGroupId,
    message,
    env = process.env,
    fetchImpl = fetch,
  } = ctx;

  const ineligible = detectIneligibleTelegramMedia(message);
  const existing = await findTelegramPostForEdit(supabase, { channelId, messageId, mediaGroupId });

  if (!existing) {
    return { ok: false, notFound: true };
  }

  if (!ineligible.eligible) {
    await supabase
      .from("telegram_content_posts")
      .update({
        review_flag: TELEGRAM_CONTENT_REVIEW_FLAGS.EDIT_WOULD_BE_INELIGIBLE,
        telegram_edited_at: message.edit_date
          ? new Date(message.edit_date * 1000).toISOString()
          : new Date().toISOString(),
      })
      .eq("id", existing.id);

    return { ok: true, reviewFlagged: true, reason: ineligible.reason };
  }

  const text = extractTelegramMessageText(message);
  const uploadedPaths = [];
  const oldPaths = [];

  try {
    const patch = {
      body: text.body || existing.body,
      body_entities: text.entities,
      telegram_edited_at: message.edit_date
        ? new Date(message.edit_date * 1000).toISOString()
        : new Date().toISOString(),
      review_flag: null,
    };

    const { error: updateError } = await supabase
      .from("telegram_content_posts")
      .update(patch)
      .eq("id", existing.id);

    if (updateError) throw updateError;

    if (hasTelegramPhoto(message)) {
      const photo = selectLargestTelegramPhoto(message);
      const { data: currentImages } = await supabase
        .from("telegram_content_images")
        .select("*")
        .eq("post_id", existing.id)
        .order("sort_order", { ascending: true });

      const current = currentImages?.[0];
      if (current && current.telegram_file_id !== photo.file_id) {
        oldPaths.push(current.storage_path);

        const buffer = await downloadTelegramPhotoBuffer(photo.file_id, { env, fetchImpl });
        const validation = validateTelegramImageBuffer(buffer);
        if (!validation.ok) {
          return { ok: false, rejected: true, reason: validation.code };
        }

        const storagePath = await uploadTelegramContentImage(supabase, {
          section: existing.section,
          postId: existing.id,
          sortOrder: 0,
          extension: validation.extension,
          buffer,
          contentType: validation.mime,
        });
        uploadedPaths.push(storagePath);

        if (current) {
          await supabase.from("telegram_content_images").delete().eq("id", current.id);
        }

        const { error: imageInsertError } = await supabase.from("telegram_content_images").insert({
          post_id: existing.id,
          sort_order: 0,
          storage_path: storagePath,
          telegram_file_id: photo.file_id,
          telegram_file_unique_id: photo.file_unique_id || null,
          source_message_id: messageId,
          mime_type: validation.mime,
          width: photo.width || validation.width,
          height: photo.height || validation.height,
          file_size_bytes: validation.bytes,
        });

        if (imageInsertError) {
          await compensateOrphanStoragePaths(supabase, uploadedPaths);
          throw imageInsertError;
        }

        await removeTelegramContentStoragePaths(supabase, oldPaths);
      }
    }

    revalidateTelegramSectionContent(existing.section, { publicSlug: existing.public_slug });
    return { ok: true, postId: existing.id, publicSlug: existing.public_slug };
  } catch (error) {
    await compensateOrphanStoragePaths(supabase, uploadedPaths);
    throw error;
  }
}
