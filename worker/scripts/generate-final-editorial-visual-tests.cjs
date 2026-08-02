#!/usr/bin/env node
/**
 * Final editorial visual tests — exactly 5 OpenAI calls, no Telegram/Supabase.
 *
 * Dry-run:
 *   node worker/scripts/generate-final-editorial-visual-tests.cjs
 *
 * Paid run (max 5 OpenAI requests, no auto-retry):
 *   ALLOW_FINAL_VISUAL_TESTS=1 \
 *   NEWS_IMAGE_PROVIDER=openai \
 *   NEWS_IMAGE_OPENAI_MODEL=gpt-image-1 \
 *   NEWS_IMAGE_OPENAI_SIZE=1536x1024 \
 *   NEWS_IMAGE_OPENAI_QUALITY=low \
 *   OPENAI_API_KEY=sk-... \
 *   node worker/scripts/generate-final-editorial-visual-tests.cjs
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const { createOpenAIImageProvider } = require(path.join(root, "lib/news-images/openai-image-provider"));
const { composePremiumNewsImage, buildBrandOverlaySvg } = require(path.join(root, "lib/news-images/composer"));
const { buildEditorialPromptBundle } = require(path.join(root, "lib/news-images/editorial-intelligence"));
const { buildOpenAIImagePrompt, resolveOpenAIImageSettings } = require(path.join(root, "lib/news-images/openai-prompt-builder"));
const { buildCacheKey } = require(path.join(root, "lib/news-images/cache"));

const OUTPUT_DIR = path.join(__dirname, ".tmp-final-editorial-visual-tests");
const REPORT_PATH = path.join(OUTPUT_DIR, "final-visual-test-report.json");

const PREVIEWS = [
  {
    fileName: "01-fed-rate-decision.png",
    eventKey: "US_FED_RATE_DECISION",
    eventName: "Federal Reserve Interest Rate Decision",
    country: "US",
    releaseTime: "2026-08-01T18:00:00.000Z",
    sourceText: "The Federal Reserve kept rates unchanged at its latest FOMC meeting.",
  },
  {
    fileName: "02-powell-speech.png",
    eventKey: "US_POWELL_SPEECH",
    eventName: "Federal Reserve Press Conference",
    country: "US",
    releaseTime: "2026-08-02T18:30:00.000Z",
    sourceText: "Jerome Powell holds a press conference following the FOMC decision.",
  },
  {
    fileName: "03-us-cpi.png",
    eventKey: "US_CPI_MOM",
    eventName: "US Consumer Price Index",
    country: "US",
    releaseTime: "2026-08-03T12:30:00.000Z",
    previous: "0.2%",
    forecast: "0.3%",
    actual: "0.4%",
  },
  {
    fileName: "04-us-nfp.png",
    eventKey: "US_NFP",
    eventName: "Non Farm Payrolls",
    country: "US",
    releaseTime: "2026-08-05T12:30:00.000Z",
  },
  {
    fileName: "05-ecb-rate-decision.png",
    eventKey: "ECB_RATE_DECISION",
    eventName: "ECB Interest Rate Decision",
    country: "EUROZONE",
    releaseTime: "2026-08-07T12:45:00.000Z",
  },
];

function hashPrompt(prompt) {
  return crypto.createHash("sha1").update(String(prompt || "")).digest("hex");
}

function estimateCost(settings, count) {
  if (settings.model === "gpt-image-1" && settings.quality === "low" && settings.size === "1536x1024") {
    return `about $${(0.015 * count).toFixed(3)}–$${(0.02 * count).toFixed(3)} USD (verify current OpenAI pricing)`;
  }
  return "verify current OpenAI pricing";
}

function buildPlan() {
  const settings = resolveOpenAIImageSettings();
  return {
    outputDir: OUTPUT_DIR,
    openAiRequestLimit: 5,
    settings,
    estimatedCostUsd: estimateCost(settings, 5),
    previews: PREVIEWS.map((preview) => {
      const bundle = buildEditorialPromptBundle(preview);
      const promptBundle = buildOpenAIImagePrompt(preview);
      return {
        ...preview,
        displayTitle: bundle.displayTitle,
        person: bundle.entities.person?.id || null,
        institution: bundle.entities.institution?.id || null,
        countryResolved: bundle.entities.country?.id || null,
        markets: bundle.entities.markets.map((market) => market.id),
        overlayPlacement: bundle.overlayPlacement,
        titlePlacement: bundle.composition.titlePlacement,
        validationOk: bundle.validation.ok,
        promptHash: hashPrompt(promptBundle.prompt),
        promptPreview: promptBundle.prompt.slice(0, 220) + "...",
      };
    }),
  };
}

function runAutomatedChecks({ prompt, svg, bundle, context }) {
  const issues = [];
  if (!bundle.validation.ok) {
    issues.push(`validation_failed:${bundle.validation.issues.join("|")}`);
  }
  if (/Previous|Forecast|Actual|\b\d+(?:\.\d+)?%/.test(prompt)) {
    issues.push("result_values_in_prompt");
  }
  if (/Hasan|Chart World|hasanchart|t\.me|http/i.test(prompt) || /Hasan|Chart World|hasanchart/i.test(svg)) {
    issues.push("brand_or_source_leak");
  }
  if (context.eventKey === "US_FED_RATE_DECISION" && bundle.entities.person) {
    issues.push("unexpected_powell_on_fomc");
  }
  if (context.eventKey === "US_POWELL_SPEECH" && bundle.entities.person?.id !== "JEROME_POWELL") {
    issues.push("missing_powell_on_speech");
  }
  if (context.eventKey === "US_CPI_MOM" && bundle.entities.institution?.id !== "US_BLS") {
    issues.push("cpi_institution_not_bls");
  }
  if (context.eventKey === "ECB_RATE_DECISION" && /Federal Reserve/i.test(prompt.split(" Avoid:")[0])) {
    issues.push("ecb_contains_fed_architecture");
  }

  return {
    automatedChecksPassed: issues.length === 0,
    automatedIssues: issues,
    generatedBackgroundTextDetected: "VISUAL REVIEW REQUIRED",
    visualVerdict: "VISUAL REVIEW REQUIRED",
  };
}

async function runPaidVisualTests(plan) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for final visual tests");
  }

  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const settings = plan.settings;
  let openAiRequestCount = 0;
  const results = [];

  for (const preview of PREVIEWS) {
    if (openAiRequestCount >= 5) {
      throw new Error("OpenAI request limit exceeded before completing all previews");
    }

    const bundle = buildEditorialPromptBundle(preview);
    const promptBundle = buildOpenAIImagePrompt(preview);
    const cacheKey = buildCacheKey(preview);
    const overlayContext = {
      ...preview,
      displayTitle: bundle.displayTitle,
      overlayPlacement: bundle.overlayPlacement,
      titlePlacement: bundle.composition.titlePlacement,
      eventName: bundle.displayTitle,
    };
    const svg = buildBrandOverlaySvg(overlayContext);
    const automated = runAutomatedChecks({
      prompt: promptBundle.prompt,
      svg,
      bundle,
      context: preview,
    });

    const record = {
      eventKey: preview.eventKey,
      fileName: preview.fileName,
      person: bundle.entities.person?.id || null,
      institution: bundle.entities.institution?.id || null,
      country: bundle.entities.country?.id || null,
      markets: bundle.entities.markets.map((market) => market.id),
      displayTitle: bundle.displayTitle,
      overlayPlacement: bundle.overlayPlacement,
      titlePlacement: bundle.composition.titlePlacement,
      promptHash: hashPrompt(promptBundle.prompt),
      prompt: promptBundle.prompt,
      cacheKey,
      model: settings.model,
      size: settings.size,
      quality: settings.quality,
      openAiRequestNumber: null,
      status: "pending",
      ...automated,
    };

    try {
      openAiRequestCount += 1;
      record.openAiRequestNumber = openAiRequestCount;

      const provider = createOpenAIImageProvider({ ...settings });
      const background = await provider.generateBackground(preview);
      const composed = await composePremiumNewsImage(background.backgroundBuffer, overlayContext);
      const outputPath = path.join(OUTPUT_DIR, preview.fileName);
      fs.writeFileSync(outputPath, composed.buffer);

      const metadata = await sharp(outputPath).metadata();
      record.status = "generated";
      record.outputPath = outputPath;
      record.width = metadata.width;
      record.height = metadata.height;
      record.bytes = fs.statSync(outputPath).size;
      record.cached = false;
    } catch (error) {
      record.status = "VISUAL_REVIEW_FAILED";
      record.error = error.message;
      record.visualVerdict = "VISUAL_REVIEW_FAILED";
    }

    results.push(record);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    outputDir: OUTPUT_DIR,
    openAiRequestCount,
    openAiRequestLimit: 5,
    settings,
    estimatedCostUsd: estimateCost(settings, openAiRequestCount),
    telegram: false,
    supabase: false,
    results,
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("FINAL_EDITORIAL_VISUAL_TEST_REPORT", JSON.stringify(report, null, 2));
}

async function run() {
  const plan = buildPlan();

  if (process.env.ALLOW_FINAL_VISUAL_TESTS !== "1") {
    console.log("FINAL_EDITORIAL_VISUAL_TEST_PLAN", JSON.stringify(plan, null, 2));
    return;
  }

  await runPaidVisualTests(plan);
}

run().catch((error) => {
  console.error("FINAL_EDITORIAL_VISUAL_TESTS_FAILED", error.message);
  process.exit(1);
});
