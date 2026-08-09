const { ANOMALY_THRESHOLDS, SLO_THRESHOLDS_MS } = require("./config");
const { INCIDENT_TYPES, SEVERITY, REASON_CODES } = require("./reason-taxonomy");
const { openOrUpdateIncident } = require("./incident-engine");
const { logAutonomyEvent } = require("./structured-log");

const eventBursts = new Map();
const reasonSpikes = new Map();

function trackWindow(map, key, windowMs) {
  const now = Date.now();
  const entry = map.get(key) || { timestamps: [] };
  entry.timestamps.push(now);
  entry.timestamps = entry.timestamps.filter((t) => now - t <= windowMs);
  map.set(key, entry);
  return entry.timestamps.length;
}

function observeAnomaly(event = {}) {
  const anomalies = [];

  if (event.eventType) {
    const burstKey = `event:${event.eventType}`;
    const count = trackWindow(eventBursts, burstKey, ANOMALY_THRESHOLDS.sameEventTypeBurstWindowMs);
    if (count >= ANOMALY_THRESHOLDS.sameEventTypeBurstCount) {
      anomalies.push({ type: INCIDENT_TYPES.UNEXPECTED_PUBLICATION_PATH, severity: SEVERITY.HIGH, key: burstKey, count });
    }
  }

  if (event.reasonCode === REASON_CODES.DUPLICATE_BLOCKED) {
    const key = `dup:${event.sourceId || "global"}`;
    const count = trackWindow(reasonSpikes, key, ANOMALY_THRESHOLDS.duplicateSpikeWindowMs);
    if (count >= ANOMALY_THRESHOLDS.duplicateSpikeCount) {
      anomalies.push({ type: INCIDENT_TYPES.DUPLICATE_SPIKE, severity: SEVERITY.WARNING, key, count });
    }
  }

  if (event.reasonCode === REASON_CODES.QUALITY_GATE_BLOCKED) {
    const key = "quality";
    const count = trackWindow(reasonSpikes, key, ANOMALY_THRESHOLDS.duplicateSpikeWindowMs);
    if (count >= ANOMALY_THRESHOLDS.qualityBlockSpikeCount) {
      anomalies.push({ type: INCIDENT_TYPES.QUALITY_GATE_FAILURE_SPIKE, severity: SEVERITY.HIGH, key, count });
    }
  }

  if (event.reasonCode === REASON_CODES.IMAGE_REQUIRED_UNAVAILABLE) {
    const key = "image";
    const count = trackWindow(reasonSpikes, key, ANOMALY_THRESHOLDS.duplicateSpikeWindowMs);
    if (count >= ANOMALY_THRESHOLDS.imageFailureSpikeCount) {
      anomalies.push({ type: INCIDENT_TYPES.IMAGE_REQUIRED_FAILURE_SPIKE, severity: SEVERITY.HIGH, key, count });
    }
  }

  if (event.latencyMs != null && event.latencyMs > SLO_THRESHOLDS_MS.totalIngestToPublication) {
    const key = "latency";
    const count = trackWindow(reasonSpikes, key, ANOMALY_THRESHOLDS.duplicateSpikeWindowMs);
    if (count >= ANOMALY_THRESHOLDS.latencyDegradationStreak) {
      anomalies.push({ type: INCIDENT_TYPES.LATENCY_DEGRADATION, severity: SEVERITY.WARNING, key, count });
    }
  }

  for (const anomaly of anomalies) {
    openOrUpdateIncident({
      type: anomaly.type,
      severity: anomaly.severity,
      affectedSource: event.sourceId,
      affectedEventType: event.eventType,
      count: anomaly.count,
      evidenceSummary: { key: anomaly.key, reasonCode: event.reasonCode || null },
    });
    logAutonomyEvent("NEWS_ANOMALY_DETECTED", {
      type: anomaly.type,
      severity: anomaly.severity,
      sourceId: event.sourceId,
      eventType: event.eventType,
      count: anomaly.count,
    });
  }

  return anomalies;
}

function observeSilentFailure(check = {}) {
  if (!check.silent) return null;
  return openOrUpdateIncident({
    type: INCIDENT_TYPES.SILENT_FAILURE,
    severity: SEVERITY.CRITICAL,
    affectedSource: check.sourceId || null,
    evidenceSummary: check,
    autoAction: "alert_only",
  });
}

function resetAnomalyStateForTests() {
  eventBursts.clear();
  reasonSpikes.clear();
}

module.exports = {
  observeAnomaly,
  observeSilentFailure,
  resetAnomalyStateForTests,
};
