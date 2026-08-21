import { TELEGRAM_CONTENT_ACCEPTED_UPDATE_TYPES } from "./constants.js";

export function parseTelegramContentUpdate(rawBody) {
  if (!rawBody || typeof rawBody !== "object") {
    throw Object.assign(new Error("Invalid Telegram update payload."), {
      status: 400,
      code: "INVALID_PAYLOAD",
    });
  }

  const updateId = rawBody.update_id;
  if (typeof updateId !== "number" || !Number.isFinite(updateId)) {
    throw Object.assign(new Error("Missing update_id."), {
      status: 400,
      code: "INVALID_UPDATE_ID",
    });
  }

  let updateType = null;
  let message = null;

  for (const type of TELEGRAM_CONTENT_ACCEPTED_UPDATE_TYPES) {
    if (rawBody[type]) {
      updateType = type;
      message = rawBody[type];
      break;
    }
  }

  if (!updateType) {
    return {
      updateId,
      updateType: null,
      message: null,
      channelId: null,
      isAcceptedType: false,
    };
  }

  const channelId = message?.chat?.id;
  if (typeof channelId !== "number" || !Number.isFinite(channelId)) {
    throw Object.assign(new Error("Missing channel id."), {
      status: 400,
      code: "INVALID_CHANNEL_ID",
    });
  }

  const messageId = message?.message_id;
  if (typeof messageId !== "number" || !Number.isFinite(messageId)) {
    throw Object.assign(new Error("Missing message id."), {
      status: 400,
      code: "INVALID_MESSAGE_ID",
    });
  }

  return {
    updateId,
    updateType,
    message,
    channelId,
    messageId,
    mediaGroupId: message?.media_group_id ? String(message.media_group_id) : null,
    isAcceptedType: true,
    isEdit: updateType === "edited_channel_post",
  };
}

export function selectLargestTelegramPhoto(message) {
  const photos = Array.isArray(message?.photo) ? message.photo : [];
  if (!photos.length) return null;
  return photos[photos.length - 1];
}

export function extractTelegramMessageText(message) {
  const caption = String(message?.caption || "").trim();
  if (caption) {
    return {
      body: caption,
      entities: message?.caption_entities || null,
      source: "caption",
    };
  }

  const text = String(message?.text || "").trim();
  return {
    body: text,
    entities: message?.entities || null,
    source: "text",
  };
}
