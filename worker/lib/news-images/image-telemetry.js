const { getMetricsAggregator } = require("../news-intelligence/autonomy/metrics-aggregator");

function createEmptyImageTelemetry() {
  return {
    imagePolicyMode: null,
    aiImageAttempted: false,
    aiImageSucceeded: false,
    aiImageFailed: false,
    aiImageRetryCount: 0,
    aiImageRetryReason: null,
    aiImageRetrySkippedReason: null,
    remainingBudgetBeforeRetryMs: null,
    aiImageLatencyMs: 0,
    aiImageProvider: null,
    aiImageModel: null,
    brandedFallbackAttempted: false,
    brandedFallbackSucceeded: false,
    publishedWithAiImage: false,
    publishedWithFallbackImage: false,
    publishedWithoutImage: false,
    imageStorageUploaded: false,
    imageStorageFailed: false,
    imageStorageUploadMs: 0,
    sourceImageFound: false,
    sourceImageMissing: false,
    rssPublishedWithoutImage: false,
    openAiImageCalls: 0,
    providerRequestMs: 0,
    providerResponseDecodeMs: 0,
    providerAssetDownloadMs: 0,
    compositionMs: 0,
    totalImageWorkflowMs: 0,
    workflowBudgetMs: 0,
    fallbackReason: null,
    warning: null,
    imageMode: null,
    imageSelectionStatus: null,
    imageSelectionMs: 0,
    prebuiltCategory: null,
    prebuiltAssetPath: null,
    publishedWithPrebuiltImage: false,
    publishedWithCachedImage: false,
    generalPrebuiltEligible: false,
    generalPrebuiltCategory: null,
    generalPrebuiltAsset: null,
    generalPrebuiltStatus: null,
    generalPrebuiltSelectionMs: 0,
    generalPrebuiltRoutingReason: null,
  };
}

function summarizeImageStatus(telemetry = {}) {
  if (telemetry.publishedWithPrebuiltImage && telemetry.imageMode === "GENERAL_PREBUILT") {
    return "general_prebuilt_selected";
  }
  if (telemetry.publishedWithPrebuiltImage) return "prebuilt_selected";
  if (telemetry.publishedWithAiImage) return "ai_image";
  if (telemetry.publishedWithFallbackImage) return "fallback_image";
  if (telemetry.sourceImageFound) return "source_image";
  if (telemetry.publishedWithoutImage || telemetry.rssPublishedWithoutImage) {
    return telemetry.warning || "text_only";
  }
  return telemetry.imagePolicyMode || "none";
}

function recordImageTelemetry(telemetry = {}) {
  try {
    getMetricsAggregator().recordImageTelemetry(telemetry);
  } catch (_error) {
    // non-blocking
  }
}

module.exports = {
  createEmptyImageTelemetry,
  summarizeImageStatus,
  recordImageTelemetry,
};
