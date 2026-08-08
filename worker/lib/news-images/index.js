const fs = require("fs");
const path = require("path");
const { isPremiumImageEvent } = require("./important-events");
const {
  readCachedImage,
  writeCachedImage,
  writeRawBackground,
  readRawBackground,
  buildCacheKey,
} = require("./cache");
const { composePremiumNewsImage } = require("./composer");
const { createNewsImageProviderRegistry } = require("./registry");
const { buildEditorialPromptBundle } = require("./editorial-intelligence");
const { buildEditorialProfile } = require("./editorial-intelligence/event-profiler");
const { resolveEditorialImageEligibility, logEditorialIdentityIneligible } = require("./editorial-identity-director/eligibility-gate");
const { resolveEditorialDomains, resolveSyntheticEventKey } = require("./editorial-identity-director/config/market-domains");
const { resolveMarketAngle } = require("./editorial-identity-director/market-context-resolver");
const { inspectRawBackgroundForTypography } = require("./background-text-guard");
const { createRawBackgroundMetadata, createComposedFinalMetadata } = require("./image-stage");

const OUTPUT_DIR = path.join(__dirname, "..", "..", ".cache", "news-images", "output");

function isPremiumImagesEnabled() {
  return process.env.NEWS_PREMIUM_IMAGES_ENABLED === "1" || process.env.NEWS_PREMIUM_IMAGES_ENABLED === "true";
}

async function inspectAndMaybeRejectOpenAiBackground(backgroundBuffer, options = {}) {
  const inspection = await inspectRawBackgroundForTypography(backgroundBuffer, options);
  if (inspection.acceptedForComposition) {
    return {
      buffer: backgroundBuffer,
      inspection,
      rejected: false,
      layoutAction: null,
    };
  }

  return {
    buffer: backgroundBuffer,
    inspection,
    rejected: true,
    layoutAction: "OPENAI_GENERATED_TYPOGRAPHY_REJECTED",
  };
}

async function switchToFallbackBackground(normalizedContext, registry, options, reason) {
  const fallback = registry.getProvider("fallback");
  const backgroundResult = await fallback.generateBackground(normalizedContext);
  return {
    ...backgroundResult,
    fallbackFrom: "openai",
    fallbackReason: reason,
    layoutAction: "OPENAI_BACKGROUND_TEXT_UNSAFE_FALLBACK",
  };
}

