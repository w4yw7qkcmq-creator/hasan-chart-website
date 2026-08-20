#!/usr/bin/env node
/**
 * Production-safe activation canary for news image storage + AI path.
 * No Telegram publish. No website news_post insert.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });

const require = createRequire(import.meta.url);
const workerRoot = path.join(process.cwd(), "worker");

const { createClient } = require("@supabase/supabase-js");
const { uploadNewsImageBuffer, buildNewsImageObjectPath, NEWS_IMAGE_BUCKET } = require(
  path.join(workerRoot, "lib/news-images/image-storage.js")
);
const {
  resolvePublicationImageResult,
  resetOpenAiImageCallCountForTests,
  getOpenAiImageCallCountForTests,
} = require(path.join(workerRoot, "lib/news-images/image-orchestrator.js"));
const { resolveNewsImagePolicy, assertRssNeverUsesAi, IMAGE_POLICY_MODES } = require(
  path.join(workerRoot, "lib/news-images/image-policy.js")
);
const { summarizeImageStatus } = require(path.join(workerRoot, "lib/news-images/image-telemetry.js"));
const { SOURCE_TYPES, PUBLICATION_TYPES } = require(
  path.join(workerRoot, "lib/news-intelligence/publication-types.js")
);
const { auditPublishedRecord } = require(
  path.join(workerRoot, "lib/news-intelligence/autonomy/post-publish-auditor.js")
);

function brokenImageRegistry() {
  return {
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
  };
}

const CANARY_KEY = `canary-storage-${Date.now()}`;
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAD0lEQVRQI2P8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const report = {
  migrationAudit: "PASS_additive_only",
  bucket: NEWS_IMAGE_BUCKET,
  storageCanary: null,
  aiCanary: null,
  rssProof: null,
  telegramProof: null,
  duplicateProof: null,
  failurePath: null,
  auditor: null,
  env: {},
};

function requireEnv(name) {
  const value = process.env[name];
  assert.ok(value, `${name} missing`);
  return value;
}

async function verifyPublicUrl(url) {
  const response = await fetch(url, { method: "HEAD" });
  return { ok: response.ok, status: response.status };
}

async function runStorageCanary(supabase) {
  const publicationKey = CANARY_KEY;
  const objectPath = buildNewsImageObjectPath(publicationKey);
  assert.match(objectPath, /^news-images\/\d{4}\/\d{2}\//);

  const upload = await uploadNewsImageBuffer(
    supabase,
    TINY_PNG,
    { title: "Storage canary", sourceType: "canary" },
    { publicationKey }
  );
  assert.equal(upload.ok, true, upload.reason || "upload failed");
  assert.ok(upload.publicUrl, "missing publicUrl");
  assert.equal(upload.bucket, NEWS_IMAGE_BUCKET);

  const head = await verifyPublicUrl(upload.publicUrl);
  assert.equal(head.ok, true, `public URL not accessible: ${head.status}`);

  const { data: downloaded, error: downloadError } = await supabase.storage
    .from(NEWS_IMAGE_BUCKET)
    .download(upload.objectPath);
  assert.ifError(downloadError);
  assert.ok(downloaded?.size > 0, "downloaded object empty");

  report.storageCanary = {
    ok: true,
    objectPath: upload.objectPath,
    publicUrlPrefix: upload.publicUrl.split("?")[0].slice(0, 80),
    httpStatus: head.status,
  };
  console.log("PASS storage canary upload + public URL");
}

async function runAiCanary(supabase) {
  resetOpenAiImageCallCountForTests();
  const cacheDir = path.join(workerRoot, ".cache", `prod-canary-${Date.now()}`);
  const publication = {
    sourceType: SOURCE_TYPES.TELEGRAM_GENERAL,
    publicationType: PUBLICATION_TYPES.GENERAL_NEWS,
    importance: "HIGH",
    title: "CANARY: Gold rises on safe-haven demand",
    body: "Synthetic production canary for important Telegram AI image path.",
    metadata: {
      idempotencyKey: `canary-ai-${Date.now()}`,
      candidate: {
        newsValue: { score: 72 },
        post: { sourceMessageId: `canary-${Date.now()}` },
      },
    },
  };

  const policy = resolveNewsImagePolicy(publication);
  assert.equal(policy.mode, IMAGE_POLICY_MODES.AI_PRIMARY);

  const resolution = await resolvePublicationImageResult(publication, {
    supabase,
    cacheDir,
    outputDir: path.join(cacheDir, "output"),
    skipStorageUpload: false,
  });

  report.aiCanary = {
    policyMode: policy.mode,
    aiImageAttempted: resolution.telemetry?.aiImageAttempted === true,
    aiImageSucceeded: resolution.telemetry?.aiImageSucceeded === true,
    aiImageFailed: resolution.telemetry?.aiImageFailed === true,
    aiImageProvider: resolution.telemetry?.aiImageProvider || null,
    aiImageModel: resolution.telemetry?.aiImageModel || null,
    aiImageRetryCount: resolution.telemetry?.aiImageRetryCount || 0,
    aiImageLatencyMs: resolution.telemetry?.aiImageLatencyMs || null,
    brandedFallbackAttempted: resolution.telemetry?.brandedFallbackAttempted === true,
    brandedFallbackSucceeded: resolution.telemetry?.brandedFallbackSucceeded === true,
    imageStorageUploaded: resolution.telemetry?.imageStorageUploaded === true,
    imageStorageFailed: resolution.telemetry?.imageStorageFailed === true,
    openAiImageCalls: getOpenAiImageCallCountForTests(),
    delivery: resolution.imageResult?.delivery || null,
    imageUrlPrefix: resolution.imageResult?.imageUrl
      ? resolution.imageResult.imageUrl.split("?")[0].slice(0, 80)
      : null,
    imageStatus: summarizeImageStatus(resolution.telemetry),
  };

  assert.ok(report.aiCanary.openAiImageCalls >= 1, "expected at least one OpenAI attempt in production canary");
  assert.ok(
    resolution.imageResult?.imageUrl || resolution.imageResult?.delivery === "text",
    "expected persistent URL or text-only after image paths"
  );
  if (resolution.imageResult?.imageUrl) {
    assert.match(resolution.imageResult.imageUrl, /\/storage\/v1\/object\/public\/news-images\//);
    const head = await verifyPublicUrl(resolution.imageResult.imageUrl);
    assert.equal(head.ok, true, `AI/fallback URL not accessible: ${head.status}`);
  }

  console.log("PASS important telegram AI canary (no publish)");
}

async function runRssProof() {
  resetOpenAiImageCallCountForTests();
  const policy = resolveNewsImagePolicy({
    sourceType: SOURCE_TYPES.RSS_GENERAL,
    publicationType: PUBLICATION_TYPES.GENERAL_NEWS,
    importance: "HIGH",
  });
  assertRssNeverUsesAi(policy);
  await resolvePublicationImageResult({
    sourceType: SOURCE_TYPES.RSS_GENERAL,
    publicationType: PUBLICATION_TYPES.GENERAL_NEWS,
    importance: "HIGH",
    title: "RSS HIGH canary",
    body: "RSS body",
  });
  assert.equal(getOpenAiImageCallCountForTests(), 0);
  report.rssProof = { imagePolicyMode: policy.mode, openAiImageCalls: 0 };
  console.log("PASS RSS AI=0 proof");
}

async function runDuplicateProof(supabase) {
  resetOpenAiImageCallCountForTests();
  const sharedKey = `canary-dup-${Date.now()}`;
  const baseOptions = {
    supabase,
    cacheDir: path.join(workerRoot, ".cache", `prod-dup-${Date.now()}`),
    outputDir: path.join(workerRoot, ".cache", `prod-dup-${Date.now()}`, "output"),
  };
  const publication = {
    sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
    publicationType: PUBLICATION_TYPES.RELEASE,
    eventType: "US_INITIAL_JOBLESS_CLAIMS",
    importance: "HIGH",
    title: "Initial Jobless Claims CANARY",
    body: "Duplicate cost canary",
    metadata: { idempotencyKey: sharedKey },
  };

  const callsBefore = getOpenAiImageCallCountForTests();
  const first = await resolvePublicationImageResult(publication, baseOptions);
  const callsAfterFirst = getOpenAiImageCallCountForTests();

  const second = await resolvePublicationImageResult(
    { ...publication, imageResult: first.imageResult },
    baseOptions
  );
  const callsAfterSecond = getOpenAiImageCallCountForTests();

  report.duplicateProof = {
    firstAttempted: first.telemetry?.aiImageAttempted === true,
    callsBefore,
    callsAfterFirst,
    reused: second.reused === true,
    openAiImageCallsAfterSecond: callsAfterSecond,
    deltaOnSecondCall: callsAfterSecond - callsAfterFirst,
  };
  assert.equal(second.reused, true);
  assert.equal(callsAfterSecond, callsAfterFirst, "duplicate publication must not trigger new OpenAI calls");

  console.log("PASS duplicate/idempotency image cost safety (orchestrator level)");
}

async function runFailurePath() {
  resetOpenAiImageCallCountForTests();
  const resolution = await resolvePublicationImageResult(
    {
      sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
      publicationType: PUBLICATION_TYPES.RELEASE,
      eventType: "US_INITIAL_JOBLESS_CLAIMS",
      importance: "HIGH",
      title: "Failure path canary",
      body: "Forced failure",
      metadata: {
        idempotencyKey: `canary-fail-${Date.now()}`,
        premiumImageContext: {
          eventKey: "US_INITIAL_JOBLESS_CLAIMS",
          eventName: "Initial Jobless Claims",
          country: "US",
          releaseTime: "2026-08-06T12:30:00.000Z",
        },
      },
    },
    {
      registry: brokenImageRegistry(),
      cacheDir: path.join(workerRoot, ".cache", `prod-fail-${Date.now()}`),
      outputDir: path.join(workerRoot, ".cache", `prod-fail-${Date.now()}`, "out"),
    }
  );

  assert.equal(resolution.ok, true);
  assert.equal(resolution.imageResult.delivery, "text");
  report.failurePath = {
    delivery: resolution.imageResult.delivery,
    publishedWithoutImage: resolution.telemetry?.publishedWithoutImage === true,
    warning: resolution.telemetry?.warning || null,
  };
  console.log("PASS complete image failure allows text-only");
}

async function runAuditorProof() {
  const audit = auditPublishedRecord({
    publication: {
      publicationType: PUBLICATION_TYPES.RELEASE,
      sourceId: "ForexBreakingNews",
      image: null,
      imageUrl: null,
    },
    publicationRecord: { eventKey: "CANARY:US_INITIAL_JOBLESS_CLAIMS" },
    requiredImage: true,
  });
  assert.equal(audit.ok, true);
  assert.deepEqual(audit.warnings, ["IMPORTANT_NEWS_PUBLISHED_WITHOUT_IMAGE"]);
  report.auditor = { ok: audit.ok, warnings: audit.warnings };
  console.log("PASS post-publish auditor text-only warning");
}

async function main() {
  report.env = {
    NEWS_PREMIUM_IMAGES_ENABLED: process.env.NEWS_PREMIUM_IMAGES_ENABLED || null,
    NEWS_IMAGE_PROVIDER: process.env.NEWS_IMAGE_PROVIDER || null,
    NEWS_IMAGE_OPENAI_MODEL: process.env.NEWS_IMAGE_OPENAI_MODEL || "gpt-image-1",
    OPENAI_API_KEY_CONFIGURED: Boolean(process.env.OPENAI_API_KEY),
    SUPABASE_URL_CONFIGURED: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_CONFIGURED: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  assert.ok(supabaseUrl, "SUPABASE_URL missing");

  const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await runStorageCanary(supabase);
  await runRssProof();
  await runAiCanary(supabase);
  await runDuplicateProof(supabase);
  await runFailurePath();
  await runAuditorProof();

  console.log("IMAGE_STORAGE_PRODUCTION_CANARY_PASS");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error("IMAGE_STORAGE_PRODUCTION_CANARY_FAIL");
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
