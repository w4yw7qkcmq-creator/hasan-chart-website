const fs = require("fs");
const path = require("path");
const { generateDeterministicBrandedFallbackImage } = require("../../news-images");

const FAMILY_IMAGE_EVENT_KEY = {
  US_WEEKLY_LABOR_CLAIMS: "US_INITIAL_JOBLESS_CLAIMS",
};

function resolveImageEventKey(ctx = {}) {
  const candidates = [ctx.eventType, ctx.eventFamily, "US_INITIAL_JOBLESS_CLAIMS"];
  for (const key of candidates) {
    if (!key) continue;
    if (FAMILY_IMAGE_EVENT_KEY[key]) {
      return FAMILY_IMAGE_EVENT_KEY[key];
    }
    return key;
  }
  return "US_INITIAL_JOBLESS_CLAIMS";
}

async function createPhase2BrandedFallback(ctx = {}) {
  const eventKey = resolveImageEventKey(ctx);
  const headline = ctx.headline || ctx.eventType || eventKey;
  const result = await generateDeterministicBrandedFallbackImage({
    eventKey,
    eventName: headline,
    title: headline,
    country: ctx.country || "US",
    releaseTime: ctx.releaseTime || new Date().toISOString(),
    importance: ctx.importance || "HIGH",
    brandName: "HasaN CharT World",
  });

  const filePath = result?.filePath;
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  const stat = fs.statSync(filePath);
  if (!stat.size) {
    return null;
  }

  return { path: filePath, meta: { source: "branded_fallback", provider: result.provider || "fallback" } };
}

module.exports = {
  resolveImageEventKey,
  createPhase2BrandedFallback,
};
