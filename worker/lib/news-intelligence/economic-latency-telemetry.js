const MAX_SAMPLES = 200;

/** @type {Array<Record<string, unknown>>} */
let samples = [];

/** @type {{ lastRelease: object|null, avgMs: number|null, p50Ms: number|null, p95Ms: number|null, count: number }} */
let aggregate = {
  lastRelease: null,
  avgMs: null,
  p50Ms: null,
  p95Ms: null,
  count: 0,
};

function percentile(values, ratio) {
  if (!values.length) {
    return null;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function recomputeAggregate() {
  const sourceToTelegram = samples
    .map((sample) => sample.sourceToTelegramMs)
    .filter((value) => typeof value === "number" && Number.isFinite(value));

  aggregate.count = sourceToTelegram.length;
  aggregate.avgMs = sourceToTelegram.length
    ? Math.round(sourceToTelegram.reduce((sum, value) => sum + value, 0) / sourceToTelegram.length)
    : null;
  aggregate.p50Ms = percentile(sourceToTelegram, 0.5);
  aggregate.p95Ms = percentile(sourceToTelegram, 0.95);
  aggregate.lastRelease = samples[0] || null;
}

function deriveTimings(input = {}, now = Date.now()) {
  const sourcePublishedAt = input.sourcePublishedAt || null;
  const sourceObservedAt = input.sourceObservedAt || input.workerFetchedAt || null;
  const workerFetchedAt = input.workerFetchedAt || sourceObservedAt || null;
  const publicationReadyAt = input.publicationReadyAt || null;
  const telegramSentAt = input.telegramSentAt || new Date(now).toISOString();

  const toMs = (value) => {
    if (!value) return null;
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? null : ms;
  };

  const sourceMs = toMs(sourcePublishedAt);
  const observedMs = toMs(sourceObservedAt);
  const fetchedMs = toMs(workerFetchedAt);
  const readyMs = toMs(publicationReadyAt);
  const telegramMs = toMs(telegramSentAt);

  return {
    sourcePublishedAt,
    sourceObservedAt,
    workerFetchedAt,
    parsedAt: input.parsedAt || null,
    canonicalResolvedAt: input.canonicalResolvedAt || null,
    publicationReadyAt,
    imageReadyAt: input.imageReadyAt || null,
    telegramSentAt,
    siteSavedAt: input.siteSavedAt || null,
    sourceToObservedMs: sourceMs != null && observedMs != null ? observedMs - sourceMs : null,
    observedToFetchedMs: observedMs != null && fetchedMs != null ? fetchedMs - observedMs : null,
    fetchedToReadyMs: fetchedMs != null && readyMs != null ? readyMs - fetchedMs : null,
    readyToTelegramMs: readyMs != null && telegramMs != null ? telegramMs - readyMs : null,
    sourceToTelegramMs: sourceMs != null && telegramMs != null ? telegramMs - sourceMs : null,
    observedToTelegramMs: observedMs != null && telegramMs != null ? telegramMs - observedMs : null,
  };
}

function recordEconomicLatencySample(input = {}) {
  const sample = {
    eventKey: input.eventKey || input.eventType || null,
    eventType: input.eventType || null,
    sourceId: input.sourceId || null,
    sourceMessageId: input.sourceMessageId || null,
    fastLane: input.fastLane === true,
    textFirst: input.textFirst === true,
    imageCacheHit: input.imageCacheHit === true,
    ...deriveTimings(input),
  };

  samples.unshift(sample);
  if (samples.length > MAX_SAMPLES) {
    samples.length = MAX_SAMPLES;
  }
  recomputeAggregate();
  return sample;
}

function getEconomicLatencyMetrics() {
  return {
    ...aggregate,
    samples: samples.slice(0, 20),
  };
}

function resetEconomicLatencyForTests() {
  samples = [];
  aggregate = {
    lastRelease: null,
    avgMs: null,
    p50Ms: null,
    p95Ms: null,
    count: 0,
  };
}

module.exports = {
  deriveTimings,
  recordEconomicLatencySample,
  getEconomicLatencyMetrics,
  resetEconomicLatencyForTests,
};
