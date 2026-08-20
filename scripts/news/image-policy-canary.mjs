#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = path.join(__dirname, "..", "..", "worker", "lib");

const { resolveNewsImagePolicy, assertRssNeverUsesAi, IMAGE_POLICY_MODES } = await import(
  pathToFileURL(path.join(workerRoot, "news-images", "image-policy.js")).href
);
const {
  resolvePublicationImageResult,
  resetOpenAiImageCallCountForTests,
  getOpenAiImageCallCountForTests,
} = await import(pathToFileURL(path.join(workerRoot, "news-images", "image-orchestrator.js")).href);
const { SOURCE_TYPES, PUBLICATION_TYPES } = await import(
  pathToFileURL(path.join(workerRoot, "news-intelligence", "publication-types.js")).href
);

const cases = [];

function record(name, fn) {
  cases.push({ name, fn });
}

record("rss source-only policy", async () => {
  const policy = resolveNewsImagePolicy({
    sourceType: SOURCE_TYPES.RSS_GENERAL,
    publicationType: PUBLICATION_TYPES.GENERAL_NEWS,
    importance: "HIGH",
  });
  assert.equal(policy.mode, IMAGE_POLICY_MODES.SOURCE_ONLY);
  assertRssNeverUsesAi(policy);
});

record("important telegram ai primary", async () => {
  const policy = resolveNewsImagePolicy({
    sourceType: SOURCE_TYPES.TELEGRAM_GENERAL,
    publicationType: PUBLICATION_TYPES.GENERAL_NEWS,
    importance: "HIGH",
    title: "Bitcoin surges above $68,000",
  });
  assert.equal(policy.mode, IMAGE_POLICY_MODES.AI_PRIMARY);
});

record("economic jobless claims ai primary", async () => {
  const policy = resolveNewsImagePolicy({
    sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
    publicationType: PUBLICATION_TYPES.RELEASE,
    eventType: "US_INITIAL_JOBLESS_CLAIMS",
    importance: "HIGH",
  });
  assert.equal(policy.mode, IMAGE_POLICY_MODES.AI_PRIMARY);
});

record("rss resolution keeps openai calls at zero", async () => {
  resetOpenAiImageCallCountForTests();
  await resolvePublicationImageResult({
    sourceType: SOURCE_TYPES.RSS_GENERAL,
    publicationType: PUBLICATION_TYPES.GENERAL_NEWS,
    importance: "HIGH",
    title: "Important RSS headline",
    body: "Important RSS body with enough market context",
  });
  assert.equal(getOpenAiImageCallCountForTests(), 0);
});

record("economic text-only allowed when all image paths fail", async () => {
  const cacheDir = path.join(__dirname, "..", "..", "worker", ".cache", `canary-${Date.now()}`);
  const outputDir = path.join(cacheDir, "output");
  const resolution = await resolvePublicationImageResult(
    {
      sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
      publicationType: PUBLICATION_TYPES.RELEASE,
      eventType: "US_INITIAL_JOBLESS_CLAIMS",
      importance: "HIGH",
      title: "Initial Jobless Claims",
      body: "Initial Jobless Claims release",
      metadata: {
        premiumImageContext: {
          eventKey: "US_INITIAL_JOBLESS_CLAIMS",
          eventName: "Initial Jobless Claims",
          country: "US",
          releaseTime: "2026-08-06T12:30:00.000Z",
        },
      },
    },
    {
      registry: {
        getProvider(name) {
          return {
            name,
            async generateBackground() {
              throw new Error("timeout while calling OpenAI");
            },
          };
        },
        resolveProviderName: () => "openai",
        providers: {
          openai: {
            name: "openai",
            async generateBackground() {
              throw new Error("timeout while calling OpenAI");
            },
          },
          fallback: {
            name: "fallback",
            async generateBackground() {
              throw new Error("fallback_down");
            },
          },
        },
      },
      cacheDir,
      outputDir,
    }
  );
  assert.equal(resolution.ok, true);
  assert.equal(resolution.imageResult.delivery, "text");
  assert.equal(resolution.telemetry.warning, "IMPORTANT_NEWS_PUBLISHED_WITHOUT_IMAGE");
});

async function main() {
  for (const testCase of cases) {
    await testCase.fn();
    console.log(`PASS ${testCase.name}`);
  }
  console.log("IMAGE_POLICY_CANARY_PASS");
}

main().catch((error) => {
  console.error("IMAGE_POLICY_CANARY_FAIL", error?.stack || error?.message || error);
  process.exit(1);
});
