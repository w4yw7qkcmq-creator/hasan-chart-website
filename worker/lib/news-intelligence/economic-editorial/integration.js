const { SOURCE_TYPES, PUBLICATION_TYPES } = require("../publication-types");
const { buildPhase2PublicationRequest, getDefaultFamilyCoordinator } = require("./pipeline");
const { createPhase2BrandedFallback } = require("./branded-fallback");

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT === "production";
}

function isPhase2EditorialEnabled(options = {}) {
  if (options.skipPhase2Editorial === true) {
    return false;
  }
  if (options.enablePhase2Editorial === true) {
    return true;
  }
  return process.env.NEWS_PHASE2_EDITORIAL === "1";
}

function isPhase2AiEnabled(options = {}) {
  if (options.forcePhase2Ai === true) {
    return Boolean(options.openAiClient);
  }
  if (options.enablePhase2Ai === true) {
    return Boolean(options.openAiClient);
  }
  return false;
}

function getPhase2RuntimeConfig(options = {}) {
  const editorialEnabled = isPhase2EditorialEnabled(options);
  const aiEnabled = editorialEnabled && isPhase2AiEnabled(options);
  return {
    phase2Editorial: editorialEnabled,
    phase2Ai: aiEnabled,
    productionRuntime: isProductionRuntime(),
    envFlag: process.env.NEWS_PHASE2_EDITORIAL || null,
  };
}

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
  const brandedFallback =
    deps.createBrandedFallback ||
    (typeof deps.createNewsCard === "function"
      ? async (ctx) => {
          const fromCard = await deps.createNewsCard(
            ctx.headline || ctx.eventType,
            null,
            ctx.importance || "HIGH",
            ctx.premiumImageContext || publication.metadata?.premiumImageContext
          );
          if (fromCard) {
            return { path: fromCard };
          }
          return createPhase2BrandedFallback(ctx);
        }
      : createPhase2BrandedFallback);

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
