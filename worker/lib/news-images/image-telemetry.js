const { getMetricsAggregator } = require("../news-intelligence/autonomy/metrics-aggregator");

function createEmptyImageTelemetry() {
  return {
    imagePolicyMode: null,
    aiImageAttempted: false,
    aiImageSucceeded: false,
    aiImageFailed: false,
    aiImageRetryCount: 0,
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
    sourceImageFound: false,
    sourceImageMissing: false,
    rssPublishedWithoutImage: false,
    openAiImageCalls: 0,
    warning: null,
  };
}

function summarizeImageStatus(telemetry = {}) {
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
