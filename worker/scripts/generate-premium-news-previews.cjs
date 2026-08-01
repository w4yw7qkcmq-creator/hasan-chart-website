#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const { generatePremiumNewsImage } = require(path.join(root, "lib/news-images/index"));
const { createNewsImageProviderRegistry } = require(path.join(root, "lib/news-images/registry"));
const { buildBrandOverlaySvg } = require(path.join(root, "lib/news-images/composer"));

const PREVIEW_DIR = path.join(__dirname, ".tmp-premium-news-previews");
const PREVIEW_SPECS = [
  { eventKey: "US_CPI_MOM", eventName: "US CPI" },
  { eventKey: "US_NFP", eventName: "Non Farm Payrolls" },
  { eventKey: "US_FED_RATE_DECISION", eventName: "Federal Reserve Interest Rate Decision" },
  { eventKey: "US_CORE_PCE_MOM", eventName: "Core PCE" },
  { eventKey: "US_INITIAL_JOBLESS_CLAIMS", eventName: "Initial Jobless Claims" },
];

async function inspectImage(filePath, eventName) {
  const stats = fs.statSync(filePath);
  const metadata = await sharp(filePath).metadata();
  const svg = buildBrandOverlaySvg({ eventName });

  return {
    eventName,
    file: path.basename(filePath),
    width: metadata.width,
    height: metadata.height,
    bytes: stats.size,
    format: metadata.format,
    showsEconomicNewsi: svg.includes("Economic Newsi"),
    showsHasanChart: /Hasan|Chart World|hasanchart/i.test(svg),
    showsPreviousForecastActual: /Previous|Forecast|Actual/i.test(svg),
    telegramAspectOk: metadata.width >= 1200 && metadata.height >= 675,
    logoInSafeArea: svg.includes('x="64" y="56"'),
  };
}

async function run() {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  const registry = createNewsImageProviderRegistry();
  const releaseTime = "2026-08-02T10:00:00.000Z";
  const reports = [];

  for (const spec of PREVIEW_SPECS) {
    const result = await generatePremiumNewsImage(
      {
        eventKey: spec.eventKey,
        eventName: spec.eventName,
        country: "US",
        releaseTime,
      },
      {
        forceEnabled: true,
        provider: "fallback",
        registry,
        cacheDir: path.join(PREVIEW_DIR, "cache"),
        outputDir: PREVIEW_DIR,
      }
    );

    if (!result?.filePath) {
      reports.push({ eventName: spec.eventName, error: "generation_failed" });
      continue;
    }

    const dest = path.join(PREVIEW_DIR, `${spec.eventKey}.png`);
    fs.copyFileSync(result.filePath, dest);
    reports.push(await inspectImage(dest, spec.eventName));
  }

  console.log("PREMIUM_NEWS_PREVIEW_REPORT", JSON.stringify({ previews: reports }, null, 2));
}

run().catch((error) => {
  console.error("PREMIUM_NEWS_PREVIEW_FAILED", error.message);
  process.exit(1);
});
