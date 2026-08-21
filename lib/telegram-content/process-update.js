import { resolveSectionForChannelId } from "./channel-map.js";
import { recordTelegramWebhookIngress } from "./operational-cleanup.js";
import { createTelegramSingleMessagePost } from "./single-message-handler.js";
import { bufferTelegramAlbumMessage } from "./album-buffer-handler.js";
import { handleEditedTelegramChannelPost } from "./edit-handler.js";
import { maybeRunOperationalCleanup } from "./album-liveness-scheduler.js";

export async function processTelegramContentUpdate(supabase, parsedUpdate, {
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const {
    updateId,
    updateType,
    message,
    channelId,
    messageId,
    mediaGroupId,
    isAcceptedType,
    isEdit,
  } = parsedUpdate;

  if (!isAcceptedType) {
    await recordTelegramWebhookIngress(supabase, {
      updateId,
      updateType: "ignored",
      processingResult: "ignored",
    });
    return { ok: true, ignored: true, reason: "unknown_update_type" };
  }

  const ingress = await recordTelegramWebhookIngress(supabase, {
    updateId,
    channelId,
    messageId,
    updateType,
    processingResult: "accepted",
  });

  if (ingress.duplicate) {
    return { ok: true, duplicate: true };
  }

  const section = resolveSectionForChannelId(channelId, env);
  if (!section) {
    return { ok: true, ignored: true, reason: "unknown_channel" };
  }

  if (isEdit) {
    const editResult = await handleEditedTelegramChannelPost({
      supabase,
      section,
      channelId,
      messageId,
      mediaGroupId,
      message,
      env,
      fetchImpl,
    });

    if (editResult.notFound && mediaGroupId) {
      const buffered = await bufferTelegramAlbumMessage(supabase, {
        section,
        channelId,
        mediaGroupId,
        messageId,
        message,
        updateId,
      });
      await maybeRunOperationalCleanup(supabase);
      return { ok: true, editFallback: "buffered", buffered };
    }

    if (editResult.notFound) {
      const created = await createTelegramSingleMessagePost({
        supabase,
        section,
        channelId,
        messageId,
        message,
        env,
        fetchImpl,
      });
      await maybeRunOperationalCleanup(supabase);
      return { ok: true, editFallback: "created", created };
    }

    await maybeRunOperationalCleanup(supabase);
    return { ok: true, edited: true, ...editResult };
  }

  if (mediaGroupId) {
    const buffered = await bufferTelegramAlbumMessage(supabase, {
      section,
      channelId,
      mediaGroupId,
      messageId,
      message,
      updateId,
    });

    return {
      ok: true,
      album: true,
      ...buffered,
    };
  }

  const created = await createTelegramSingleMessagePost({
    supabase,
    section,
    channelId,
    messageId,
    message,
    env,
    fetchImpl,
  });

  await maybeRunOperationalCleanup(supabase);

  return { ok: true, single: true, ...created };
}

export { recoverTelegramAlbumTimersOnStartup, runTelegramAlbumRecoverySweep } from "./album-liveness-scheduler.js";
