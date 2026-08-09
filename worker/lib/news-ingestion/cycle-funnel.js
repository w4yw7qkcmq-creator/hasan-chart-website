function createEmptyFunnel() {
  return {
    rssFetched: 0,
    rssNew: 0,
    rssOldSeen: 0,
    rssDuplicates: 0,
    rssNoMarketAngle: 0,
    rssEligible: 0,
    rssEconomicBlocked: 0,
    rssEditorialEvaluated: 0,
    rssQualityBlocked: 0,
    rssCopyBlocked: 0,
    rssPublished: 0,
    rssStructuredEconomicSkipped: 0,
    rssStaleSkipped: 0,
    rssLowValueSkipped: 0,
    rssRateLimited: 0,
    telegramFetched: 0,
    telegramNew: 0,
    telegramOldSeen: 0,
    telegramPinnedOld: 0,
    telegramCandidates: 0,
    telegramNormalized: 0,
    telegramFactCheckFailed: 0,
    telegramDuplicates: 0,
    telegramEconomicEligible: 0,
    telegramPublished: 0,
    candidates: 0,
    normalized: 0,
    editorialEvaluated: 0,
    publicationAttempts: 0,
    publicationsSuccess: 0,
    publicationFailures: 0,
  };
}

let currentFunnel = createEmptyFunnel();

function resetCycleFunnel() {
  currentFunnel = createEmptyFunnel();
  return currentFunnel;
}

function getCycleFunnel() {
  return { ...currentFunnel };
}

function mergeRssDiagnostics(diagnostics = {}) {
  currentFunnel.rssFetched += diagnostics.fetched || 0;
  currentFunnel.rssNew += diagnostics.newItems || 0;
  currentFunnel.rssOldSeen += diagnostics.oldSeenSkipped || 0;
  currentFunnel.rssDuplicates += diagnostics.duplicateSkipped || 0;
  currentFunnel.rssNoMarketAngle += diagnostics.noMarketAngleSkipped || 0;
  currentFunnel.rssEligible += diagnostics.eligible || 0;
  currentFunnel.rssStructuredEconomicSkipped += diagnostics.structuredEconomicSkipped || 0;
  currentFunnel.rssStaleSkipped += diagnostics.staleSkipped || 0;
  currentFunnel.rssLowValueSkipped += diagnostics.lowValueSkipped || 0;
  currentFunnel.rssRateLimited += diagnostics.rateLimited || 0;
  currentFunnel.rssPublished += diagnostics.published || 0;
  currentFunnel.rssQualityBlocked += diagnostics.qualityRejected || 0;
  currentFunnel.normalized += diagnostics.normalized || 0;
  currentFunnel.candidates += diagnostics.newItems || 0;
}

function recordTelegramFunnel(summary = {}) {
  currentFunnel.telegramFetched += summary.fetched || 0;
  currentFunnel.telegramNew += summary.newMessages || 0;
  currentFunnel.telegramOldSeen += summary.oldSeen || 0;
  currentFunnel.telegramPinnedOld += summary.pinnedOld || 0;
  currentFunnel.telegramCandidates += summary.candidates || 0;
  currentFunnel.telegramNormalized += summary.normalized || 0;
  currentFunnel.telegramFactCheckFailed += summary.factCheckFailed || 0;
  currentFunnel.telegramEconomicEligible += summary.economicEligible || 0;
  currentFunnel.telegramPublished += summary.published || 0;
  currentFunnel.candidates += summary.newMessages || 0;
}

function recordRssEconomicBlocked(count = 1) {
  currentFunnel.rssEconomicBlocked += count;
}

function recordRssEditorialEvaluated(count = 1) {
  currentFunnel.rssEditorialEvaluated += count;
  currentFunnel.editorialEvaluated += count;
}

function recordRssCopyBlocked(count = 1) {
  currentFunnel.rssCopyBlocked += count;
}

function recordPublicationAttempt() {
  currentFunnel.publicationAttempts += 1;
}

function recordPublicationSuccess() {
  currentFunnel.publicationsSuccess += 1;
}

function recordPublicationFailure() {
  currentFunnel.publicationFailures += 1;
}

function resetCycleFunnelForTests() {
  currentFunnel = createEmptyFunnel();
}

module.exports = {
  createEmptyFunnel,
  resetCycleFunnel,
  getCycleFunnel,
  mergeRssDiagnostics,
  recordTelegramFunnel,
  recordRssEconomicBlocked,
  recordRssEditorialEvaluated,
  recordRssCopyBlocked,
  recordPublicationAttempt,
  recordPublicationSuccess,
  recordPublicationFailure,
  resetCycleFunnelForTests,
};
