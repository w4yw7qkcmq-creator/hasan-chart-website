#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const outputDir = path.join(__dirname, ".tmp-final-headline-preview");

const { composePremiumNewsImage } = require(path.join(root, "lib/news-images/composer"));
const { createFallbackImageProvider } = require(path.join(root, "lib/news-images/fallback-image-provider"));
const { inspectRawBackgroundForTypography } = require(path.join(root, "lib/news-images/background-text-guard"));
const { readRawBackground, buildCacheKey } = require(path.join(root, "lib/news-images/cache"));
const { createRawBackgroundMetadata } = require(path.join(root, "lib/news-images/image-stage"));
const { assertSingleBrandOverlay } = require(path.join(root, "lib/news-images/image-stage"));

const PREVIEW_SOURCES = {
  nfp: {
    eventKey: "US_NFP",
    eventName: "Non Farm Payrolls",
    country: "US",
    releaseTime: "2026-09-05T12:30:00.000Z",
    outputName: "04-us-nfp-final.png",
    composedFallbackPath: path.join(__dirname, ".tmp-final-editorial-visual-tests", "04-us-nfp.png"),
  },
  fed: {
    eventKey: "US_FED_RATE_DECISION",
    eventName: "Federal Reserve Interest Rate Decision",
    country: "US",
    releaseTime: "2026-09-17T18:00:00.000Z",
    outputName: "01-fed-final.png",
    composedFallbackPath: path.join(__dirname, ".tmp-final-editorial-visual-tests", "01-fed-rate-decision.png"),
  },
};

async function composeFromBackground(backgroundBuffer, context) {
  return composePremiumNewsImage(backgroundBuffer, context, {
    imageMetadata: createRawBackgroundMetadata(),
  });
}

async function buildPreview(key) {
  const spec = PREVIEW_SOURCES[key];
  const report = {
    key,
    eventKey: spec.eventKey,
    rawBackgroundAvailable: false,
    rawTypographyDetected: false,
    layoutAction: null,
    headline: null,
    brandGuard: null,
    outputPath: null,
  };

  const rawCached = readRawBackground(spec, { cacheDir: path.join(root, ".cache", "news-images") });
  let backgroundBuffer = null;

  if (rawCached?.buffer) {
    report.rawBackgroundAvailable = true;
    backgroundBuffer = rawCached.buffer;
    const inspection = await inspectRawBackgroundForTypography(backgroundBuffer);
    report.rawTypographyDetected = inspection.probableTextDetected;
    report.typographyInspection = inspection;
    if (inspection.probableTextDetected) {
      report.layoutAction = "OPENAI_GENERATED_TYPOGRAPHY_REJECTED";
    }
  } else if (fs.existsSync(spec.composedFallbackPath)) {
    report.note = "RAW_BACKGROUND_NOT_AVAILABLE";
    report.layoutAction = "RAW_BACKGROUND_NOT_AVAILABLE";
  } else {
    report.note = "RAW_BACKGROUND_NOT_AVAILABLE";
    report.layoutAction = "RAW_BACKGROUND_NOT_AVAILABLE";
  }

  if (!backgroundBuffer || report.rawTypographyDetected) {
    const fallback = createFallbackImageProvider();
    const fallbackResult = await fallback.generateBackground(spec);
    backgroundBuffer = fallbackResult.backgroundBuffer;
    if (report.rawTypographyDetected) {
      report.layoutAction = "OPENAI_BACKGROUND_TEXT_UNSAFE_FALLBACK";
    }
  }

  const composed = await composeFromBackground(backgroundBuffer, {
    ...spec,
    eventKey: spec.eventKey,
  });

  report.headline = composed.displayTitle;
  report.headlineTypography = composed.headlineTypography;
  report.brandPlacement = composed.brandPlacement;
  report.titlePlacement = composed.titlePlacement;
  report.brandGuard = assertSingleBrandOverlay(
    require(path.join(root, "lib/news-images/composer")).buildBrandOverlaySvg(
      { ...spec, displayTitle: composed.displayTitle },
      composed.adaptiveLayout
    )
  );

  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, spec.outputName);
  fs.writeFileSync(outputPath, composed.buffer);
  report.outputPath = outputPath;
  report.cacheKey = buildCacheKey(spec);
  return report;
}

async function main() {
  const reports = [];
  for (const key of ["fed", "nfp"]) {
    reports.push(await buildPreview(key));
  }

  const summaryPath = path.join(outputDir, "final-headline-preview-report.json");
  fs.writeFileSync(summaryPath, JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2));
  console.log("FINAL_HEADLINE_PREVIEW_DONE", JSON.stringify({ outputDir, reports }, null, 2));
}

main().catch((error) => {
  console.error("FINAL_HEADLINE_PREVIEW_FAILED", error.message);
  process.exit(1);
});
