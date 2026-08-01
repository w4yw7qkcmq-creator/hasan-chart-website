const fs = require("fs");
const path = require("path");
const { isPremiumImageEvent } = require("./important-events");
const { readCachedImage, writeCachedImage, buildCacheKey } = require("./cache");
const { composePremiumNewsImage } = require("./composer");
const { createNewsImageProviderRegistry } = require("./registry");

const OUTPUT_DIR = path.join(__dirname, "..", "..", ".cache", "news-images", "output");

function isPremiumImagesEnabled() {
  return process.env.NEWS_PREMIUM_IMAGES_ENABLED === "1" || process.env.NEWS_PREMIUM_IMAGES_ENABLED === "true";
}

async function generatePremiumNewsImage(context = {}, options = {}) {
  if (!context?.eventKey || !isPremiumImageEvent(context.eventKey)) {
    return null;
  }

  if (!isPremiumImagesEnabled() && !options.forceEnabled) {
    return null;
  }

  const normalizedContext = {
    eventKey: context.eventKey,
    eventName: context.eventName,
    country: context.country || "US",
    releaseTime: context.releaseTime || new Date().toISOString(),
    brandName: "Economic Newsi",
  };

  const cached = readCachedImage(normalizedContext, options);
  if (cached?.buffer) {
    const outputPath = await persistOutputImage(cached.buffer, cached.cacheKey, options);
    return {
      filePath: outputPath,
      cacheKey: cached.cacheKey,
      provider: cached.meta?.provider || "cache",
      cached: true,
      eventName: normalizedContext.eventName,
    };
  }

  const registry = options.registry || createNewsImageProviderRegistry(options);
  const providerName = options.provider || registry.resolveProviderName(options);
  const provider = registry.getProvider(providerName);

  let backgroundResult;
  try {
    backgroundResult = await provider.generateBackground(normalizedContext);
  } catch (primaryError) {
    if (providerName === "fallback") {
      throw primaryError;
    }
    const fallback = registry.getProvider("fallback");
    backgroundResult = await fallback.generateBackground(normalizedContext);
    backgroundResult.fallbackFrom = providerName;
    backgroundResult.fallbackReason = primaryError.message;
  }

  const composedBuffer = await composePremiumNewsImage(backgroundResult.backgroundBuffer, normalizedContext);
  const cacheKey = buildCacheKey(normalizedContext);
  writeCachedImage(
    normalizedContext,
    composedBuffer,
    {
      provider: backgroundResult.provider,
      fallbackFrom: backgroundResult.fallbackFrom || null,
      prompt: backgroundResult.prompt || null,
    },
    options
  );

  const outputPath = await persistOutputImage(composedBuffer, cacheKey, options);

  return {
    filePath: outputPath,
    cacheKey,
    provider: backgroundResult.provider,
    cached: false,
    eventName: normalizedContext.eventName,
    fallbackFrom: backgroundResult.fallbackFrom || null,
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

module.exports = {
  OUTPUT_DIR,
  isPremiumImagesEnabled,
  generatePremiumNewsImage,
  resolvePremiumNewsImagePath,
};
