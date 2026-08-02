#!/usr/bin/env node
/**
 * Local NFP text-guard cleanup preview — no OpenAI calls.
 *
 *   node worker/scripts/fix-nfp-text-guard-preview.cjs
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const { composePremiumNewsImage, buildBrandOverlaySvg, resolveOfficialDisplayTitle } = require(path.join(root, "lib/news-images/composer"));
const { applySafeZoneCovers, inspectGeneratedBackground } = require(path.join(root, "lib/news-images/background-text-guard"));
const { resolveSafeZones } = require(path.join(root, "lib/news-images/overlay-safe-zones"));
const { buildCoverSvg } = require(path.join(root, "lib/news-images/background-text-guard"));

const SOURCE_IMAGE = path.join(__dirname, ".tmp-final-editorial-visual-tests", "04-us-nfp.png");
const OUTPUT_DIR = path.join(__dirname, ".tmp-text-guard-preview");
const OUTPUT_IMAGE = path.join(OUTPUT_DIR, "04-us-nfp-cleaned.png");

const OVERLAY_CONTEXT = {
  eventKey: "US_NFP",
  eventName: "US Nonfarm Payrolls",
  displayTitle: "US Nonfarm Payrolls",
  titlePlacement: "overlay-lower-left",
  overlayPlacement: "overlay-lower-left",
};

async function coverHeadlineBand(sharp, buffer) {
  const headlineBand = { x: 0, y: 300, width: 1200, height: 180 };
  const cover = buildCoverSvg(headlineBand, { blurStrength: 22, opacity: 0.78 });
  return sharp(buffer)
    .composite([{ input: cover, top: headlineBand.y, left: headlineBand.x }])
    .png()
    .toBuffer();
}

async function run() {
  if (!fs.existsSync(SOURCE_IMAGE)) {
    throw new Error(`Missing source image: ${SOURCE_IMAGE}`);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const sourceBuffer = fs.readFileSync(SOURCE_IMAGE);
  const safeZones = resolveSafeZones(OVERLAY_CONTEXT);

  const beforeInspection = await inspectGeneratedBackground(sourceBuffer, OVERLAY_CONTEXT, { sharp });
  let cleaned = sourceBuffer;

  cleaned = await coverHeadlineBand(sharp, cleaned);

  const inspectionForCover = {
    intersectsBrandZone: true,
    intersectsTitleZone: true,
    safeZones,
  };
  const covered = await applySafeZoneCovers(sharp, cleaned, inspectionForCover);
  cleaned = covered.buffer;

  const composed = await composePremiumNewsImage(cleaned, OVERLAY_CONTEXT, {
    sharp,
    skipTextGuard: true,
  });

  fs.writeFileSync(OUTPUT_IMAGE, composed.buffer);

  const metadata = await sharp(OUTPUT_IMAGE).metadata();
  const svg = buildBrandOverlaySvg(OVERLAY_CONTEXT);
  const officialTitle = resolveOfficialDisplayTitle(OVERLAY_CONTEXT);

  console.log(
    "NFP_TEXT_GUARD_PREVIEW",
    JSON.stringify(
      {
        sourceImage: SOURCE_IMAGE,
        outputImage: OUTPUT_IMAGE,
        beforeInspection: {
          detected: beforeInspection.detected,
          confidence: beforeInspection.confidence,
          action: beforeInspection.action,
          intersectsTitleZone: beforeInspection.intersectsTitleZone,
        },
        coveredZones: ["headlineBand", ...covered.covered],
        officialTitle,
        overlayContainsOfficialTitle: svg.includes(officialTitle),
        overlayContainsHasanChart: /Hasan|Chart World|hasanchart/i.test(svg),
        openAiRetry: false,
        width: metadata.width,
        height: metadata.height,
        bytes: fs.statSync(OUTPUT_IMAGE).size,
        visualVerdict: "VISUAL REVIEW REQUIRED",
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error("NFP_TEXT_GUARD_PREVIEW_FAILED", error.message);
  process.exit(1);
});
