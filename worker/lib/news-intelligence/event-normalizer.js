const {
  resolveCanonicalEventKey,
  buildIdempotencyKey,
  CANONICAL_EVENT_DEFINITIONS,
} = require("../economic-releases/canonical-events");
const { resolveEventTypeFromAliases, getEventFamily, normalizeAliasText, isFamilyPublicationEventType } = require("./event-registry");
const { resolveCountryCode } = require("../economic-releases/country-resolver");

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
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .toUpperCase();
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

  const releaseDate = normalizeReleaseInstant(
    candidate.releaseDate || candidate.scheduledAt || candidate.sourcePublishedAt || candidate.receivedAt
  );

  const facts = {
    actual: normalizeEconomicValue(candidate.actual ?? candidate.facts?.actual),
    forecast: normalizeEconomicValue(candidate.forecast ?? candidate.facts?.forecast),
    previous: normalizeEconomicValue(candidate.previous ?? candidate.facts?.previous),
    unit: candidate.unit || candidate.facts?.unit || null,
  };

  const eventKey = eventType && releaseDate ? `${country}:${eventType}:${releaseDate}` : null;
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
  isNumericEconomicRelease,
};
