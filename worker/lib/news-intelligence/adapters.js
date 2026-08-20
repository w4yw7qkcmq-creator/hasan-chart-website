const { PUBLICATION_TYPES, DESTINATIONS, SOURCE_TYPES } = require("./publication-types");
const { resolveCandidateImportance } = require("../news-images/image-policy");
const { resolveEventTypeFromAliases } = require("./event-registry");
const { CANONICAL_EVENT_DEFINITIONS } = require("../economic-releases/canonical-events");

function resolvePublicationEventType(candidate = {}) {
  const facts = candidate.facts || {};
  if (facts.canonicalEventKey && CANONICAL_EVENT_DEFINITIONS[facts.canonicalEventKey]) {
    return facts.canonicalEventKey;
  }
  const combined = `${facts.title || ""}\n${candidate.post?.rawText || ""}`;
  const aliasEventType = resolveEventTypeFromAliases(combined);
  if (aliasEventType) {
    return aliasEventType;
  }
  if (facts.canonical?.eventKey && facts.canonical.eventKey !== "US_CPI_GENERIC") {
    return facts.canonical.eventKey;
  }
  return null;
}

function buildTelegramPublicationRequest(candidate, validation, ctx = {}) {
  const message = validation.sanitizedMessage || String(candidate.formattedMessage || "").trim();
  const sourceLink =
    candidate.post?.sourceUrl || `telegram:${candidate.post?.sourceChannel}/${candidate.post?.sourceMessageId}`;

  const importance =
    candidate.newsType === "economic" || candidate.newsType === "pre_event"
      ? "HIGH"
      : resolveCandidateImportance({ importance: "MEDIUM", metadata: { candidate, newsValue: candidate.newsValue } });

  const eventType = resolvePublicationEventType(candidate);

  return {
    eventType,
    eventKey: null,
    country: candidate.facts?.canonical?.country || "US",
    releaseDate: candidate.post?.sourcePublishedAt || candidate.facts?.scheduledAt || null,
    publicationType:
      candidate.newsType === "economic" ? PUBLICATION_TYPES.RELEASE : PUBLICATION_TYPES.GENERAL_NEWS,
    sourceType: candidate.newsType === "economic" ? SOURCE_TYPES.TELEGRAM_ECONOMIC : SOURCE_TYPES.TELEGRAM_GENERAL,
    sourceId: candidate.post?.sourceChannel || null,
    title: validation.resolvedTitle || candidate.facts?.title || "خبر سوق",
    body: message,
    bodySource: "formatted",
    rawSourceText: candidate.post?.rawText || null,
    destination: DESTINATIONS.BOTH,
    sourceLink,
    importance,
    facts: {
      actual: candidate.facts?.actual || candidate.facts?.numbers?.actual,
      forecast: candidate.facts?.forecast || candidate.facts?.numbers?.forecast,
      previous: candidate.facts?.previous || candidate.facts?.numbers?.previous,
      unit: candidate.facts?.unit || null,
    },
    metadata: {
      candidate,
      mergeKey: ctx.mergeKey || null,
      rawMessageId: candidate.post?.sourceMessageId || null,
      premiumImageContext: null,
      newsValue: candidate.newsValue || null,
    },
  };
}

function buildStructuredEconomicPublicationRequest(result, options = {}) {
  const canonical = result.canonical || result.merged?.canonical || {};
  return {
    eventType: canonical.eventKey || result.eventKey || null,
    country: canonical.country || result.country || "US",
    releaseDate: canonical.scheduledAt || result.scheduledAt || null,
    publicationType: PUBLICATION_TYPES.RELEASE,
    sourceType: options.sourceType || SOURCE_TYPES.TELEGRAM_ECONOMIC,
    sourceId: options.sourceId || null,
    title: result.imageTitle || result.title || "خبر اقتصادي",
    body: result.message,
    bodySource: "formatted",
    rawSourceText: options.rawSourceText || null,
    destination: DESTINATIONS.BOTH,
    sourceLink: result.sourceLink || `economic-release:${result.idempotencyKey}`,
    importance: "HIGH",
    facts: {
      actual: result.merged?.actual || result.actual,
      forecast: result.merged?.forecast || result.forecast,
      previous: result.merged?.previous || result.previous,
    },
    metadata: {
      idempotencyKey: result.idempotencyKey,
      premiumImageContext: options.premiumImageContext || null,
    },
  };
}

module.exports = {
  buildTelegramPublicationRequest,
  buildStructuredEconomicPublicationRequest,
  resolvePublicationEventType,
};
