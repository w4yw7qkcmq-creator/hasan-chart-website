const metrics = {
  cyclesTotal: 0,
  cyclesSucceeded: 0,
  cyclesFailed: 0,
  cyclesSkippedOverlap: 0,
  fetched: 0,
  accepted: 0,
  rejected: 0,
  duplicatesSkipped: 0,
  publishedSite: 0,
  publishedTelegram: 0,
  aiCalls: 0,
  aiFailures: 0,
  aiCacheHits: 0,
  imageFetches: 0,
  imageFailures: 0,
  imageFallbacks: 0,
  lastCycleAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastDurationMs: null,
  lastErrorSafe: null,
};

function recordCycleStart() {
  metrics.cyclesTotal += 1;
  metrics.lastCycleAt = new Date().toISOString();
}

function recordCycleSuccess(stats = {}) {
  metrics.cyclesSucceeded += 1;
  metrics.lastSuccessAt = new Date().toISOString();
  metrics.lastDurationMs = stats.cycleDurationMs ?? null;
  metrics.lastErrorSafe = null;
  metrics.fetched += stats.fetched || 0;
  metrics.accepted += stats.eligible || stats.telegramDeduped || 0;
  metrics.rejected += (stats.rejectedFilter || 0) + (stats.rejectedDuplicate || 0);
  metrics.duplicatesSkipped += stats.rejectedDuplicate || stats.rss?.duplicateSkipped || 0;
  metrics.publishedSite += stats.dbInserted || 0;
  metrics.publishedTelegram += stats.telegramPublished || 0;
  metrics.aiCalls += stats.aiProcessed || 0;
  metrics.aiFailures += stats.aiFailed || 0;
}

function recordCycleFailure(stats = {}) {
  metrics.cyclesFailed += 1;
  metrics.lastFailureAt = new Date().toISOString();
  metrics.lastDurationMs = stats.cycleDurationMs ?? null;
  metrics.lastErrorSafe = stats.lastErrorSafe ? String(stats.lastErrorSafe).slice(0, 120) : "cycle_failed";
}

function recordCycleSkippedOverlap() {
  metrics.cyclesSkippedOverlap += 1;
}

function recordAiCacheHit() {
  metrics.aiCacheHits += 1;
}

function recordImageFetch({ success = true, fallback = false } = {}) {
  metrics.imageFetches += 1;
  if (!success) metrics.imageFailures += 1;
  if (fallback) metrics.imageFallbacks += 1;
}

function getMetricsSnapshot() {
  return { ...metrics };
}

function resetMetricsForTests() {
  for (const key of Object.keys(metrics)) {
    if (typeof metrics[key] === "number") metrics[key] = 0;
    else metrics[key] = null;
  }
}

module.exports = {
  recordCycleStart,
  recordCycleSuccess,
  recordCycleFailure,
  recordCycleSkippedOverlap,
  recordAiCacheHit,
  recordImageFetch,
  getMetricsSnapshot,
  resetMetricsForTests,
};
