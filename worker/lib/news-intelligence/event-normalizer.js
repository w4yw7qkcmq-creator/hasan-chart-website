const {
  resolveCanonicalEventKey,
  buildIdempotencyKey,
  CANONICAL_EVENT_DEFINITIONS,
} = require("../economic-releases/canonical-events");
const { resolveEventTypeFromAliases, getEventFamily, normalizeAliasText } = require("./event-registry");

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

  let eventType = candidate.eventType || resolveEventTypeFromAliases(combined);
  if (!eventType) {
    const resolved = resolveCanonicalEventKey(combined);
    eventType = resolved.eventKey || null;
  }

  const country = candidate.country || "US";
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
