export const TELEGRAM_CONTENT_SECTIONS = Object.freeze([
  "daily_analysis",
  "academy",
  "result",
]);

export const TELEGRAM_CONTENT_BUCKET = "telegram-content-images";
export const TELEGRAM_CONTENT_MAX_BYTES = 8 * 1024 * 1024;
export const TELEGRAM_CONTENT_MIN_DIMENSION = 10;
export const TELEGRAM_CONTENT_WEBHOOK_MAX_BODY_BYTES = 1024 * 1024;
export const TELEGRAM_CONTENT_RETENTION_LIMIT = 100;
export const TELEGRAM_CONTENT_ALBUM_FINALIZE_DELAY_MS = 3000;
export const TELEGRAM_CONTENT_OPERATIONAL_CLEANUP_THROTTLE_MS = 60 * 60 * 1000;
export const TELEGRAM_CONTENT_INGRESS_LOG_RETENTION_DAYS = 30;
export const TELEGRAM_CONTENT_BUFFER_TERMINAL_RETENTION_DAYS = 7;
export const TELEGRAM_CONTENT_MAX_ALBUM_PHOTOS = 10;
export const TELEGRAM_CONTENT_MAX_FINALIZE_ATTEMPTS = 5;

export const TELEGRAM_CONTENT_ACCEPTED_UPDATE_TYPES = Object.freeze([
  "channel_post",
  "edited_channel_post",
]);

export const TELEGRAM_CONTENT_INELIGIBLE_REASONS = Object.freeze({
  VIDEO: "video_present",
  VIDEO_NOTE: "video_note_present",
  ANIMATION: "animation_present",
  MIXED_MEDIA: "mixed_media_group",
  EMPTY: "empty_body",
  CORRUPT_IMAGE: "corrupt_image",
  OVERSIZE_IMAGE: "oversize_image",
});

export const TELEGRAM_CONTENT_REVIEW_FLAGS = Object.freeze({
  EDIT_WOULD_BE_INELIGIBLE: "edit_would_be_ineligible",
});
