import { detectIneligibleTelegramMedia } from "./qualification.js";
import { extractTelegramMessageText, selectLargestTelegramPhoto } from "./update-parser.js";
import { TELEGRAM_CONTENT_ALBUM_FINALIZE_DELAY_MS } from "./constants.js";
import {
  cancelAlbumGroupTimer,
  logTelegramAlbumLateMember,
  scheduleAlbumGroupFinalization,
} from "./album-liveness-scheduler.js";

export async function bufferTelegramAlbumMessage(supabase, {
  section,
  channelId,
  mediaGroupId,
  messageId,
  message,
  updateId,
  now = new Date(),
}) {
  const ineligible = detectIneligibleTelegramMedia(message);
  const text = extractTelegramMessageText(message);
  const photo = selectLargestTelegramPhoto(message);

  const delayMs = TELEGRAM_CONTENT_ALBUM_FINALIZE_DELAY_MS;
  const finalizeAfter = new Date(now.getTime() + delayMs).toISOString();
  const nowIso = now.toISOString();

  const { data: existingState } = await supabase
    .from("telegram_media_group_state")
    .select("*")
    .eq("telegram_channel_id", channelId)
    .eq("telegram_media_group_id", mediaGroupId)
    .maybeSingle();

  if (existingState?.status === "finalized") {
    logTelegramAlbumLateMember({ channelId, mediaGroupId, messageId });
    return { ok: true, ignored: true, reason: "group_already_finalized", lateMember: true };
  }

  if (existingState?.status === "rejected") {
    return { ok: true, ignored: true, reason: "group_terminal" };
  }

  const hasIneligible = !ineligible.eligible || Boolean(existingState?.has_ineligible_media);

  const nextState = {
    telegram_channel_id: channelId,
    telegram_media_group_id: mediaGroupId,
    section,
    has_ineligible_media: hasIneligible,
    ineligible_reason: hasIneligible
      ? ineligible.reason || existingState?.ineligible_reason || "mixed_media_group"
      : null,
    message_count: (existingState?.message_count || 0) + 1,
    first_received_at: existingState?.first_received_at || nowIso,
    last_received_at: nowIso,
    finalize_after: finalizeAfter,
    status: hasIneligible ? "rejected" : "buffering",
  };

  const { error: stateError } = await supabase.from("telegram_media_group_state").upsert(nextState, {
    onConflict: "telegram_channel_id,telegram_media_group_id",
  });
  if (stateError) throw stateError;

  const { data: existingBuffer } = await supabase
    .from("telegram_media_group_buffer")
    .select("id")
    .eq("telegram_channel_id", channelId)
    .eq("telegram_message_id", messageId)
    .maybeSingle();

  if (existingBuffer) {
    await supabase
      .from("telegram_media_group_buffer")
      .update({ last_seen_at: nowIso })
      .eq("telegram_channel_id", channelId)
      .eq("telegram_message_id", messageId);

    if (!hasIneligible) {
      scheduleAlbumGroupFinalization(channelId, mediaGroupId, finalizeAfter, { supabase });
    }

    return { ok: true, duplicate: true, finalizeAfter };
  }

  const { error: bufferError } = await supabase.from("telegram_media_group_buffer").insert(
    {
      telegram_channel_id: channelId,
      telegram_media_group_id: mediaGroupId,
      telegram_message_id: messageId,
      section,
      has_video: Boolean(message.video),
      has_animation: Boolean(message.animation),
      has_video_note: Boolean(message.video_note),
      body: text.body || null,
      body_entities: text.entities,
      photo_file_id: photo?.file_id || null,
      photo_file_unique_id: photo?.file_unique_id || null,
      photo_width: photo?.width || null,
      photo_height: photo?.height || null,
      raw_update_id: updateId,
      received_at: nowIso,
      last_seen_at: nowIso,
      processing_status: hasIneligible ? "rejected" : "pending",
    }
  );

  if (bufferError) {
    throw bufferError;
  }

  if (hasIneligible) {
    cancelAlbumGroupTimer(channelId, mediaGroupId);
    await supabase
      .from("telegram_media_group_buffer")
      .update({ processing_status: "rejected" })
      .eq("telegram_channel_id", channelId)
      .eq("telegram_media_group_id", mediaGroupId);

    return { ok: true, rejected: true, reason: nextState.ineligible_reason };
  }

  scheduleAlbumGroupFinalization(channelId, mediaGroupId, finalizeAfter, { supabase });

  return { ok: true, buffered: true, finalizeAfter };
}

export async function rejectTelegramAlbumGroup(supabase, channelId, mediaGroupId, reason) {
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