async function generatePremiumNewsImage(context = {}, options = {}) {
  if (!context?.eventKey) {
    return null;
  }
  if (!options.forceEnabled && !isPremiumImageEvent(context.eventKey)) {
    return null;
  }

  if (!isPremiumImagesEnabled() && !options.forceEnabled) {
    return null;
  }

  const normalizedContext = {
    eventKey: context.eventKey,
    eventName: context.eventName,
    title: context.title,
    summary: context.summary,
    sourceText: context.sourceText,
    country: context.country || "US",
    releaseTime: context.releaseTime || new Date().toISOString(),
    brandName: "Economic Newsi",
    previous: context.previous,
    forecast: context.forecast,
    actual: context.actual,
    person: context.person,
    institution: context.institution,
    importance: context.importance,
    period: context.period,
    primarySubjectType: context.primarySubjectType,
  };

  const profile = buildEditorialProfile(normalizedContext);
  if (!options.skipEligibilityCheck && !resolveEditorialImageEligibility(profile, normalizedContext)) {
    const editorialDomain = resolveEditorialDomains(profile, normalizedContext);
    const syntheticEventKey = resolveSyntheticEventKey(profile, normalizedContext);
    const marketAngle = resolveMarketAngle(profile, normalizedContext, editorialDomain, syntheticEventKey);
    logEditorialIdentityIneligible(profile, normalizedContext, marketAngle);
    return null;
  }

  const registry = options.registry || createNewsImageProviderRegistry(options);
  const providerName = options.provider || registry.resolveProviderName(options);

  let editorialOverlay = {};
  try {
    const editorial = buildEditorialPromptBundle(normalizedContext);
    editorialOverlay = {
      displayTitle: editorial.displayTitle,
      overlayPlacement: editorial.overlayPlacement,
      titlePlacement: editorial.composition?.titlePlacement,
      brandPlacement: editorial.composition?.brandPlacement,
      preferredTitlePlacement: editorial.composition?.titlePlacement,
      preferredBrandPlacement: editorial.composition?.brandPlacement || "top-left",
      primarySubjectType: editorial.visualSubjects?.primarySubjectType,
      eventName: editorial.displayTitle,
      editorialSubtitle: editorial.editorialSubtitle,
      headlineLines: editorial.headlineLines,
    };
  } catch (_error) {
    editorialOverlay = { eventName: normalizedContext.eventName };
  }

  const cached = readCachedImage(normalizedContext, options);
  if (cached?.buffer) {
    const outputPath = await persistOutputImage(cached.buffer, cached.cacheKey, options);
    return {
      filePath: outputPath,
      cacheKey: cached.cacheKey,
      provider: cached.meta?.provider || "cache",
      cached: true,
      eventName: cached.meta?.displayTitle || editorialOverlay.displayTitle || normalizedContext.eventName,
      imageStage: cached.meta?.imageStage || "composed_final",
    };
  }

  const provider = registry.getProvider(providerName);
  let backgroundResult;
  let layoutAction = null;
  let typographyInspection = null;

  try {
    backgroundResult = await provider.generateBackground(normalizedContext);
  } catch (primaryError) {
    if (providerName === "fallback") {
      throw primaryError;
    }
    backgroundResult = await switchToFallbackBackground(
      normalizedContext,
      registry,
      options,
      primaryError.message
    );
  }

  const rawMetadata = createRawBackgroundMetadata({
    provider: backgroundResult.provider,
    prompt: backgroundResult.prompt || null,
    seed: backgroundResult.seed || null,
  });
  writeRawBackground(normalizedContext, backgroundResult.backgroundBuffer, rawMetadata, options);

  if (backgroundResult.provider === "openai") {
    const typographyDecision = await inspectAndMaybeRejectOpenAiBackground(backgroundResult.backgroundBuffer, options);
    typographyInspection = typographyDecision.inspection;
    if (typographyDecision.rejected) {
      layoutAction = typographyDecision.layoutAction;
      backgroundResult = await switchToFallbackBackground(
        normalizedContext,
        registry,
        options,
        "OPENAI_BACKGROUND_TEXT_UNSAFE_FALLBACK"
      );
      writeRawBackground(
        normalizedContext,
        backgroundResult.backgroundBuffer,
        createRawBackgroundMetadata({
          provider: backgroundResult.provider,
          fallbackFrom: backgroundResult.fallbackFrom,
          fallbackReason: backgroundResult.fallbackReason,
          replacedOpenAiTypography: true,
        }),
        options
      );
    }
  }

  const composeResult = await composePremiumNewsImage(backgroundResult.backgroundBuffer, {
    ...normalizedContext,
    ...editorialOverlay,
    imageMetadata: createRawBackgroundMetadata(),
  });

  layoutAction = layoutAction || composeResult.layoutAction || null;
  const composedBuffer = composeResult.buffer;
  const cacheKey = buildCacheKey(normalizedContext);
  writeCachedImage(
    normalizedContext,
    composedBuffer,
    {
      ...createComposedFinalMetadata(),
      provider: backgroundResult.provider,
      fallbackFrom: backgroundResult.fallbackFrom || null,
      fallbackReason: backgroundResult.fallbackReason || null,
      prompt: backgroundResult.prompt || null,
      seed: backgroundResult.seed || null,
      seedSource: backgroundResult.seedSource || null,
      visualCategory: backgroundResult.visualCategory || null,
      layoutAction,
      typographyInspection,
      brandPlacement: composeResult.brandPlacement || null,
      titlePlacement: composeResult.titlePlacement || null,
      displayTitle: composeResult.displayTitle || editorialOverlay.displayTitle || null,
      headlineTypography: composeResult.headlineTypography || null,
    },
    options
  );

  const outputPath = await persistOutputImage(composedBuffer, cacheKey, options);

  return {
    filePath: outputPath,
    cacheKey,
    provider: backgroundResult.provider,
    cached: false,
    eventName: composeResult.displayTitle || editorialOverlay.displayTitle || normalizedContext.eventName,
    fallbackFrom: backgroundResult.fallbackFrom || null,
    layoutAction,
    typographyInspection,
    brandPlacement: composeResult.brandPlacement,
    titlePlacement: composeResult.titlePlacement,
    headlineTypography: composeResult.headlineTypography,
    imageStage: "composed_final",
  };
}

async function persistOutputImage(buffer, cacheKey, options = {}) {
  const outputDir = options.outputDir || OUTPUT_DIR;
  fs.mkdirSync(outputDir, { recursive: true });
  const fileName = `${cacheKey || Date.now()}.png`;
  const filePath = path.join(outputDir, fileName);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

async function resolvePremiumNewsImagePath(context = {}, options = {}) {
  const result = await generatePremiumNewsImage(context, options);
  return result?.filePath || null;
}

async function generateDeterministicBrandedFallbackImage(context = {}, options = {}) {
  return generatePremiumNewsImage(context, {
    ...options,
    forceEnabled: true,
    provider: "fallback",
    skipEligibilityCheck: true,
  });
}

module.exports = {
  OUTPUT_DIR,
  isPremiumImagesEnabled,
  generatePremiumNewsImage,
  generateDeterministicBrandedFallbackImage,
  resolvePremiumNewsImagePath,
  inspectAndMaybeRejectOpenAiBackground,
  readRawBackground,
};
