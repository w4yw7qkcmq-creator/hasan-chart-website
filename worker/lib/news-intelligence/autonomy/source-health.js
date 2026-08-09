const { SOURCE_HEALTH_THRESHOLDS, ROLLING_WINDOWS_MS } = require("./config");
const { FAILURE_ATTRIBUTION, classifySampleEntry } = require("./failure-attribution");
const { logAutonomyEvent } = require("./structured-log");

const HEALTH_STATES = Object.freeze({
  HEALTHY: "HEALTHY",
  DEGRADED: "DEGRADED",
  QUARANTINED: "QUARANTINED",
  RECOVERING: "RECOVERING",
});

const workerStartedAt = Date.now();
const networkFailureWindow = [];

function createSourceStats() {
  return {
    messagesReceived: 0,
    economicCandidates: 0,
    parseSuccess: 0,
    parseFailure: 0,
    sourceCausedFailures: 0,
    sourceCausedConsecutive: 0,
    pipelineBlocks: 0,
    networkFailures: 0,
    numericExtractionSuccess: 0,
    invalidStructure: 0,
    sourceInvalidStructure: 0,
    duplicateBlocks: 0,
    copyBlocks: 0,
    promotionalLeakAttempts: 0,
    fetchSuccess: 0,
    fetchFailure: 0,
    staleSkipped: 0,
    zeroArticleCycles: 0,
    healthyStreak: 0,
    lastSeenAt: null,
    lastSuccessAt: null,
    lastStateChangeAt: null,
    stateReason: null,
    samples: [],
  };
}

