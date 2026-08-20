const fs = require("fs");
const {
  resolveNewsImagePolicy,
  assertRssNeverUsesAi,
  IMAGE_POLICY_MODES,
  FALLBACK_BRAND,
} = require("./image-policy");
const { generatePremiumNewsImage, generateDeterministicBrandedFallbackImage } = require("./premium-image-generator");
const { buildPremiumImageContextFromRelease, buildPremiumImageContextFromCandidate } = require("./important-events");
const { uploadNewsImageBuffer, buildStablePublicationKey } = require("./image-storage");
const { createEmptyImageTelemetry, summarizeImageStatus, recordImageTelemetry } = require("./image-telemetry");
const { resolveOpenAIImageSettings } = require("./openai-image-settings");

const IMAGE_WORKFLOW_BUDGET_MS = Number(process.env.NEWS_IMAGE_WORKFLOW_BUDGET_MS || 25000);
const OPENAI_ATTEMPT_TIMEOUT_MS = Number(process.env.NEWS_IMAGE_OPENAI_TIMEOUT_MS || 12000);

let openAiImageCallCount = 0;

function resetOpenAiImageCallCountForTests() {
  openAiImageCallCount = 0;
}

function getOpenAiImageCallCountForTests() {
  return openAiImageCallCount;
}

function isTransientImageError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    /timeout|timed out|network|econnreset|etimedout|429|rate limit|5\d\d|service unavailable|temporarily unavailable/.test(
      message
    )
  );
}

function buildImageContextFromPublication(publication = {}) {
  const premium =
    publication.metadata?.premiumImageContext ||
    buildPremiumImageContextFromCandidate(publication.metadata?.candidate || {}) ||
    null;

  if (premium?.eventKey) {
    return {
      ...premium,
      title: premium.title || publication.title,
      brandName: FALLBACK_BRAND,
      importance: publication.importance || premium.importance || "HIGH",
    };
  }

  const candidate = publication.metadata?.candidate || {};
  const fromRelease = candidate.facts
    ? buildPremiumImageContextFromRelease({ canonical: candidate.facts?.canonical, structuredRelease: candidate.facts })
    : null;

  if (fromRelease?.eventKey) {
    return {
      ...fromRelease,
      title: publication.title || fromRelease.eventName,
      brandName: FALLBACK_BRAND,
    };
  }

  return {
    eventKey: publication.eventType || publication.eventKey || "MACRO_RELEASE",
    eventName: publication.title || "Market News",
    title: publication.title || "Market News",
    summary: String(publication.body || "").slice(0, 240),
    sourceText: null,
    country: publication.country || "US",
    releaseTime:
      publication.releaseDate ||
      candidate.post?.sourcePublishedAt ||
      publication.metadata?.releaseTime ||
      new Date().toISOString(),
    brandName: FALLBACK_BRAND,
    importance: publication.importance || "HIGH",
  };
}

async function generateAiPrimaryImage(context, options = {}, telemetry = createEmptyImageTelemetry()) {
  const settings = resolveOpenAIImageSettings(options);
  telemetry.aiImageProvider = "openai";
  telemetry.aiImageModel = settings.model;
  telemetry.aiImageAttempted = true;

  const startedAt = Date.now();
  const deadline = startedAt + IMAGE_WORKFLOW_BUDGET_MS;
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (Date.now() >= deadline) {
      break;
    }

    if (attempt > 0) {
      telemetry.aiImageRetryCount += 1;
    }

    try {
      if (!options.skipOpenAiCall) {
        openAiImageCallCount += 1;
      }

      const result = await generatePremiumNewsImage(context, {
        ...options,
        forceEnabled: true,
        skipEligibilityCheck: true,
        provider: options.provider || "openai",
        timeoutMs: Math.min(OPENAI_ATTEMPT_TIMEOUT_MS, Math.max(1000, deadline - Date.now())),
      });

      if (result?.filePath && fs.existsSync(result.filePath)) {
        telemetry.aiImageLatencyMs = Date.now() - startedAt;
        telemetry.aiImageSucceeded = result.provider === "openai";
        telemetry.aiImageFailed = result.provider !== "openai";
        telemetry.publishedWithAiImage = result.provider === "openai";
        telemetry.publishedWithFallbackImage = result.provider === "fallback";
        return {
          ok: true,
          filePath: result.filePath,
          buffer: fs.readFileSync(result.filePath),
          provider: result.provider,
          model: settings.model,
          fallbackFrom: result.fallbackFrom || null,
          source: result.provider === "openai" ? "ai_image" : "ai_provider_fallback",
        };
      }

      lastError = new Error("AI image generation returned no file");
    } catch (error) {
      lastError = error;
      telemetry.aiImageFailed = true;
      if (!isTransientImageError(error) || attempt >= 1 || Date.now() >= deadline) {
        break;
      }
    }
  }

  telemetry.aiImageLatencyMs = Date.now() - startedAt;
  telemetry.openAiImageCalls = openAiImageCallCount;
  return { ok: false, error: lastError };
}

