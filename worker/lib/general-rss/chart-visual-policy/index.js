const { resolveRssSourceImage, collectRssMediaCandidates, pickFirstValidatedCandidate } = require("../rss-source-image-resolver");
const { classifyImageVisualType, VISUAL_TYPES } = require("./chart-classifier");
const {
  loadChartPolicyState,
  isChartRateLimited,
  recordChartImagePublished,
  recordChartCandidate,
  recordChartRateLimited,
  recordChartFallback,
  getChartPolicyTelemetrySnapshot,
  resetChartPolicyStateForTests,
} = require("./chart-rate-limit");

async function resolveRssSourceImageWithChartPolicy(params = {}) {
  const { source, item, articleUrl, chartPolicy = {}, ...options } = params;
  const state = await loadChartPolicyState(chartPolicy);
  const chartLimited = isChartRateLimited(Date.now(), state);
  const candidates = collectRssMediaCandidates(item, articleUrl);

  const ordered = [];
  const charts = [];
  for (const candidate of candidates) {
    const visualType = classifyImageVisualType(candidate.url, candidate);
    const enriched = { ...candidate, visualType };
    if (visualType === VISUAL_TYPES.CHART) {
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
      result = await pickFirstValidatedCandidate(charts, { ...options, source });
      if (result) {
        await recordChartImagePublished(Date.now(), chartPolicy);
      }
    }
  }

  if (!result) {
    result = await resolveRssSourceImage({ source, item, articleUrl, ...options });
    if (result?.url) {
      const visualType = classifyImageVisualType(result.url, result);
      if (visualType === VISUAL_TYPES.CHART && chartLimited) {
        recordChartRateLimited();
        recordChartFallback("text_only");
        return null;
      }
      if (visualType === VISUAL_TYPES.CHART) {
        await recordChartImagePublished(Date.now(), chartPolicy);
      }
    } else {
      recordChartFallback("text_only");
    }
    return result;
  }

  if (result?.url) {
    const visualType = classifyImageVisualType(result.url, result);
    result.visualType = visualType;
    if (visualType === VISUAL_TYPES.CHART && !chartLimited) {
      await recordChartImagePublished(Date.now(), chartPolicy);
    }
  }

  return result;
}

module.exports = {
  resolveRssSourceImageWithChartPolicy,
  VISUAL_TYPES,
  getChartPolicyTelemetrySnapshot,
  resetChartPolicyStateForTests,
  classifyImageVisualType,
};
