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
const { classifyImageError, isTransientImageError } = require("./image-error-classifier");

const settings = resolveOpenAIImageSettings();
const IMAGE_WORKFLOW_BUDGET_MS = settings.workflowBudgetMs;
const OPENAI_PROVIDER_TIMEOUT_MS = settings.providerTimeoutMs;

let openAiImageCallCount = 0;

function resetOpenAiImageCallCountForTests() {
  openAiImageCallCount = 0;
}

function getOpenAiImageCallCountForTests() {
  return openAiImageCallCount;
}

function mergeTimings(telemetry, timings = {}) {
  telemetry.providerRequestMs = timings.providerRequestMs || telemetry.providerRequestMs || 0;
  telemetry.providerResponseDecodeMs =
    timings.providerResponseDecodeMs || telemetry.providerResponseDecodeMs || 0;
  telemetry.providerAssetDownloadMs = timings.providerAssetDownloadMs || telemetry.providerAssetDownloadMs || 0;
  telemetry.compositionMs = timings.compositionMs || telemetry.compositionMs || 0;
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
      actual: undefined,
      forecast: undefined,
      previous: undefined,
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
      actual: undefined,
      forecast: undefined,
      previous: undefined,
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
  const runtimeSettings = resolveOpenAIImageSettings(options);
  telemetry.aiImageProvider = "openai";
  telemetry.aiImageModel = runtimeSettings.model;
  telemetry.aiImageAttempted = true;
  telemetry.workflowBudgetMs = runtimeSettings.workflowBudgetMs;

  const startedAt = Date.now();
  const deadline = startedAt + runtimeSettings.workflowBudgetMs;
  let lastError = null;
  let lastClassification = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const remainingBudgetMs = Math.max(0, deadline - Date.now());
    if (remainingBudgetMs < 3000) {
      telemetry.aiImageRetrySkippedReason = "WORKFLOW_BUDGET_EXHAUSTED";
      break;
    }

    const attemptProviderTimeoutMs = Math.min(
      runtimeSettings.providerTimeoutMs,
      Math.max(5000, remainingBudgetMs - 5000)
    );

    if (attempt > 0) {
      if (!lastClassification?.retryable) {
        telemetry.aiImageRetrySkippedReason = "NON_TRANSIENT_ERROR";
        break;
      }
      if (remainingBudgetMs < attemptProviderTimeoutMs + 4000) {
        telemetry.aiImageRetrySkippedReason = "INSUFFICIENT_BUDGET_FOR_RETRY";
        break;
      }
      telemetry.aiImageRetryCount += 1;
      telemetry.aiImageRetryReason = lastClassification?.reason || "AI_PROVIDER_ERROR";
      telemetry.remainingBudgetBeforeRetryMs = remainingBudgetMs;
    }

    try {
      if (!options.skipOpenAiCall) {
        openAiImageCallCount += 1;
      }

      const result = await generatePremiumNewsImage(context, {
        ...options,
        forceEnabled: true,
        skipEligibilityCheck: true,
        disableInternalProviderFallback: true,
        provider: "openai",
        providerTimeoutMs: attemptProviderTimeoutMs,
        timeoutMs: attemptProviderTimeoutMs,
      });

      if (result?.provider !== "openai") {
        lastError = new Error("OpenAI provider did not produce an OpenAI image");
        lastClassification = classifyImageError(lastError);
        continue;
      }

      if (result?.filePath && fs.existsSync(result.filePath)) {
        mergeTimings(telemetry, result.timings);
        telemetry.totalImageWorkflowMs = Date.now() - startedAt;
        telemetry.aiImageLatencyMs = telemetry.providerRequestMs || telemetry.totalImageWorkflowMs;
        telemetry.aiImageSucceeded = true;
        telemetry.aiImageFailed = false;
        telemetry.publishedWithAiImage = true;
        telemetry.openAiImageCalls = openAiImageCallCount;
        return {
          ok: true,
          filePath: result.filePath,
          buffer: fs.readFileSync(result.filePath),
          provider: result.provider,
          model: runtimeSettings.model,
          source: "ai_image",
          timings: result.timings,
          assetBytes: result.assetBytes || null,
          httpStatus: result.httpStatus || null,
        };
      }

      lastError = new Error("AI image generation returned no file");
      lastClassification = classifyImageError(lastError);
    } catch (error) {
      lastError = error;
      lastClassification = classifyImageError(error);
      mergeTimings(telemetry, error.timings || {});
      telemetry.aiImageFailed = true;
      telemetry.fallbackReason = lastClassification.reason;

      if (!isTransientImageError(error) || attempt >= 1) {
        break;
      }
    }
  }

  telemetry.totalImageWorkflowMs = Date.now() - startedAt;
  telemetry.aiImageLatencyMs = telemetry.providerRequestMs || telemetry.totalImageWorkflowMs;
  telemetry.aiImageFailed = true;
  telemetry.aiImageSucceeded = false;
  telemetry.openAiImageCalls = openAiImageCallCount;
  if (!telemetry.fallbackReason) {
    telemetry.fallbackReason = lastClassification?.reason || "AI_PROVIDER_ERROR";
  }
  return { ok: false, error: lastError, classification: lastClassification };
}

