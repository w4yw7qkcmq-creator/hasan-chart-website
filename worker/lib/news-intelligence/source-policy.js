const { TELEGRAM_SOURCE_CHANNELS } = require("../telegram-news/sources");
const { SOURCE_TYPES } = require("./publication-types");
const { isNumericEconomicRelease } = require("./event-normalizer");

const BLOCK_REASONS = {
  ECONOMIC_SOURCE_NOT_ALLOWED: "ECONOMIC_SOURCE_NOT_ALLOWED",
  RSS_ECONOMIC_PUBLISH_FORBIDDEN: "RSS_ECONOMIC_PUBLISH_FORBIDDEN",
  MANUAL_ECONOMIC_PUBLISH_FORBIDDEN: "MANUAL_ECONOMIC_PUBLISH_FORBIDDEN",
};

const APPROVED_TELEGRAM_CHANNEL_NAMES = new Set(TELEGRAM_SOURCE_CHANNELS.map((channel) => channel.name));

const NUMERIC_ECONOMIC_TELEGRAM_SOURCES = Object.freeze(["ForexBreakingNews"]);

function normalizeSourceChannel(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

const NUMERIC_ECONOMIC_TELEGRAM_SOURCE_SET = new Set(
  NUMERIC_ECONOMIC_TELEGRAM_SOURCES.map((channel) => normalizeSourceChannel(channel))
);

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

function isApprovedNumericEconomicTelegramSource(sourceId) {
  const normalized = normalizeSourceChannel(sourceId);
  if (!normalized) {
    return false;
  }
  return NUMERIC_ECONOMIC_TELEGRAM_SOURCE_SET.has(normalized);
}

function validateNumericEconomicSourcePolicy({ eventType, sourceType, sourceId, publicationType }) {
  if (!isNumericEconomicRelease(eventType)) {
    return { ok: true };
  }

  if (publicationType && publicationType !== "RELEASE") {
    return { ok: true };
  }

  if (sourceType === SOURCE_TYPES.TELEGRAM_ECONOMIC && isApprovedNumericEconomicTelegramSource(sourceId)) {
    return { ok: true, approvedChannel: sourceId };
  }

  if (sourceType === SOURCE_TYPES.RSS_GENERAL) {
    return { ok: false, reason: BLOCK_REASONS.RSS_ECONOMIC_PUBLISH_FORBIDDEN };
  }

  if (sourceType === SOURCE_TYPES.MANUAL_API) {
    return { ok: false, reason: BLOCK_REASONS.MANUAL_ECONOMIC_PUBLISH_FORBIDDEN };
  }

  if (sourceType === SOURCE_TYPES.TELEGRAM_ECONOMIC || sourceType === SOURCE_TYPES.TELEGRAM_GENERAL) {
    const detail = isApprovedTelegramSourceChannel(sourceId)
      ? "numeric_economic_channel_not_allowed"
      : "unapproved_telegram_channel";
    return { ok: false, reason: BLOCK_REASONS.ECONOMIC_SOURCE_NOT_ALLOWED, detail };
  }

  return { ok: false, reason: BLOCK_REASONS.ECONOMIC_SOURCE_NOT_ALLOWED, detail: sourceType || "unknown_source" };
}

module.exports = {
  BLOCK_REASONS,
  APPROVED_TELEGRAM_CHANNEL_NAMES,
  NUMERIC_ECONOMIC_TELEGRAM_SOURCES,
  isApprovedTelegramSourceChannel,
  isApprovedNumericEconomicTelegramSource,
  validateNumericEconomicSourcePolicy,
};
