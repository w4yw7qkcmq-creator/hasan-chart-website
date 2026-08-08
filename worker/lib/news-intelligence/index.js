const { createNewsPublisherGateway, PUBLICATION_TYPES, DESTINATIONS, SOURCE_TYPES, BLOCK_REASONS } = require("./publisher-gateway");
const { buildCanonicalEventFromCandidate, isNumericEconomicRelease, normalizeEconomicValue } = require("./event-normalizer");
const { resolveEventTypeFromAliases, getEventFamily, listNumericReleaseEventTypes } = require("./event-registry");
const { evaluateCopySimilarity } = require("./copy-similarity-guard");
const { validateEditorialOutput, validateFactIntegrity, detectRawFallbackPattern } = require("./editorial-guards");
const { createPublicationStore, LEG_STATUS } = require("./publication-store");
const { NEWS_EVENTS, logNewsEvent } = require("./observability");

const { buildTelegramPublicationRequest, buildStructuredEconomicPublicationRequest } = require("./adapters");

module.exports = {
  createNewsPublisherGateway,
  buildCanonicalEventFromCandidate,
  isNumericEconomicRelease,
  normalizeEconomicValue,
  resolveEventTypeFromAliases,
  getEventFamily,
  listNumericReleaseEventTypes,
  evaluateCopySimilarity,
  validateEditorialOutput,
  validateFactIntegrity,
  detectRawFallbackPattern,
  createPublicationStore,
  LEG_STATUS,
  buildTelegramPublicationRequest,
  buildStructuredEconomicPublicationRequest,
  PUBLICATION_TYPES,
  DESTINATIONS,
  SOURCE_TYPES,
  BLOCK_REASONS,
  NEWS_EVENTS,
  logNewsEvent,
};
