#!/usr/bin/env node
/**
 * Production-safe OpenAI image latency benchmark.
 * Sequential only. No Telegram/website publish.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });

const require = createRequire(import.meta.url);
const workerRoot = path.join(process.cwd(), "worker");

const { createOpenAIImageProvider } = require(path.join(workerRoot, "lib/news-images/openai-image-provider.js"));
const { generatePremiumNewsImage } = require(path.join(workerRoot, "lib/news-images/premium-image-generator.js"));
const { resolveOpenAIImageSettings } = require(path.join(workerRoot, "lib/news-images/openai-image-settings.js"));
const { createClient } = require("@supabase/supabase-js");
const { uploadNewsImageBuffer } = require(path.join(workerRoot, "lib/news-images/image-storage.js"));

const SCENARIOS = [
  {
    label: "cpi_inflation",
    context: {
      eventKey: "US_CPI_MOM",
      eventName: "US Consumer Price Index",
      title: "US CPI Release",
      country: "US",
      releaseTime: "2026-08-12T12:30:00.000Z",
      importance: "HIGH",
    },
  },
  {
    label: "nfp_jobs",
    context: {
      eventKey: "US_NFP",
      eventName: "Non Farm Payrolls",
      title: "US Nonfarm Payrolls",
      country: "US",
      releaseTime: "2026-09-05T12:30:00.000Z",
      importance: "HIGH",
    },
  },
  {
    label: "fomc_rates",
    context: {
      eventKey: "US_FED_RATE_DECISION",
      eventName: "Federal Reserve Interest Rate Decision",
      title: "FOMC Rate Decision",
      country: "US",
      releaseTime: "2026-09-17T18:00:00.000Z",
      importance: "HIGH",
    },
  },
  {
    label: "geopolitical_market",
    context: {
      eventKey: "GEOPOLITICAL_MARKET_MOVE",
      eventName: "Geopolitical Market Shock",
      title: "Middle East tensions drive safe-haven flows",
      summary: "Oil and gold rise as investors seek safety amid escalating regional tensions.",
      country: "US",
      releaseTime: new Date().toISOString(),
      importance: "HIGH",
    },
  },
  {
    label: "gold_crypto_move",
    context: {
      eventKey: "GOLD_MAJOR_MOVE",
      eventName: "Gold and Crypto Surge",
      title: "Gold and Bitcoin rally on risk-off sentiment",
      summary: "Precious metals and crypto assets climb as Treasury yields retreat.",
      country: "US",
      releaseTime: new Date().toISOString(),
      importance: "HIGH",
    },
  },
];

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function summarize(values) {
  if (!values.length) {
    return { min: null, median: null, p75: null, p90: null, max: null, successRate: 0 };
  }
  return {
    min: Math.min(...values),
    median: percentile(values, 50),
    p75: percentile(values, 75),
    p90: percentile(values, 90),
    max: Math.max(...values),
    successRate: null,
  };
}

async function runScenario(scenario, options = {}) {
  const cacheDir = path.join(workerRoot, ".cache", `benchmark-${scenario.label}-${Date.now()}`);
  const outputDir = path.join(cacheDir, "output");
  const settings = resolveOpenAIImageSettings(options);
  const startedAt = Date.now();
  const record = {
    label: scenario.label,
    startedAt: new Date(startedAt).toISOString(),
    success: false,
    providerRequestMs: 0,
    providerResponseDecodeMs: 0,
    providerAssetDownloadMs: 0,
    compositionMs: 0,
    uploadMs: 0,
    totalMs: 0,
    httpStatus: null,
    retryCount: 0,
    assetBytes: 0,
    storageOk: false,
    failureReason: null,
    model: settings.model,
    providerTimeoutMs: settings.providerTimeoutMs,
    workflowBudgetMs: settings.workflowBudgetMs,
  };

  try {
    const result = await generatePremiumNewsImage(scenario.context, {
      forceEnabled: true,
      skipEligibilityCheck: true,
      disableInternalProviderFallback: true,
      provider: "openai",
      cacheDir,
      outputDir,
      providerTimeoutMs: settings.providerTimeoutMs,
    });

    record.providerRequestMs = result.timings?.providerRequestMs || 0;
    record.providerResponseDecodeMs = result.timings?.providerResponseDecodeMs || 0;
    record.providerAssetDownloadMs = result.timings?.providerAssetDownloadMs || 0;
    record.compositionMs = result.timings?.compositionMs || 0;
    record.httpStatus = result.httpStatus || 200;
    record.assetBytes = result.assetBytes || 0;
    record.success = result.provider === "openai";

    if (options.supabase && result.filePath) {
      const uploadStartedAt = Date.now();
      const buffer = require("node:fs").readFileSync(result.filePath);
      const upload = await uploadNewsImageBuffer(
        options.supabase,
        buffer,
        { title: `BENCHMARK:${scenario.label}` },
        { publicationKey: `benchmark-${scenario.label}-${Date.now()}` }
      );
      record.uploadMs = Date.now() - uploadStartedAt;
      record.storageOk = upload.ok === true;
    }
  } catch (error) {
    record.failureReason = error.message;
    record.providerRequestMs = error.timings?.providerRequestMs || record.providerRequestMs;
    record.providerResponseDecodeMs = error.timings?.providerResponseDecodeMs || 0;
    record.providerAssetDownloadMs = error.timings?.providerAssetDownloadMs || 0;
    if (/timeout|timed out/i.test(error.message)) {
      record.failureReason = "timeout";
    }
  }

  record.totalMs = Date.now() - startedAt;
  return record;
}

async function main() {
  assert.ok(process.env.OPENAI_API_KEY, "OPENAI_API_KEY required for benchmark");

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabase =
    supabaseUrl && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

  const settings = resolveOpenAIImageSettings();
  const results = [];

  for (const scenario of SCENARIOS) {
    const result = await runScenario(scenario, { supabase });
    results.push(result);
    console.log(
      `BENCHMARK ${scenario.label}: success=${result.success} providerRequestMs=${result.providerRequestMs} totalMs=${result.totalMs} reason=${result.failureReason || "none"}`
    );
  }

  const providerRequests = results.filter((item) => item.providerRequestMs > 0).map((item) => item.providerRequestMs);
  const totals = results.map((item) => item.totalMs);
  const successes = results.filter((item) => item.success).length;

  const report = {
    settings,
    attempts: results.length,
    successes,
    successRate: Number(((successes / results.length) * 100).toFixed(1)),
    providerRequestMs: summarize(providerRequests),
    totalMs: summarize(totals),
    results,
  };

  report.providerRequestMs.successRate = report.successRate;
  console.log("OPENAI_IMAGE_LATENCY_BENCHMARK_PASS");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error("OPENAI_IMAGE_LATENCY_BENCHMARK_FAIL");
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
