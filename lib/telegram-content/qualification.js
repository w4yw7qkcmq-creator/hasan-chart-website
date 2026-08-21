import { TELEGRAM_CONTENT_INELIGIBLE_REASONS } from "./constants.js";

export function detectIneligibleTelegramMedia(message) {
  if (!message || typeof message !== "object") {
    return { eligible: false, reason: TELEGRAM_CONTENT_INELIGIBLE_REASONS.EMPTY };
  }

  if (message.video || message.video_note) {
    return {
      eligible: false,
      reason: message.video_note
        ? TELEGRAM_CONTENT_INELIGIBLE_REASONS.VIDEO_NOTE
        : TELEGRAM_CONTENT_INELIGIBLE_REASONS.VIDEO,
    };
  }

  if (message.animation) {
    return {
      eligible: false,
      reason: TELEGRAM_CONTENT_INELIGIBLE_REASONS.ANIMATION,
    };
  }

  return { eligible: true, reason: null };
}

export function hasTelegramPhoto(message) {
  return Array.isArray(message?.photo) && message.photo.length > 0;
}

export function isTextOnlyTelegramMessage(message) {
  const media = detectIneligibleTelegramMedia(message);
  if (!media.eligible) return false;
  const hasPhoto = hasTelegramPhoto(message);
  const { body } = extractBodyForQualification(message);
  return !hasPhoto && Boolean(body);
}

function extractBodyForQualification(message) {
  const caption = String(message?.caption || "").trim();
  if (caption) return { body: caption };
  const text = String(message?.text || "").trim();
  return { body: text };
}

export function qualifiesForTelegramContentPublish(message) {
  const media = detectIneligibleTelegramMedia(message);
  if (!media.eligible) {
    return { ok: false, reason: media.reason };
  }

  const hasPhoto = hasTelegramPhoto(message);
  const { body } = extractBodyForQualification(message);

  if (!hasPhoto && !body) {
    return { ok: false, reason: TELEGRAM_CONTENT_INELIGIBLE_REASONS.EMPTY };
  }

  return { ok: true, reason: null, hasPhoto, body };
}
