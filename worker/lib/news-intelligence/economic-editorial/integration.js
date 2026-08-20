const { SOURCE_TYPES, PUBLICATION_TYPES } = require("../publication-types");
const { buildPhase2PublicationRequest, getDefaultFamilyCoordinator } = require("./pipeline");
const { createPhase2BrandedFallback } = require("./branded-fallback");
const {
  isPhase2EditorialEnabled,
  isPhase2AiEnabled,
  getPhase2RuntimeConfig,
} = require("./runtime-config");

async function maybeApplyPhase2Editorial(publication, deps = {}) {
  if (!isPhase2EditorialEnabled(deps)) {
    return { ok: true, publication, runtime: getPhase2RuntimeConfig(deps) };
  }

  const isEconomicRelease =
    publication.publicationType === PUBLICATION_TYPES.RELEASE &&
    (publication.sourceType === SOURCE_TYPES.TELEGRAM_ECONOMIC ||
      publication.eventType ||
      publication.facts?.actual);

  if (!isEconomicRelease) {
    return { ok: true, publication, runtime: getPhase2RuntimeConfig(deps) };
  }

  const aiEnabled = isPhase2AiEnabled(deps);
  const brandedFallback = deps.createBrandedFallback || null;

  const phase2 = await buildPhase2PublicationRequest(publication, {
    disableAi: !aiEnabled,
    openAiClient: aiEnabled ? deps.openAiClient || null : null,
    forceAi: deps.forcePhase2Ai === true,
    testMode: deps.dryRun === true || deps.testMode === true,
    allowPlaceholderImage: deps.dryRun === true || deps.allowPlaceholderImage === true,
    coordinator: deps.familyCoordinator || getDefaultFamilyCoordinator(),
    skipFamilyAggregation: deps.skipFamilyAggregation === true,
    rawSourceText: publication.rawSourceText || null,
    createCategoryVisual: deps.createCategoryVisual,
    createBrandedFallback: brandedFallback,
    sourceImageUrl: publication.imageUrl || null,
  });

  if (!phase2.ok) {
    return { ...phase2, runtime: getPhase2RuntimeConfig(deps) };
  }

  return {
    ok: true,
    publication: phase2.publication,
    pipeline: phase2.pipeline,
    runtime: getPhase2RuntimeConfig(deps),
  };
}

module.exports = {
  isPhase2EditorialEnabled,
  isPhase2AiEnabled,
  getPhase2RuntimeConfig,
  maybeApplyPhase2Editorial,
};
