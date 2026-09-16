const {
  resolveCanonicalEventKey,
  buildIdempotencyKey,
  CANONICAL_EVENT_DEFINITIONS,
} = require("../economic-releases/canonical-events");
const { resolveEventTypeFromAliases, getEventFamily, normalizeAliasText, isFamilyPublicationEventType } = require("./event-registry");
const { resolveCountryCode } = require("../economic-releases/country-resolver");
const { buildScheduledBucket } = require("../telegram-news/fingerprint");
const { extractLeadingEconomicNumericToken } = require("../economic-releases/text-normalization");
const {
  STRUCTURED_ECONOMIC_FALLBACK,
  isStructuredEconomicFallbackEventType,
} = require("./structured-economic-fallback");

function normalizeReleaseInstant(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function normalizeEconomicValue(value) {
  return extractLeadingEconomicNumericToken(value);
}

function normalizePeriod(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

function slugifyFallbackPublicTitle(title) {
  const normalized = normalizeAliasText(title)
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 72);
  return normalized || "economic_release";
}

function buildStableReleaseEventKey({ country, eventType, releaseDate, period, fallbackTitle, rawMessageId }) {
  const bucket = buildScheduledBucket(releaseDate);
  if (!eventType || !bucket || bucket === "unknown") {
    return null;
  }
  if (isStructuredEconomicFallbackEventType(eventType)) {
    const slug = slugifyFallbackPublicTitle(fallbackTitle);
    const messagePart = rawMessageId ? `:msg:${rawMessageId}` : "";
    return `${country}:FALLBACK:${slug}:${bucket}${messagePart}`;
  }
  const periodPart = period ? `:${normalizePeriod(period)}` : "";
  return `${country}:${eventType}:${bucket}${periodPart}`;
}

function buildCanonicalEventFromCandidate(candidate = {}) {
  const rawText = candidate.rawText || candidate.sourceText || "";
  const title = candidate.title || candidate.eventTitle || "";
  const combined = `${title}\n${rawText}`;

  const country = candidate.country || candidate.countryCode || resolveCountryCode(combined) || "US";

  let eventType =
    candidate.eventType || resolveEventTypeFromAliases(combined, { countryCode: country });
  if (!eventType) {
    const resolved = resolveCanonicalEventKey(combined, { countryCode: country });
    eventType = resolved.eventKey || null;
  }
  if (!eventType && candidate.fallbackEligible === true) {
    eventType = STRUCTURED_ECONOMIC_FALLBACK;
  }

  const releaseDate = normalizeReleaseInstant(
    candidate.releaseDate || candidate.scheduledAt || candidate.sourcePublishedAt || candidate.receivedAt
  );

  const period = candidate.period || candidate.facts?.period || null;

  const facts = {
    actual: normalizeEconomicValue(candidate.actual ?? candidate.facts?.actual),
    forecast: normalizeEconomicValue(candidate.forecast ?? candidate.facts?.forecast),
    previous: normalizeEconomicValue(candidate.previous ?? candidate.facts?.previous),
    unit: candidate.unit || candidate.facts?.unit || null,
    period,
  };

  const eventKey = buildStableReleaseEventKey({
    country,
    eventType,
    releaseDate,
    period,
    fallbackTitle: candidate.title || candidate.fallbackTitle || title,
    rawMessageId: candidate.rawMessageId || candidate.sourceMessageId || null,
  });
  const legacyIdempotencyKey =
    eventType && releaseDate
      ? buildIdempotencyKey({ country, eventKey: eventType, scheduledAt: releaseDate })
      : null;

  return {
    eventKey,
    eventType,
    eventFamily: eventType ? getEventFamily(eventType) : null,
    country,
    releaseDate,
    releaseTime: releaseDate,
    actual: facts.actual || null,
    forecast: facts.forecast || null,
    previous: facts.previous || null,
    unit: facts.unit,
    sourceChannel: candidate.sourceChannel || candidate.sourceId || null,
    rawMessageId: candidate.rawMessageId || candidate.sourceMessageId || null,
    receivedAt: normalizeReleaseInstant(candidate.receivedAt || new Date().toISOString()),
    legacyIdempotencyKey,
    normalizedTitle: normalizeAliasText(title),
  };
}

function isNumericEconomicRelease(eventType) {
  if (!eventType) {
    return false;
  }
  if (isStructuredEconomicFallbackEventType(eventType)) {
    return true;
  }
  if (isFamilyPublicationEventType(eventType)) {
    return true;
  }
  const definition = CANONICAL_EVENT_DEFINITIONS[eventType];
  if (definition) {
    return definition.requiresTripleTemplate === true;
  }
  const resolved = resolveCanonicalEventKey(eventType);
  return Boolean(resolved.eventKey && resolved.requiresTripleTemplate);
}

module.exports = {
  buildCanonicalEventFromCandidate,
  normalizeReleaseInstant,
  normalizeEconomicValue,
  buildStableReleaseEventKey,
  isNumericEconomicRelease,
};
