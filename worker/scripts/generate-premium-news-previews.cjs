#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const { generatePremiumNewsImage } = require(path.join(root, "lib/news-images/index"));
const { createNewsImageProviderRegistry } = require(path.join(root, "lib/news-images/registry"));
const { buildBrandOverlaySvg } = require(path.join(root, "lib/news-images/composer"));
const { buildCacheKey, readCachedImage } = require(path.join(root, "lib/news-images/cache"));
const { buildReleaseSeed, resolveVisualCategory, hashSeed } = require(path.join(root, "lib/news-images/fallback-visual-themes"));

const PREVIEW_DIR = path.join(__dirname, ".tmp-premium-news-previews");
const CACHE_DIR = path.join(PREVIEW_DIR, "cache");

const PREVIEW_SPECS = [
  { eventKey: "US_CPI_MOM", eventName: "US CPI", releaseTime: "2026-08-12T12:30:00.000Z" },
  { eventKey: "US_NFP", eventName: "Non Farm Payrolls", releaseTime: "2026-09-05T12:30:00.000Z" },
  {
    eventKey: "US_FED_RATE_DECISION",
    eventName: "Federal Reserve Interest Rate Decision",
    releaseTime: "2026-09-17T18:00:00.000Z",
  },
  { eventKey: "US_INITIAL_JOBLESS_CLAIMS", eventName: "Initial Jobless Claims", releaseTime: "2026-08-07T12:30:00.000Z" },
  { eventKey: "US_CORE_PCE_MOM", eventName: "Core PCE", releaseTime: "2026-08-29T12:30:00.000Z" },
];

function fileHash(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function inspectImage(filePath, context) {
  const stats = fs.statSync(filePath);
  const metadata = await sharp(filePath).metadata();
  const svg = buildBrandOverlaySvg({ eventName: context.eventName });
  const seedSource = buildReleaseSeed(context);
  const cacheKey = buildCacheKey(context);

  return {
    eventName: context.eventName,
    eventKey: context.eventKey,
    releaseTime: context.releaseTime,
    cacheKey,
    seed: hashSeed(seedSource),
    seedSource,
    visualCategory: resolveVisualCategory(context.eventKey),
    file: path.basename(filePath),
    width: metadata.width,
    height: metadata.height,
    bytes: stats.size,
    sha256: fileHash(filePath).slice(0, 16),
    showsEconomicNewsi: svg.includes("Economic Newsi"),
    showsHasanChart: /Hasan|Chart World|hasanchart/i.test(svg),
    showsPreviousForecastActual: /Previous|Forecast|Actual|السابق|المتوقع|الحالي/i.test(svg),
    showsDataNumbers: />([^<]*\d+(?:\.\d+)?%[^<]*)</.test(svg),
    titleClear: svg.includes(context.eventName.split(" ").slice(0, 2).join(" ")) || svg.includes(context.eventName),
    logoInSafeArea: svg.includes('x="64" y="56"'),
    telegramAspectOk: metadata.width === 1200 && metadata.height === 675,
  };
}

async function generatePreview(context, registry, label) {
  const result = await generatePremiumNewsImage(context, {
    forceEnabled: true,
    provider: "fallback",
    registry,
    cacheDir: CACHE_DIR,
    outputDir: PREVIEW_DIR,
  });

  if (!result?.filePath) {
    return { label, error: "generation_failed" };
  }

  const dest = path.join(PREVIEW_DIR, `${label}.png`);
  fs.copyFileSync(result.filePath, dest);
  const report = await inspectImage(dest, context);
  return { ...report, label, cached: result.cached, provider: result.provider };
}

async function runCpiRepeatTest(registry) {
  const baseContext = {
    eventKey: "US_CPI_MOM",
    eventName: "US CPI",
    country: "US",
  };

  const contexts = [
    { ...baseContext, releaseTime: "2026-08-12T12:30:00.000Z", label: "CPI-A" },
    { ...baseContext, releaseTime: "2026-09-11T12:30:00.000Z", label: "CPI-B" },
    { ...baseContext, releaseTime: "2026-08-12T12:30:00.000Z", label: "CPI-C" },
  ];

  let generationCalls = 0;
  const results = [];
  for (const item of contexts) {
    const result = await generatePremiumNewsImage(item, {
      forceEnabled: true,
      provider: "fallback",
      registry,
      cacheDir: CACHE_DIR,
      outputDir: PREVIEW_DIR,
    });
    if (!result?.cached) {
      generationCalls += 1;
    }
    const dest = path.join(PREVIEW_DIR, `${item.label}.png`);
    fs.copyFileSync(result.filePath, dest);
    results.push({
      label: item.label,
      releaseTime: item.releaseTime,
      cached: result.cached,
      sha256: fileHash(dest).slice(0, 16),
      cacheKey: result.cacheKey,
    });
  }

  const [a, b, c] = results;
  return {
    results,
    generationCalls,
    aDiffersFromB: a.sha256 !== b.sha256,
    aMatchesC: a.sha256 === c.sha256,
    cWasCacheHit: c.cached === true,
    cachePreventedThirdGeneration: generationCalls === 2,
  };
}

async function run() {
  fs.rmSync(PREVIEW_DIR, { recursive: true, force: true });
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });

  const registry = createNewsImageProviderRegistry();
  const previews = [];

  for (const spec of PREVIEW_SPECS) {
    previews.push(
      await generatePreview(
        {
          eventKey: spec.eventKey,
          eventName: spec.eventName,
          country: "US",
          releaseTime: spec.releaseTime,
        },
        registry,
        spec.eventKey
      )
    );
  }

  const uniqueHashes = new Set(previews.filter((p) => p.sha256).map((p) => p.sha256));
  const cpiRepeat = await runCpiRepeatTest(registry);

  console.log(
    "PREMIUM_NEWS_PREVIEW_REPORT",
    JSON.stringify(
      {
        previewDir: PREVIEW_DIR,
        previews,
        allFiveDistinct: uniqueHashes.size === previews.filter((p) => p.sha256).length,
        cpiRepeat,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error("PREMIUM_NEWS_PREVIEW_FAILED", error.message);
  process.exit(1);
});