async function generateBrandedFallbackImage(context, options = {}, telemetry = createEmptyImageTelemetry()) {
  telemetry.brandedFallbackAttempted = true;
  if (!telemetry.fallbackReason) {
    telemetry.fallbackReason = "AI_PROVIDER_ERROR";
  }

  const fallbackStartedAt = Date.now();
  try {
    const result = await generateDeterministicBrandedFallbackImage(
      {
        ...context,
        brandName: FALLBACK_BRAND,
      },
      {
        ...options,
        disableInternalProviderFallback: true,
        provider: "fallback",
      }
    );
    if (result?.filePath && fs.existsSync(result.filePath)) {
      mergeTimings(telemetry, result.timings);
      telemetry.compositionMs = telemetry.compositionMs || result.timings?.compositionMs || 0;
      telemetry.brandedFallbackSucceeded = true;
      telemetry.publishedWithFallbackImage = true;
      telemetry.totalImageWorkflowMs = (telemetry.totalImageWorkflowMs || 0) + (Date.now() - fallbackStartedAt);
      return {
        ok: true,
        filePath: result.filePath,
        buffer: fs.readFileSync(result.filePath),
        provider: result.provider || "fallback",
        source: "branded_fallback",
        timings: result.timings,
      };
    }
  } catch (_error) {
    telemetry.fallbackReason = telemetry.fallbackReason || "AI_BUDGET_EXHAUSTED";
  }
  return { ok: false };
}

async function persistPublicationImage(publication, imagePayload, deps = {}, telemetry = createEmptyImageTelemetry()) {
  if (!imagePayload?.buffer?.length) {
    return imagePayload;
  }

  const uploadStartedAt = Date.now();
  const upload = await uploadNewsImageBuffer(deps.supabase, imagePayload.buffer, publication, {
    publicationKey: buildStablePublicationKey(publication),
  });
  telemetry.imageStorageUploadMs = Date.now() - uploadStartedAt;

  if (upload.ok && upload.publicUrl) {
    telemetry.imageStorageUploaded = true;
    telemetry.totalImageWorkflowMs =
      (telemetry.totalImageWorkflowMs || 0) + telemetry.imageStorageUploadMs;
    return {
      ...imagePayload,
      imageUrl: upload.publicUrl,
      storagePath: upload.objectPath,
      storageBucket: upload.bucket,
    };
  }

  telemetry.imageStorageFailed = true;
  telemetry.fallbackReason = telemetry.fallbackReason || "STORAGE_UPLOAD_FAILED";
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

  const eventKey = publication.eventKey || publication.eventType || publication.metadata?.premiumImageContext?.eventKey;
  const country = publication.country || "US";
  if (eventKey) {
    const { getCachedEventImage } = require("./event-image-cache");
    const cached = getCachedEventImage(eventKey, country);
    if (cached) {
      const policy = resolveNewsImagePolicy(publication);
      const telemetry = createEmptyImageTelemetry();
      telemetry.imagePolicyMode = policy.mode;
      telemetry.publishedWithCachedImage = true;
      recordImageTelemetry(telemetry);
      return {
        ok: true,
        policy,
        imageResult: cached,
        telemetry,
        imageStatus: summarizeImageStatus(telemetry),
        cacheHit: true,
      };
    }
  }

  const policy = resolveNewsImagePolicy(publication);
  const telemetry = createEmptyImageTelemetry();
  telemetry.imagePolicyMode = policy.mode;
  telemetry.workflowBudgetMs = IMAGE_WORKFLOW_BUDGET_MS;
  telemetry.openAiImageCalls = openAiImageCallCount;
  const workflowStartedAt = Date.now();

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
    telemetry.totalImageWorkflowMs = Date.now() - workflowStartedAt;
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
  telemetry.totalImageWorkflowMs = Date.now() - workflowStartedAt;
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
  OPENAI_PROVIDER_TIMEOUT_MS,
  OPENAI_ATTEMPT_TIMEOUT_MS: OPENAI_PROVIDER_TIMEOUT_MS,
  resetOpenAiImageCallCountForTests,
  getOpenAiImageCallCountForTests,
  buildImageContextFromPublication,
  resolvePublicationImageResult,
  generateAiPrimaryImage,
  generateBrandedFallbackImage,
  classifyImageError,
  isTransientImageError,
};
