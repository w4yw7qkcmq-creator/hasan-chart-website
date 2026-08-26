const { resolveRssSourceImage, collectRssMediaCandidates, pickFirstValidatedCandidate } = require("../rss-source-image-resolver");
const {
  classifyImageVisualType,
  VISUAL_TYPES,
  consumesPublicChartQuota,
} = require("./chart-classifier");
const {
  tryReservePublicChartQuota,
  isPublicChartQuotaBlocked,
  loadPublicChartQuotaState,
  getPublicChartQuotaTelemetrySnapshot,
  resetPublicChartQuotaForTests,
  recordChartQuotaTextFallback,
  syncPublicChartQuotaAuthority,
} = require("./public-chart-quota");
const {
  recordChartCandidate,
  recordChartRateLimited,
  recordChartFallback,
  getChartPolicyTelemetrySnapshot,
  resetChartPolicyStateForTests,
} = require("./chart-rate-limit");

async function resolveRssSourceImageWithChartPolicy(params = {}) {
  const { source, item, articleUrl, chartPolicy = {}, ...options } = params;
  const state = await loadPublicChartQuotaState(chartPolicy);
  const chartLimited = isPublicChartQuotaBlocked(Date.now(), state, chartPolicy);
  const candidates = collectRssMediaCandidates(item, articleUrl);

  const ordered = [];
  const charts = [];
  for (const candidate of candidates) {
    const visualType = classifyImageVisualType(candidate.url, {
      ...candidate,
      title: item?.title,
      contextText: item?.contentSnippet || item?.content,
    });
    const enriched = { ...candidate, visualType };
    if (consumesPublicChartQuota(visualType)) {
      recordChartCandidate();
      charts.push(enriched);
    } else {
      ordered.push(enriched);
    }
  }

  let result = await pickFirstValidatedCandidate(ordered, { ...options, source });
  if (!result && charts.length) {
    if (chartLimited) {
      recordChartRateLimited();
      recordChartFallback("source_photo");
    } else {
      const reservation = await tryReservePublicChartQuota(chartPolicy);
      if (!reservation.granted) {
        recordChartRateLimited();
        recordChartFallback("source_photo");
      } else {
        result = await pickFirstValidatedCandidate(charts, { ...options, source });
        if (!result) {
          recordChartFallback("source_photo");
        }
      }
    }
  }

  if (!result) {
    result = await resolveRssSourceImage({ source, item, articleUrl, ...options });
    if (result?.url) {
      const visualType = classifyImageVisualType(result.url, {
        ...result,
        title: item?.title,
        contextText: item?.contentSnippet || item?.content,
      });
      if (consumesPublicChartQuota(visualType)) {
        if (chartLimited) {
          recordChartRateLimited();
          recordChartFallback("text_only");
          recordChartQuotaTextFallback(chartPolicy);
          return null;
        }
        const reservation = await tryReservePublicChartQuota(chartPolicy);
        if (!reservation.granted) {
          recordChartRateLimited();
          recordChartFallback("text_only");
          recordChartQuotaTextFallback(chartPolicy);
          return null;
        }
      }
    } else {
      recordChartFallback("text_only");
    }
    return result;
  }

  if (result?.url) {
    const visualType = classifyImageVisualType(result.url, {
      ...result,
      title: item?.title,
      contextText: item?.contentSnippet || item?.content,
    });
    result.visualType = visualType;
  }

  return result;
}

function getChartPolicyTelemetrySnapshotMerged(options = {}) {
  return {
    ...getChartPolicyTelemetrySnapshot(),
    ...getPublicChartQuotaTelemetrySnapshot(options),
  };
}

async function getChartPolicyTelemetrySnapshotFromAuthority(options = {}) {
  const authorityPolicy = await syncPublicChartQuotaAuthority(options);
  return {
    ...getChartPolicyTelemetrySnapshot(),
    ...authorityPolicy,
    telemetrySource: "persistent_authority",
  };
}

function resetChartPolicyStateForTestsMerged() {
  resetChartPolicyStateForTests();
  resetPublicChartQuotaForTests();
}

module.exports = {
  resolveRssSourceImageWithChartPolicy,
  VISUAL_TYPES,
  getChartPolicyTelemetrySnapshot: getChartPolicyTelemetrySnapshotMerged,
  getChartPolicyTelemetrySnapshotFromAuthority,
  resetChartPolicyStateForTests: resetChartPolicyStateForTestsMerged,
  classifyImageVisualType,
  consumesPublicChartQuota,
  tryReservePublicChartQuota,
  isPublicChartQuotaBlocked,
  loadPublicChartQuotaState,
  getPublicChartQuotaTelemetrySnapshot,
  resetPublicChartQuotaForTests,
};
