#!/usr/bin/env node
/**
 * Production-safe AI reliability canary (no publish).
 * Runs 3 sequential important Telegram-like candidates.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });

const require = createRequire(import.meta.url);
const workerRoot = path.join(process.cwd(), "worker");
const { createClient } = require("@supabase/supabase-js");
const {
  resolvePublicationImageResult,
  resetOpenAiImageCallCountForTests,
  getOpenAiImageCallCountForTests,
} = require(path.join(workerRoot, "lib/news-images/image-orchestrator.js"));
const { SOURCE_TYPES, PUBLICATION_TYPES } = require(
  path.join(workerRoot, "lib/news-intelligence/publication-types.js")
);

const CASES = [
  {
    label: "telegram_gold",
    publication: {
      sourceType: SOURCE_TYPES.TELEGRAM_GENERAL,
      publicationType: PUBLICATION_TYPES.GENERAL_NEWS,
      importance: "HIGH",
      title: "CANARY: Gold jumps as Treasury yields fall",
      body: "Gold rises above $2,400 as investors seek safety.",
      metadata: { idempotencyKey: `canary-ai-gold-${Date.now()}` },
    },
  },
  {
    label: "telegram_geopolitical",
    publication: {
      sourceType: SOURCE_TYPES.TELEGRAM_GENERAL,
      publicationType: PUBLICATION_TYPES.GENERAL_NEWS,
      importance: "HIGH",
      title: "CANARY: Oil spikes on Middle East escalation",
      body: "Crude oil climbs as shipping risks increase.",
      metadata: { idempotencyKey: `canary-ai-geo-${Date.now() + 1}` },
    },
  },
  {
    label: "jobless_claims_release",
    publication: {
      sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
      publicationType: PUBLICATION_TYPES.RELEASE,
      eventType: "US_INITIAL_JOBLESS_CLAIMS",
      importance: "HIGH",
      title: "CANARY: Initial Jobless Claims",
      body: "Initial Jobless Claims release",
      metadata: {
        idempotencyKey: `canary-ai-claims-${Date.now() + 2}`,
        premiumImageContext: {
          eventKey: "US_INITIAL_JOBLESS_CLAIMS",
          eventName: "Initial Jobless Claims",
          country: "US",
          releaseTime: "2026-08-06T12:30:00.000Z",
        },
      },
    },
  },
];

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  assert.ok(supabaseUrl, "SUPABASE_URL missing");
  assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY missing");

  const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  resetOpenAiImageCallCountForTests();
  const runs = [];

  for (const testCase of CASES) {
    const cacheDir = path.join(workerRoot, ".cache", `ai-canary-${testCase.label}-${Date.now()}`);
    const resolution = await resolvePublicationImageResult(testCase.publication, {
      supabase,
      cacheDir,
      outputDir: path.join(cacheDir, "output"),
    });

    runs.push({
      label: testCase.label,
      aiImageAttempted: resolution.telemetry?.aiImageAttempted === true,
      aiImageSucceeded: resolution.telemetry?.aiImageSucceeded === true,
      aiImageFailed: resolution.telemetry?.aiImageFailed === true,
      brandedFallbackAttempted: resolution.telemetry?.brandedFallbackAttempted === true,
      brandedFallbackSucceeded: resolution.telemetry?.brandedFallbackSucceeded === true,
      imageStorageUploaded: resolution.telemetry?.imageStorageUploaded === true,
      fallbackReason: resolution.telemetry?.fallbackReason || null,
      providerRequestMs: resolution.telemetry?.providerRequestMs || 0,
      totalImageWorkflowMs: resolution.telemetry?.totalImageWorkflowMs || 0,
      imageUrl: resolution.imageResult?.imageUrl || null,
      delivery: resolution.imageResult?.delivery || null,
    });
  }

  const aiSuccesses = runs.filter((run) => run.aiImageSucceeded).length;
  const report = {
    openAiImageCalls: getOpenAiImageCallCountForTests(),
    aiSuccesses,
    aiSuccessRatio: `${aiSuccesses}/${runs.length}`,
    accepted: aiSuccesses >= 2,
    runs,
  };

  assert.ok(report.accepted, `Expected at least 2/3 AI successes, got ${report.aiSuccessRatio}`);
  console.log("AI_IMAGE_RELIABILITY_CANARY_PASS");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error("AI_IMAGE_RELIABILITY_CANARY_FAIL");
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
