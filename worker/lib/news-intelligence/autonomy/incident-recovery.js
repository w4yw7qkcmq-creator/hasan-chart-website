const { logAutonomyEvent } = require("./structured-log");
const {
  openOrUpdateIncident,
  resolveIncident,
  buildSignature,
  getOpenIncidents,
} = require("./incident-engine");
const { persistIncident } = require("./incident-persistence");
const { INCIDENT_TYPES, SEVERITY } = require("./reason-taxonomy");
const { getHeartbeat } = require("./heartbeat");
const { ANOMALY_THRESHOLDS } = require("./config");

function evaluatePipelineStallWindow(window = []) {
  if (window.length < ANOMALY_THRESHOLDS.pipelineStallWindowCycles) {
    return { active: false, eligibleSum: 0, publishedSum: 0, newObservedSum: 0 };
  }
  const eligibleSum = window.reduce((sum, entry) => sum + (entry.eligible || 0), 0);
  const publishedSum = window.reduce((sum, entry) => sum + (entry.published || 0), 0);
  const newObservedSum = window.reduce((sum, entry) => sum + (entry.newObserved || 0), 0);
  const active =
    eligibleSum >= ANOMALY_THRESHOLDS.pipelineStallEligibleMin &&
    publishedSum <= ANOMALY_THRESHOLDS.pipelineStallPublicationMax;
  return { active, eligibleSum, publishedSum, newObservedSum, windowCycles: window.length };
}

function isPollingHealthy(options = {}) {
  const now = Date.now();
  const heartbeat = getHeartbeat();
  const lastRssPollMs = heartbeat.lastRssPollAt ? new Date(heartbeat.lastRssPollAt).getTime() : options.lastRssPollAt;
  const lastTelegramPollMs = heartbeat.lastTelegramPollAt
    ? new Date(heartbeat.lastTelegramPollAt).getTime()
    : options.lastTelegramPollAt;

  if (!lastRssPollMs || now - lastRssPollMs > ANOMALY_THRESHOLDS.pollSilenceMs) {
    return false;
  }
  if (!lastTelegramPollMs || now - lastTelegramPollMs > ANOMALY_THRESHOLDS.pollSilenceMs) {
    return false;
  }
  if (heartbeat.lastCycleStartedAt && !heartbeat.lastCycleCompletedAt) {
    const started = new Date(heartbeat.lastCycleStartedAt).getTime();
    if (now - started > ANOMALY_THRESHOLDS.cycleIncompleteMs) {
      return false;
    }
  }
  return true;
}

function countHealthyRecoveryWindows(window = []) {
  const recoveryCycles = ANOMALY_THRESHOLDS.pipelineRecoveryWindowCycles || 3;
  const recent = window.slice(-recoveryCycles);
  if (recent.length < recoveryCycles) {
    return 0;
  }
  return recent.filter((entry) => {
    const eligible = entry.eligible || 0;
    const published = entry.published || 0;
    const newObserved = entry.newObserved || 0;
    if (eligible >= ANOMALY_THRESHOLDS.pipelineStallEligibleMin && published <= ANOMALY_THRESHOLDS.pipelineStallPublicationMax) {
      return false;
    }
    if (newObserved === 0 && eligible === 0) {
      return true;
    }
    return published > 0 || eligible < ANOMALY_THRESHOLDS.pipelineStallEligibleMin;
  }).length;
}

function shouldResolvePipelineStallIncident(window = [], options = {}) {
  const stall = evaluatePipelineStallWindow(window);
  if (stall.active) {
    return { shouldResolve: false, reason: "condition_still_active" };
  }
  if (!isPollingHealthy(options)) {
    return { shouldResolve: false, reason: "polling_not_healthy" };
  }
  const healthyWindows = countHealthyRecoveryWindows(window);
  const required = ANOMALY_THRESHOLDS.pipelineRecoveryWindowCycles || 3;
  if (healthyWindows < required) {
    return { shouldResolve: false, reason: "insufficient_recovery_windows", healthyWindows, required };
  }
  return { shouldResolve: true, reason: "condition_recovered", healthyWindows, required };
}

function resolvePipelineStallIncidentIfRecovered(window = [], options = {}) {
  const decision = shouldResolvePipelineStallIncident(window, options);
  if (!decision.shouldResolve) {
    return { resolved: false, ...decision };
  }

  const signature = buildSignature(INCIDENT_TYPES.NEWS_PUBLICATION_PIPELINE_STALL, {});
  const incident = resolveIncident(signature, {
    resolutionReason: "condition_recovered",
    evidenceSummary: {
      resolutionReason: "condition_recovered",
      healthyWindows: decision.healthyWindows,
      requiredHealthyWindows: decision.required,
    },
  });

  if (!incident) {
    return { resolved: false, reason: "no_open_incident" };
  }

  logAutonomyEvent("NEWS_INCIDENT_RESOLVED", {
    incidentId: incident.incidentId,
    type: incident.incidentType,
    resolutionReason: "condition_recovered",
  });

  return { resolved: true, incident, ...decision };
}

async function reconcileStaleOpenIncidents(supabase, options = {}) {
  if (!supabase) {
    return { reconciled: 0, skipped: true };
  }

  const { data, error } = await supabase
    .from("news_incidents")
    .select("*")
    .eq("current_state", "open")
    .eq("incident_type", INCIDENT_TYPES.NEWS_PUBLICATION_PIPELINE_STALL)
    .order("last_seen_at", { ascending: false })
    .limit(50);

  if (error) {
    return { reconciled: 0, error: error.message };
  }

  const rows = (data || []).filter((row) => !row.evidence_summary?.canary);
  const decision = options.forceResolve
    ? { shouldResolve: true, reason: "condition_recovered" }
    : shouldResolvePipelineStallIncident(options.pipelineStallWindow || [], options);
  if (!decision.shouldResolve) {
    return { reconciled: 0, reason: decision.reason, candidateCount: rows.length };
  }

  let reconciled = 0;
  const now = new Date().toISOString();
  for (const row of rows) {
    const evidenceSummary = {
      ...(row.evidence_summary || {}),
      resolutionReason: "condition_recovered",
      reconciledAt: now,
    };
    const { error: updateError } = await supabase
      .from("news_incidents")
      .update({
        current_state: "resolved",
        resolved_at: now,
        evidence_summary: evidenceSummary,
        updated_at: now,
      })
      .eq("incident_id", row.incident_id)
      .eq("current_state", "open");

    if (!updateError) {
      reconciled += 1;
      resolveIncident(row.signature, {
        resolutionReason: "condition_recovered",
        evidenceSummary,
      });
    }
  }

  return { reconciled, candidateCount: rows.length, reason: "condition_recovered" };
}

module.exports = {
  evaluatePipelineStallWindow,
  shouldResolvePipelineStallIncident,
  resolvePipelineStallIncidentIfRecovered,
  reconcileStaleOpenIncidents,
  isPollingHealthy,
};
