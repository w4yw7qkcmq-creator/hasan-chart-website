#!/usr/bin/env node
/**
 * Adaptive layout NFP comparison preview — no OpenAI calls.
 *
 *   node worker/scripts/generate-adaptive-layout-preview.cjs
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const { composePremiumNewsImage, resolveAdaptiveTitleTypography } = require(path.join(root, "lib/news-images/composer"));
const { resolveAdaptiveLayout } = require(path.join(root, "lib/news-images/adaptive-overlay-layout"));
const { createFallbackImageProvider } = require(path.join(root, "lib/news-images/fallback-image-provider"));

const OUTPUT_DIR = path.join(__dirname, ".tmp-adaptive-layout-preview");
const SOURCE_ORIGINAL = path.join(__dirname, ".tmp-final-editorial-visual-tests", "04-us-nfp.png");
const SOURCE_TEXT_GUARD = path.join(__dirname, ".tmp-text-guard-preview", "04-us-nfp-cleaned.png");

const CONTEXT = {
  eventKey: "US_NFP",
  eventName: "US Nonfarm Payrolls",
  displayTitle: "US Nonfarm Payrolls",
  preferredTitlePlacement: "lower-left",
  preferredBrandPlacement: "top-left",
  primarySubjectType: "institution",
};

async function copyIfExists(source, dest) {
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, dest);
    return true;
  }
  return false;
}

async function run() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const copiedOriginal = copyIfExists(SOURCE_ORIGINAL, path.join(OUTPUT_DIR, "A-original-openai-overlay.png"));
  const copiedTextGuard = copyIfExists(SOURCE_TEXT_GUARD, path.join(OUTPUT_DIR, "B-text-guard-cleaned.png"));

  let sourceBuffer = null;
  let sourceLabel = "missing";
  if (fs.existsSync(SOURCE_ORIGINAL)) {
    sourceBuffer = fs.readFileSync(SOURCE_ORIGINAL);
    sourceLabel = "final_editorial_composed_image";
  }

  let layout = null;
  let composed = null;
  let fallbackUsed = false;

  if (sourceBuffer) {
    layout = await resolveAdaptiveLayout(sourceBuffer, CONTEXT);
    if (layout.requiresFallback) {
      fallbackUsed = true;
      const fallback = createFallbackImageProvider();
      const fallbackBackground = await fallback.generateBackground({
        eventKey: CONTEXT.eventKey,
        eventName: CONTEXT.eventName,
        releaseTime: "2026-08-05T12:30:00.000Z",
      });
      layout = await resolveAdaptiveLayout(fallbackBackground.backgroundBuffer, CONTEXT);
      composed = await composePremiumNewsImage(fallbackBackground.backgroundBuffer, CONTEXT, { adaptiveLayout: layout });
    } else {
      composed = await composePremiumNewsImage(sourceBuffer, CONTEXT, { adaptiveLayout: layout });
    }
  } else {
    fallbackUsed = true;
    const fallback = createFallbackImageProvider();
    const fallbackBackground = await fallback.generateBackground({
      eventKey: CONTEXT.eventKey,
      eventName: CONTEXT.eventName,
      releaseTime: "2026-08-05T12:30:00.000Z",
    });
    layout = await resolveAdaptiveLayout(fallbackBackground.backgroundBuffer, CONTEXT);
    composed = await composePremiumNewsImage(fallbackBackground.backgroundBuffer, CONTEXT, { adaptiveLayout: layout });
  }

  const outputPath = path.join(OUTPUT_DIR, "C-adaptive-layout.png");
  const aliasPath = path.join(OUTPUT_DIR, "04-us-nfp-adaptive.png");
  fs.writeFileSync(outputPath, composed.buffer);
  fs.copyFileSync(outputPath, aliasPath);

  const typography = resolveAdaptiveTitleTypography({
    title: CONTEXT.displayTitle,
    zoneWidth: layout.titleCandidate?.zone?.width || 620,
    zoneHeight: layout.titleCandidate?.zone?.height || 140,
  });
  const metadata = await sharp(composed.buffer).metadata();

  const report = {
    sourceLabel,
    copiedOriginal,
    copiedTextGuard,
    outputDir: OUTPUT_DIR,
    adaptiveOutput: aliasPath,
    comparison: {
      A: copiedOriginal ? path.join(OUTPUT_DIR, "A-original-openai-overlay.png") : null,
      B: copiedTextGuard ? path.join(OUTPUT_DIR, "B-text-guard-cleaned.png") : null,
      C: aliasPath,
    },
    metrics: {
      selectedTitlePlacement: layout.selectedTitlePlacement,
      selectedBrandPlacement: layout.selectedBrandPlacement,
      score: layout.score,
      brandScore: layout.brandScore,
      typographyRegionsDetected: layout.probableTextRegions?.length || 0,
      typographyConfidence: layout.typographyConfidence,
      overlapScore: layout.alternatives?.[0]?.textOverlapScore || 0,
      subjectOverlapScore: layout.alternatives?.[0]?.subjectOverlapScore || 0,
      cropApplied: Boolean(layout.requiresCrop),
      fallbackUsed,
      titleFontSizeBefore: 48,
      titleFontSizeAfter: typography.fontSize,
      titleReductionRatio: typography.reductionRatio,
      finalDimensions: `${metadata.width}x${metadata.height}`,
      bytes: fs.statSync(aliasPath).size,
    },
    openAiRetry: false,
    visualVerdict: "VISUAL REVIEW REQUIRED",
  };

  fs.writeFileSync(path.join(OUTPUT_DIR, "adaptive-layout-report.json"), JSON.stringify(report, null, 2));
  console.log("ADAPTIVE_LAYOUT_PREVIEW", JSON.stringify(report, null, 2));
}

run().catch((error) => {
  console.error("ADAPTIVE_LAYOUT_PREVIEW_FAILED", error.message);
  process.exit(1);
});