async function generateBrandedFallbackImage(context, options = {}, telemetry = createEmptyImageTelemetry()) {
  telemetry.brandedFallbackAttempted = true;
  try {
    const result = await generateDeterministicBrandedFallbackImage(
      {
        ...context,
        brandName: FALLBACK_BRAND,
      },
      options
    );
    if (result?.filePath && fs.existsSync(result.filePath)) {
      telemetry.brandedFallbackSucceeded = true;
      telemetry.publishedWithFallbackImage = true;
      return {
        ok: true,
        filePath: result.filePath,
        buffer: fs.readFileSync(result.filePath),
        provider: result.provider || "fallback",
        source: "branded_fallback",
      };
    }
  } catch (_error) {
    // fall through
  }
  return { ok: false };
}

async function persistPublicationImage(publication, imagePayload, deps = {}, telemetry = createEmptyImageTelemetry()) {
  if (!imagePayload?.buffer?.length) {
    return imagePayload;
  }

  const upload = await uploadNewsImageBuffer(deps.supabase, imagePayload.buffer, publication, {
    publicationKey: buildStablePublicationKey(publication),
  });

  if (upload.ok && upload.publicUrl) {
    telemetry.imageStorageUploaded = true;
    return {
      ...imagePayload,
      imageUrl: upload.publicUrl,
      storagePath: upload.objectPath,
      storageBucket: upload.bucket,
    };
  }

  telemetry.imageStorageFailed = true;
  return imagePayload;
}

async function resolvePublicationImageResult(publication = {}, deps = {}) {
  if (publication.imageResult?.generationAttempted) {
    return {
      ok: true,
      policy: publication.imagePolicy || resolveNewsImagePolicy(publication),
      imageResult: publication.imageResult,
      telemetry: publication.metadata?.imageTelemetry || createEmptyImageTelemetry(),
      reused: true,
    };
  }

  const policy = resolveNewsImagePolicy(publication);
  const telemetry = createEmptyImageTelemetry();
  telemetry.imagePolicyMode = policy.mode;
  telemetry.openAiImageCalls = openAiImageCallCount;

  if (policy.mode === IMAGE_POLICY_MODES.SOURCE_ONLY) {
    assertRssNeverUsesAi(policy, publication.sourceType || "unknown");
    const sourceUrl = publication.imageUrl || publication.metadata?.sourceImageUrl || null;
    if (sourceUrl) {
      telemetry.sourceImageFound = true;
      const imageResult = {
        generationAttempted: true,
        delivery: "photo",
        source: "source_image",
        imageUrl: sourceUrl,
        filePath: null,
        provider: "source",
      };
      recordImageTelemetry(telemetry);
      return { ok: true, policy, imageResult, telemetry, imageStatus: summarizeImageStatus(telemetry) };
    }

    telemetry.sourceImageMissing = true;
    telemetry.publishedWithoutImage = true;
    telemetry.rssPublishedWithoutImage = true;
    telemetry.warning = "RSS_TEXT_ONLY";
    const imageResult = {
      generationAttempted: true,
      delivery: "text",
      source: "none",
      imageUrl: null,
      filePath: null,
      provider: null,
    };
    recordImageTelemetry(telemetry);
    return { ok: true, policy, imageResult, telemetry, imageStatus: summarizeImageStatus(telemetry) };
  }

  if (policy.mode === IMAGE_POLICY_MODES.NONE) {
    telemetry.publishedWithoutImage = true;
    const imageResult = {
      generationAttempted: false,
      delivery: "text",
      source: "none",
      imageUrl: null,
      filePath: null,
      provider: null,
    };
    recordImageTelemetry(telemetry);
    return { ok: true, policy, imageResult, telemetry, imageStatus: summarizeImageStatus(telemetry) };
  }

  const context = buildImageContextFromPublication(publication);
  let imagePayload = await generateAiPrimaryImage(context, deps, telemetry);

  if (!imagePayload.ok) {
    imagePayload = await generateBrandedFallbackImage(context, deps, telemetry);
  }

  if (!imagePayload.ok) {
    telemetry.publishedWithoutImage = true;
    telemetry.warning = "IMPORTANT_NEWS_PUBLISHED_WITHOUT_IMAGE";
    const imageResult = {
      generationAttempted: true,
      delivery: "text",
      source: "none",
      imageUrl: null,
      filePath: null,
      provider: null,
    };
    recordImageTelemetry(telemetry);
    return {
      ok: true,
      policy,
      imageResult,
      telemetry,
      imageStatus: summarizeImageStatus(telemetry),
    };
  }

  const persisted = await persistPublicationImage(publication, imagePayload, deps, telemetry);
  const imageResult = {
    generationAttempted: true,
    delivery: "photo",
    source: persisted.source,
    imageUrl: persisted.imageUrl || null,
    filePath: persisted.filePath || null,
    provider: persisted.provider || null,
    model: persisted.model || null,
    fallbackFrom: persisted.fallbackFrom || null,
    storagePath: persisted.storagePath || null,
    storageBucket: persisted.storageBucket || null,
  };

  recordImageTelemetry(telemetry);
  return {
    ok: true,
    policy,
    imageResult,
    telemetry,
    imageStatus: summarizeImageStatus(telemetry),
  };
}

module.exports = {
  IMAGE_WORKFLOW_BUDGET_MS,
  OPENAI_ATTEMPT_TIMEOUT_MS,
  resetOpenAiImageCallCountForTests,
  getOpenAiImageCallCountForTests,
  buildImageContextFromPublication,
  resolvePublicationImageResult,
  generateAiPrimaryImage,
  generateBrandedFallbackImage,
};
