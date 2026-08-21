import { randomUUID } from "node:crypto";
import {
  buildTelegramContentDisplayTitle,
  buildTelegramContentPublicSlug,
} from "./channel-map.js";
import { extractTelegramMessageText, selectLargestTelegramPhoto } from "./update-parser.js";
import { qualifiesForTelegramContentPublish } from "./qualification.js";
import { downloadTelegramPhotoBuffer } from "./telegram-api.js";
import { validateTelegramImageBuffer } from "./image-validation.js";
import { uploadTelegramContentImage, compensateOrphanStoragePaths } from "./storage.js";
import { enforceTelegramSectionRetention } from "./retention.js";
import { revalidateTelegramSectionContent } from "./revalidation.js";
import { TELEGRAM_CONTENT_INELIGIBLE_REASONS } from "./constants.js";

export async function createTelegramSingleMessagePost(ctx) {
  const {
    supabase,
    section,
    channelId,
    messageId,
    message,
    env = process.env,
    fetchImpl = fetch,
    now = new Date(),
  } = ctx;

  const qualification = qualifiesForTelegramContentPublish(message);
  if (!qualification.ok) {
    return { ok: false, rejected: true, reason: qualification.reason };
  }

  const text = extractTelegramMessageText(message);
  if (!text.body && !qualification.hasPhoto) {
    return { ok: false, rejected: true, reason: TELEGRAM_CONTENT_INELIGIBLE_REASONS.EMPTY };
  }

  const postId = randomUUID();
  const publishedAt = new Date((message.date || Math.floor(now.getTime() / 1000)) * 1000).toISOString();
  const publicSlug = buildTelegramContentPublicSlug(section, messageId);
  const body = text.body || "(photo)";
  const uploadedPaths = [];

  try {
    if (qualification.hasPhoto) {
      const photo = selectLargestTelegramPhoto(message);
      const buffer = await downloadTelegramPhotoBuffer(photo.file_id, { env, fetchImpl });
      const validation = validateTelegramImageBuffer(buffer);
      if (!validation.ok) {
        return { ok: false, rejected: true, reason: validation.code };
      }

      const storagePath = await uploadTelegramContentImage(supabase, {
        section,
        postId,
        sortOrder: 0,
        extension: validation.extension,
        buffer,
        contentType: validation.mime,
      });
      uploadedPaths.push(storagePath);

      const { error: postError } = await supabase.from("telegram_content_posts").insert({
        id: postId,
        section,
        telegram_channel_id: channelId,
        telegram_message_id: messageId,
        telegram_media_group_id: null,
        body,
        body_entities: text.entities,
        public_slug: publicSlug,
        display_title: buildTelegramContentDisplayTitle(body),
        sync_status: "published",
        qualification_status: "eligible",
        aggregation_key: String(messageId),
        message_count: 1,
        published_at: publishedAt,
        telegram_edited_at: message.edit_date
          ? new Date(message.edit_date * 1000).toISOString()
          : null,
      });

      if (postError) {
        if (postError.code === "23505") {
          await compensateOrphanStoragePaths(supabase, uploadedPaths);
          return { ok: true, duplicate: true };
        }
        throw postError;
      }

      const { error: imageError } = await supabase.from("telegram_content_images").insert({
        post_id: postId,
        sort_order: 0,
        storage_path: uploadedPaths[0],
        telegram_file_id: photo.file_id,
        telegram_file_unique_id: photo.file_unique_id || null,
        source_message_id: messageId,
        mime_type: validation.mime,
        width: photo.width || validation.width,
        height: photo.height || validation.height,
        file_size_bytes: validation.bytes,
      });

      if (imageError) {
        await supabase.from("telegram_content_posts").delete().eq("id", postId);
        await compensateOrphanStoragePaths(supabase, uploadedPaths);
        throw imageError;
      }
    } else {
      const { error: postError } = await supabase.from("telegram_content_posts").insert({
        id: postId,
        section,
        telegram_channel_id: channelId,
        telegram_message_id: messageId,
        telegram_media_group_id: null,
        body,
        body_entities: text.entities,
        public_slug: publicSlug,
        display_title: buildTelegramContentDisplayTitle(body),
        sync_status: "published",
        qualification_status: "eligible",
        aggregation_key: String(messageId),
        message_count: 1,
        published_at: publishedAt,
        telegram_edited_at: message.edit_date
          ? new Date(message.edit_date * 1000).toISOString()
          : null,
      });

      if (postError) {
        if (postError.code === "23505") {
          return { ok: true, duplicate: true };
        }
        throw postError;
      }
    }

    await enforceTelegramSectionRetention(supabase, section);
    revalidateTelegramSectionContent(section, { publicSlug });

    return { ok: true, postId, publicSlug };
  } catch (error) {
    await compensateOrphanStoragePaths(supabase, uploadedPaths);
    throw error;
  }
}
