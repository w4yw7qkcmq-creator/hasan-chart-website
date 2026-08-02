#!/usr/bin/env node
/**
 * Local OpenAI premium image preview — DO NOT run in production.
 *
 * Dry-run (no API call, no cost):
 *   node worker/scripts/generate-openai-preview.cjs
 *
 * Paid preview (requires explicit approval):
 *   ALLOW_OPENAI_PREVIEW=1 \
 *   NEWS_PREMIUM_IMAGES_ENABLED=1 \
 *   NEWS_IMAGE_PROVIDER=openai \
 *   NEWS_IMAGE_OPENAI_MODEL=gpt-image-1 \
 *   NEWS_IMAGE_OPENAI_SIZE=1536x1024 \
 *   NEWS_IMAGE_OPENAI_QUALITY=low \
 *   OPENAI_API_KEY=sk-... \
 *   node worker/scripts/generate-openai-preview.cjs
 *
 * Does NOT publish to Telegram or Supabase.
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const { generatePremiumNewsImage } = require(path.join(root, "lib/news-images/index"));
const { createNewsImageProviderRegistry } = require(path.join(root, "lib/news-images/registry"));
const { buildBrandOverlaySvg } = require(path.join(root, "lib/news-images/composer"));
const {
  buildOpenAIImagePrompt,
  resolveOpenAIImageSettings,
  resolveProductionImageProviderTarget,
  resolveEmergencyImageProvider,
} = require(path.join(root, "lib/news-images/openai-prompt-builder"));

const PREVIEW_DIR = path.join(__dirname, ".tmp-openai-premium-preview");

const CONTEXT = {
  eventKey: "US_FED_RATE_DECISION",
  eventName: "Federal Reserve Interest Rate Decision",
  country: "US",
  releaseTime: "2026-09-17T18:00:00.000Z",
};

function estimateOpenAICost(settings) {
  if (settings.model === "gpt-image-1" && settings.quality === "low" && settings.size === "1536x1024") {
    return "about $0.01–0.02 USD (verify current OpenAI pricing)";
  }
  if (settings.model === "gpt-image-1" && settings.quality === "medium" && settings.size === "1536x1024") {
    return "about $0.04–0.08 USD (verify current OpenAI pricing)";
  }
  return "verify current OpenAI pricing for selected model/size/quality";
}

function buildPreviewPlan() {
  const settings = resolveOpenAIImageSettings();
  const promptBundle = buildOpenAIImagePrompt(CONTEXT);
  return {
    productionTargetProvider: resolveProductionImageProviderTarget(),
    emergencyFallbackProvider: resolveEmergencyImageProvider(),
    event: CONTEXT.eventName,
    eventKey: CONTEXT.eventKey,
    releaseTime: CONTEXT.releaseTime,
    model: settings.model,
    size: settings.size,
    quality: settings.quality,
    timeoutMs: settings.timeoutMs,
    estimatedCostUsd: estimateOpenAICost(settings),
    finalDimensions: "1200x675 after Sharp overlay",
    prompt: promptBundle.prompt,
    visualCategory: promptBundle.visualCategory,
    seedSource: promptBundle.releaseSeed,
    outputDir: PREVIEW_DIR,
    telegram: false,
    supabase: false,
    command:
      "ALLOW_OPENAI_PREVIEW=1 NEWS_PREMIUM_IMAGES_ENABLED=1 NEWS_IMAGE_PROVIDER=openai NEWS_IMAGE_OPENAI_MODEL=gpt-image-1 NEWS_IMAGE_OPENAI_SIZE=1536x1024 NEWS_IMAGE_OPENAI_QUALITY=low OPENAI_API_KEY=... node worker/scripts/generate-openai-preview.cjs",
  };
}

async function runPaidPreview(plan) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for paid preview");
  }

  fs.rmSync(PREVIEW_DIR, { recursive: true, force: true });
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });

  const registry = createNewsImageProviderRegistry();
  const result = await generatePremiumNewsImage(CONTEXT, {
    forceEnabled: true,
    provider: "openai",
    registry,
    cacheDir: path.join(PREVIEW_DIR, "cache"),
    outputDir: PREVIEW_DIR,
  });

  const dest = path.join(PREVIEW_DIR, "US_FED_RATE_DECISION-openai.png");
  fs.copyFileSync(result.filePath, dest);
  const metadata = await sharp(dest).metadata();
  const svg = buildBrandOverlaySvg(CONTEXT);

  console.log(
    "OPENAI_PREVIEW_REPORT",
    JSON.stringify(
      {
        ...plan,
        provider: result.provider,
        cached: result.cached,
        output: dest,
        width: metadata.width,
        height: metadata.height,
        bytes: fs.statSync(dest).size,
        showsEconomicNewsi: svg.includes("Economic Newsi"),
        showsHasanChart: /Hasan|Chart World|hasanchart/i.test(svg),
        showsPreviousForecastActual: /Previous|Forecast|Actual|السابق|المتوقع|الحالي/i.test(svg),
      },
      null,
      2
    )
  );
}

async function run() {
  const plan = buildPreviewPlan();

  if (process.env.ALLOW_OPENAI_PREVIEW !== "1") {
    console.log("OPENAI_PREVIEW_PLAN", JSON.stringify(plan, null, 2));
    return;
  }

  await runPaidPreview(plan);
}

run().catch((error) => {
  console.error("OPENAI_PREVIEW_FAILED", error.message);
  process.exit(1);
});
