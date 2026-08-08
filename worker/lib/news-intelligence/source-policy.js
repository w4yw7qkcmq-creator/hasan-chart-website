const { TELEGRAM_SOURCE_CHANNELS } = require("../telegram-news/sources");
const { SOURCE_TYPES } = require("./publication-types");
const { isNumericEconomicRelease } = require("./event-normalizer");

const BLOCK_REASONS = {
  ECONOMIC_SOURCE_NOT_ALLOWED: "ECONOMIC_SOURCE_NOT_ALLOWED",
  RSS_ECONOMIC_PUBLISH_FORBIDDEN: "RSS_ECONOMIC_PUBLISH_FORBIDDEN",
  MANUAL_ECONOMIC_PUBLISH_FORBIDDEN: "MANUAL_ECONOMIC_PUBLISH_FORBIDDEN",
};

const APPROVED_TELEGRAM_CHANNEL_NAMES = new Set(TELEGRAM_SOURCE_CHANNELS.map((channel) => channel.name));

function normalizeSourceChannel(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

function isApprovedTelegramSourceChannel(sourceId) {
  const normalized = normalizeSourceChannel(sourceId);
  if (!normalized) {
    return false;
  }
  for (const channel of TELEGRAM_SOURCE_CHANNELS) {
    if (normalizeSourceChannel(channel.name) === normalized) {
      return true;
    }
  }
  return false;
}

function validateNumericEconomicSourcePolicy({ eventType, sourceType, sourceId, publicationType }) {
  if (!isNumericEconomicRelease(eventType)) {
    return { ok: true };
  }

  if (publicationType && publicationType !== "RELEASE") {
    return { ok: true };
  }

  if (sourceType === SOURCE_TYPES.TELEGRAM_ECONOMIC && isApprovedTelegramSourceChannel(sourceId)) {
    return { ok: true, approvedChannel: sourceId };
  }

  if (sourceType === SOURCE_TYPES.RSS_GENERAL) {
    return { ok: false, reason: BLOCK_REASONS.RSS_ECONOMIC_PUBLISH_FORBIDDEN };
  }

  if (sourceType === SOURCE_TYPES.MANUAL_API) {
    return { ok: false, reason: BLOCK_REASONS.MANUAL_ECONOMIC_PUBLISH_FORBIDDEN };
  }

  if (sourceType === SOURCE_TYPES.TELEGRAM_ECONOMIC || sourceType === SOURCE_TYPES.TELEGRAM_GENERAL) {
    return { ok: false, reason: BLOCK_REASONS.ECONOMIC_SOURCE_NOT_ALLOWED, detail: "unapproved_telegram_channel" };
  }

  return { ok: false, reason: BLOCK_REASONS.ECONOMIC_SOURCE_NOT_ALLOWED, detail: sourceType || "unknown_source" };
}

module.exports = {
  BLOCK_REASONS,
  APPROVED_TELEGRAM_CHANNEL_NAMES,
  isApprovedTelegramSourceChannel,
  validateNumericEconomicSourcePolicy,
};
