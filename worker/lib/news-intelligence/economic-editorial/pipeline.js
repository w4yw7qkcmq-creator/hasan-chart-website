const { getEventFamily } = require("../event-registry");
const { PUBLICATION_TYPES, DESTINATIONS } = require("../publication-types");
const {
  buildStructuredInputFromPublication,
  composeSingleEditorial,
} = require("./economic-editor");
const {
  createFamilyAggregationCoordinator,
  buildAggregationKey,
} = require("./family-aggregator");
const { formatSiteFieldsFromEditorial } = require("./presentation");

let defaultCoordinator = null;

function getDefaultFamilyCoordinator(options = {}) {
  if (!defaultCoordinator || options.reset === true) {
    defaultCoordinator = createFamilyAggregationCoordinator(options);
  }
  return defaultCoordinator;
}

function resetPhase2IntegrationForTests() {
  defaultCoordinator = null;
}

function buildStructuredEventFromFacts(facts = {}, overrides = {}) {
  const eventType = overrides.eventType || facts.eventType || facts.canonicalEventId || facts.canonical?.eventKey;
  return {
    eventType,
    eventFamily: overrides.eventFamily || getEventFamily(eventType),
    country: overrides.country || facts.countryCode || facts.country || facts.canonical?.country || "US",
    actual: facts.actual,
    forecast: facts.forecast,
    previous: facts.previous,
    unit: facts.unit || null,
    releaseTime: overrides.releaseTime || facts.releaseTime || facts.scheduledAt || facts.sourcePublishedAt,
    importance: overrides.importance || facts.importance || "HIGH",
    canonicalDisplayName: facts.canonicalDisplayName || facts.canonical?.arabicName || null,
    sourceReading: facts.sourceReading || null,
    sourceReadingRaw: facts.sourceReadingRaw || facts.sourceReading?.raw || null,
    publishedReading: facts.publishedReading || facts.sourceReading?.normalizedText || null,
    canonicalEventId: facts.canonicalEventId || facts.canonicalEventKey || eventType || null,
    telegramStructuredEconomic: overrides.telegramStructuredEconomic !== false,
    canonicalFacts: {
      actual: facts.actual,
      forecast: facts.forecast,
      previous: facts.previous,
      unit: facts.unit || null,
    },
  };
}

async function runEconomicEditorialPipeline(input = {}, options = {}) {
  const structuredEvent =
    input.eventType && input.canonicalFacts
      ? input
      : buildStructuredEventFromFacts(input.facts || input, input);

  const latency = { normalizationMs: 0, aggregationMs: 0, editorialMs: 0, imageMs: 0, totalMs: 0 };
  const startedAt = Date.now();

  const runOptions = {
    disableAi: options.disableAi !== false && !options.openAiClient,
    openAiClient: options.openAiClient || null,
    forceAi: options.forceAi === true,
    rawSourceText: options.rawSourceText || null,
    allowPlaceholderImage: options.allowPlaceholderImage === true,
    testMode: options.testMode === true,
    createCategoryVisual: options.createCategoryVisual,
    createBrandedFallback: options.createBrandedFallback,
    sourceImageUrl: options.sourceImageUrl,
    allowSourceImage: options.allowSourceImage,
  };

  let editorialResult;
  const aggregationStarted = Date.now();

  if (options.skipFamilyAggregation === true || !structuredEvent.eventFamily) {
    editorialResult = await composeSingleEditorial(structuredEvent, runOptions);
  } else {
    const coordinator = options.coordinator || getDefaultFamilyCoordinator(options.coordinatorOptions);
    editorialResult = await coordinator.submitStructuredEvent(structuredEvent, runOptions);
  }

  latency.aggregationMs = Date.now() - aggregationStarted;
  latency.editorialMs = editorialResult.latency?.totalMs || 0;
  latency.imageMs = editorialResult.latency?.imageMs || 0;
  latency.totalMs = Date.now() - startedAt;

  if (!editorialResult.ok) {
    return { ...editorialResult, latency };
  }

  return {
    ok: true,
    structuredEvent,
    editorial: editorialResult.structured,
    body: editorialResult.body,
    aiMeta: editorialResult.aiMeta,
    image: editorialResult.image,
    imageUrl: editorialResult.imageUrl || editorialResult.imageMeta?.url,
    familyPublicationKey: editorialResult.familyPublicationKey || null,
    deterministic: editorialResult.deterministic,
    editorialVersion: editorialResult.editorialVersion,
    siteFields: formatSiteFieldsFromEditorial(editorialResult),
    latency,
  };
}

async function buildPhase2PublicationRequest(basePublication = {}, options = {}) {
  const structuredEvent = buildStructuredInputFromPublication(basePublication);
  structuredEvent.eventFamily = structuredEvent.eventFamily || getEventFamily(structuredEvent.eventType);

  const pipeline = await runEconomicEditorialPipeline(structuredEvent, {
    ...options,
    rawSourceText: basePublication.rawSourceText || null,
  });

  if (!pipeline.ok) {
    return pipeline;
  }

  const publication = {
    ...basePublication,
    title: pipeline.editorial.headline,
    body: pipeline.body,
    bodySource: "phase2_editorial",
    importance: pipeline.editorial.importance || basePublication.importance,
    image: pipeline.image || basePublication.image || null,
    imageUrl: pipeline.imageUrl || basePublication.imageUrl || null,
    facts: basePublication.facts,
    familyPublicationKey: pipeline.familyPublicationKey,
    metadata: {
      ...(basePublication.metadata || {}),
      phase2: true,
      editorialArtifact: pipeline.editorial,
      aiMeta: pipeline.aiMeta,
      siteFields: pipeline.siteFields,
      latency: pipeline.latency,
    },
    publicationType: PUBLICATION_TYPES.RELEASE,
    destination: basePublication.destination || DESTINATIONS.BOTH,
  };

  if (pipeline.familyPublicationKey) {
    publication.eventType = structuredEvent.eventFamily;
    publication.eventFamily = structuredEvent.eventFamily;
  }

  return { ok: true, publication, pipeline };
}

module.exports = {
  buildStructuredEventFromFacts,
  runEconomicEditorialPipeline,
  buildPhase2PublicationRequest,
  getDefaultFamilyCoordinator,
  resetPhase2IntegrationForTests,
  buildAggregationKey,
};