function createSourceHealthEngine(options = {}) {
  const thresholds = { ...SOURCE_HEALTH_THRESHOLDS, ...(options.thresholds || {}) };
  const sources = new Map();
  let startupGraceUntil = workerStartedAt + thresholds.startupGraceMs;
  let networkOutageActive = false;
  let networkOutageUntil = 0;

  function keyFor(sourceType, sourceId) {
    return `${sourceType || "unknown"}:${sourceId || "unknown"}`;
  }

  function getStats(sourceType, sourceId) {
    const key = keyFor(sourceType, sourceId);
    if (!sources.has(key)) {
      sources.set(key, {
        key,
        sourceType,
        sourceId,
        state: HEALTH_STATES.HEALTHY,
        stats: createSourceStats(),
      });
    }
    return sources.get(key);
  }

  function inStartupGrace() {
    return Date.now() < startupGraceUntil;
  }

  function setStartupGrace(ms) {
    startupGraceUntil = Date.now() + ms;
  }

  function trimSamples(stats) {
    const now = Date.now();
    stats.samples = stats.samples.filter((s) => now - s.at <= ROLLING_WINDOWS_MS.day);
  }

  function totalAttempts(stats) {
    return stats.parseSuccess + stats.parseFailure + stats.fetchSuccess + stats.fetchFailure;
  }

  function hasMinimumSamples(stats) {
    return totalAttempts(stats) >= thresholds.minimumSampleSize;
  }

  function parseSuccessRate(stats) {
    const attempts = stats.parseSuccess + stats.parseFailure;
    if (!attempts) return 1;
    return stats.parseSuccess / attempts;
  }

  function recordNetworkFailure(sourceId) {
    const now = Date.now();
    networkFailureWindow.push({ at: now, sourceId });
    while (networkFailureWindow.length && now - networkFailureWindow[0].at > thresholds.networkOutageWindowMs) {
      networkFailureWindow.shift();
    }
    const uniqueSources = new Set(networkFailureWindow.map((e) => e.sourceId).filter(Boolean));
    if (uniqueSources.size >= thresholds.networkOutageMinSources) {
      networkOutageActive = true;
      networkOutageUntil = now + thresholds.networkOutageWindowMs;
      logAutonomyEvent("NEWS_NETWORK_OUTAGE_DETECTED", {
        sourceCount: uniqueSources.size,
        sources: [...uniqueSources],
      });
    }
  }

  function isNetworkOutageActive() {
    if (networkOutageActive && Date.now() > networkOutageUntil) {
      networkOutageActive = false;
    }
    return networkOutageActive;
  }

  function recordSample(entry, sourceType, sourceId) {
    const src = getStats(sourceType, sourceId);
    const stats = src.stats;
    const attribution = classifySampleEntry(entry);
    const enriched = { ...entry, attribution, at: Date.now() };
    stats.lastSeenAt = new Date().toISOString();
    trimSamples(stats);

    if (entry.messagesReceived) stats.messagesReceived += entry.messagesReceived;
    if (entry.economicCandidates) stats.economicCandidates += entry.economicCandidates;

    if (entry.parseSuccess) {
      stats.parseSuccess += entry.parseSuccess;
      stats.sourceCausedConsecutive = 0;
      stats.healthyStreak += 1;
      stats.lastSuccessAt = new Date().toISOString();
    }

    if (entry.parseFailure) {
      if (attribution === FAILURE_ATTRIBUTION.SOURCE_CAUSED) {
        stats.parseFailure += entry.parseFailure;
        stats.sourceCausedFailures += entry.parseFailure;
        stats.sourceCausedConsecutive += entry.parseFailure;
        stats.healthyStreak = 0;
      } else {
        stats.pipelineBlocks += entry.parseFailure;
      }
    }

    if (entry.numericExtractionSuccess) stats.numericExtractionSuccess += entry.numericExtractionSuccess;

    if (entry.invalidStructure) {
      if (attribution === FAILURE_ATTRIBUTION.SOURCE_CAUSED) {
        stats.invalidStructure += entry.invalidStructure;
        stats.sourceInvalidStructure += entry.invalidStructure;
        stats.sourceCausedConsecutive += entry.invalidStructure;
        stats.healthyStreak = 0;
      }
    }

    if (entry.duplicateBlocks) stats.duplicateBlocks += entry.duplicateBlocks;
    if (entry.copyBlocks && attribution === FAILURE_ATTRIBUTION.SOURCE_CAUSED) stats.copyBlocks += entry.copyBlocks;
    if (entry.promotionalLeakAttempts) {
      stats.promotionalLeakAttempts += entry.promotionalLeakAttempts;
      stats.sourceInvalidStructure += entry.promotionalLeakAttempts;
      stats.sourceCausedConsecutive += entry.promotionalLeakAttempts;
      stats.healthyStreak = 0;
    }

    if (entry.fetchSuccess) {
      stats.fetchSuccess += entry.fetchSuccess;
      stats.sourceCausedConsecutive = 0;
      stats.healthyStreak += 1;
      stats.lastSuccessAt = new Date().toISOString();
    }

    if (entry.fetchFailure) {
      stats.fetchFailure += entry.fetchFailure;
      stats.networkFailures += entry.fetchFailure;
      if (attribution === FAILURE_ATTRIBUTION.NETWORK_CAUSED) {
        recordNetworkFailure(sourceId);
      }
      if (!isNetworkOutageActive()) {
        stats.sourceCausedConsecutive += 1;
        stats.healthyStreak = 0;
      }
    }

    if (entry.staleSkipped) stats.staleSkipped += entry.staleSkipped;
    if (entry.zeroArticleCycles) stats.zeroArticleCycles += entry.zeroArticleCycles;

    stats.samples.push(enriched);
    evaluateState(src);
    return src;
  }

  function canEscalateToDegraded(src) {
    const stats = src.stats;
    if (inStartupGrace()) return false;
    if (!hasMinimumSamples(stats)) return false;
    if (isNetworkOutageActive()) return false;
    if (stats.healthyStreak >= thresholds.recoveryHealthyStreak && stats.sourceCausedConsecutive === 0) {
      return false;
    }
    const rate = parseSuccessRate(stats);
    const consecutiveOrStructure =
      stats.sourceCausedConsecutive >= thresholds.degraded.sourceCausedConsecutiveFailures ||
      stats.sourceInvalidStructure >= thresholds.degraded.sourceCausedInvalidStructure;
    if (src.state === HEALTH_STATES.RECOVERING || src.state === HEALTH_STATES.QUARANTINED) {
      return stats.sourceCausedConsecutive >= thresholds.degraded.sourceCausedConsecutiveFailures;
    }
    const rateBased = rate < thresholds.degraded.parseSuccessRateMin;
    if (rateBased && !consecutiveOrStructure) {
      if (stats.healthyStreak > 0) return false;
      if (
        stats.lastStateChangeAt &&
        Date.now() - new Date(stats.lastStateChangeAt).getTime() < thresholds.hysteresisMs
      ) {
        return false;
      }
    }
    return consecutiveOrStructure || rateBased;
  }

  function canEscalateToQuarantine(src) {
    const stats = src.stats;
    if (inStartupGrace()) return false;
    if (!hasMinimumSamples(stats)) return false;
    if (isNetworkOutageActive()) return false;
    const rate = parseSuccessRate(stats);
    const cooledDown =
      !src.stats.lastStateChangeAt ||
      Date.now() - new Date(src.stats.lastStateChangeAt).getTime() >= thresholds.quarantineCooldownMs;
    if (!cooledDown && src.state === HEALTH_STATES.DEGRADED) return false;
    const consecutiveOrStructure =
      stats.sourceCausedConsecutive >= thresholds.quarantined.sourceCausedConsecutiveFailures ||
      stats.sourceInvalidStructure >= thresholds.quarantined.sourceCausedInvalidStructure;
    if (src.state === HEALTH_STATES.RECOVERING) {
      return stats.sourceCausedConsecutive >= thresholds.quarantined.sourceCausedConsecutiveFailures;
    }
    return consecutiveOrStructure || rate < thresholds.quarantined.parseSuccessRateMin;
  }

  function evaluateState(src) {
    const stats = src.stats;
    const prev = src.state;
    const rate = parseSuccessRate(stats);

    if (canEscalateToQuarantine(src)) {
      src.state = HEALTH_STATES.QUARANTINED;
      stats.stateReason = "source_caused_threshold";
    } else if (canEscalateToDegraded(src)) {
      src.state = HEALTH_STATES.DEGRADED;
      stats.stateReason = "source_caused_degraded";
    } else if (prev === HEALTH_STATES.QUARANTINED || prev === HEALTH_STATES.DEGRADED || prev === HEALTH_STATES.RECOVERING) {
      if (stats.healthyStreak >= thresholds.recoveryHealthyStreak && hasMinimumSamples(stats)) {
        src.state = HEALTH_STATES.HEALTHY;
        stats.stateReason = "recovery_streak";
      } else if (prev === HEALTH_STATES.QUARANTINED) {
        src.state = HEALTH_STATES.RECOVERING;
        stats.stateReason = "quarantine_recovery";
      } else {
        src.state = HEALTH_STATES.HEALTHY;
        stats.stateReason = "metrics_normalized";
      }
    } else {
      src.state = HEALTH_STATES.HEALTHY;
      stats.stateReason = inStartupGrace() ? "startup_grace" : "healthy";
    }

    if (prev !== src.state) {
      stats.lastStateChangeAt = new Date().toISOString();
      logAutonomyEvent("NEWS_SOURCE_HEALTH_STATE_CHANGED", {
        sourceType: src.sourceType,
        sourceId: src.sourceId,
        from: prev,
        to: src.state,
        parseSuccessRate: Number(rate.toFixed(3)),
        sourceCausedConsecutive: stats.sourceCausedConsecutive,
        minimumSamplesMet: hasMinimumSamples(stats),
        startupGrace: inStartupGrace(),
        reason: stats.stateReason,
      });
    }
  }

  function hydrateSourceHealth(sourceType, sourceId, persisted = {}) {
    const src = getStats(sourceType, sourceId);
    if (persisted.state) {
      src.state =
        persisted.state === HEALTH_STATES.QUARANTINED ? HEALTH_STATES.RECOVERING : persisted.state;
      src.stats.stateReason = "persisted_restart";
      src.stats.lastStateChangeAt = persisted.updatedAt || new Date().toISOString();
    }
    return src;
  }

  function isQuarantined(sourceType, sourceId) {
    if (inStartupGrace()) return false;
    return getStats(sourceType, sourceId).state === HEALTH_STATES.QUARANTINED;
  }

  function getSourceHealth(sourceType, sourceId) {
    const src = getStats(sourceType, sourceId);
    return {
      sourceType,
      sourceId,
      state: src.state,
      parseSuccessRate: parseSuccessRate(src.stats),
      sourceCausedConsecutive: src.stats.sourceCausedConsecutive,
      sourceInvalidStructure: src.stats.sourceInvalidStructure,
      duplicateBlocks: src.stats.duplicateBlocks,
      pipelineBlocks: src.stats.pipelineBlocks,
      networkFailures: src.stats.networkFailures,
      totalSamples: totalAttempts(src.stats),
      minimumSamplesMet: hasMinimumSamples(src.stats),
      healthyStreak: src.stats.healthyStreak,
      lastSeenAt: src.stats.lastSeenAt,
      lastSuccessAt: src.stats.lastSuccessAt,
      stateReason: src.stats.stateReason,
      startupGrace: inStartupGrace(),
    };
  }

  function getAllSources() {
    return [...sources.values()].map((src) => getSourceHealth(src.sourceType, src.sourceId));
  }

  function resetForTests() {
    sources.clear();
    networkFailureWindow.length = 0;
    networkOutageActive = false;
    startupGraceUntil = Date.now() + thresholds.startupGraceMs;
  }

  return {
    HEALTH_STATES,
    FAILURE_ATTRIBUTION,
    recordSample,
    isQuarantined,
    getSourceHealth,
    getAllSources,
    hydrateSourceHealth,
    inStartupGrace,
    setStartupGrace,
    hasMinimumSamples,
    isNetworkOutageActive,
    resetForTests,
  };
}

let defaultEngine = null;

function getSourceHealthEngine(options = {}) {
  if (options.reset === true || !defaultEngine) {
    defaultEngine = createSourceHealthEngine(options);
  }
  return defaultEngine;
}

function resetSourceHealthEngineForTests() {
  defaultEngine = null;
}

module.exports = {
  HEALTH_STATES,
  FAILURE_ATTRIBUTION,
  createSourceHealthEngine,
  getSourceHealthEngine,
  resetSourceHealthEngineForTests,
};
