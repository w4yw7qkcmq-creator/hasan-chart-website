const crypto = require("crypto");
const { INCIDENT_TYPES, SEVERITY } = require("./reason-taxonomy");
const { logAutonomyEvent } = require("./structured-log");
const { getMetricsAggregator } = require("./metrics-aggregator");

const DEDUPE_WINDOW_MS = 15 * 60_000;
const incidents = new Map();
const recentlyChanged = new Map();

function buildSignature(type, context = {}) {
  return crypto
    .createHash("sha256")
    .update([type, context.affectedSource || "", context.affectedEventType || ""].join("|"))
    .digest("hex")
    .slice(0, 24);
}

function markIncidentChanged(incident) {
  if (!incident?.incidentId) return;
  recentlyChanged.set(incident.incidentId, incident);
}

function drainChangedIncidents(limit = 100) {
  const batch = [...recentlyChanged.values()].slice(0, limit);
  for (const incident of batch) {
    recentlyChanged.delete(incident.incidentId);
  }
  return batch;
}

function resetChangedIncidentsForTests() {
  recentlyChanged.clear();
}

function openOrUpdateIncident(input = {}) {
  const type = input.type;
  const severity = input.severity || SEVERITY.WARNING;
  const signature = input.signature || buildSignature(type, input);
  const now = new Date().toISOString();
  const existing = incidents.get(signature);

  if (existing && Date.now() - new Date(existing.lastSeenAt).getTime() <= DEDUPE_WINDOW_MS) {
    existing.count += input.count || 1;
    existing.lastSeenAt = now;
    existing.evidenceSummary = { ...(existing.evidenceSummary || {}), ...(input.evidenceSummary || {}) };
    existing.currentState = "open";
    existing.resolvedAt = null;
    logAutonomyEvent("NEWS_INCIDENT_UPDATED", {
      incidentId: existing.incidentId,
      type: existing.incidentType,
      count: existing.count,
      severity: existing.severity,
    });
    syncOpenCount();
    markIncidentChanged(existing);
    return existing;
  }

  const incidentId = `inc-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const incident = {
    incidentId,
    severity,
    incidentType: type,
    signature,
    startedAt: now,
    lastSeenAt: now,
    affectedSource: input.affectedSource || null,
    affectedEventType: input.affectedEventType || null,
    count: input.count || 1,
    evidenceSummary: input.evidenceSummary || {},
    currentState: "open",
    autoAction: input.autoAction || null,
    resolvedAt: null,
  };
  incidents.set(signature, incident);
  logAutonomyEvent("NEWS_INCIDENT_OPENED", {
    incidentId,
    type,
    severity,
    affectedSource: incident.affectedSource,
  });
  syncOpenCount();
  markIncidentChanged(incident);
  return incident;
}

function resolveIncident(signature, options = {}) {
  const incident = incidents.get(signature);
  if (!incident || incident.currentState === "resolved") return null;
  incident.currentState = "resolved";
  incident.resolvedAt = new Date().toISOString();
  if (options.resolutionReason) {
    incident.evidenceSummary = {
      ...(incident.evidenceSummary || {}),
      ...(options.evidenceSummary || {}),
      resolutionReason: options.resolutionReason,
    };
  } else if (options.evidenceSummary) {
    incident.evidenceSummary = {
      ...(incident.evidenceSummary || {}),
      ...(options.evidenceSummary || {}),
    };
  }
  logAutonomyEvent("NEWS_INCIDENT_RESOLVED", {
    incidentId: incident.incidentId,
    type: incident.incidentType,
    resolutionReason: options.resolutionReason || null,
  });
  syncOpenCount();
  markIncidentChanged(incident);
  return incident;
}

function getOpenIncidents() {
  return [...incidents.values()].filter((i) => i.currentState === "open");
}

function getAllIncidents() {
  return [...incidents.values()];
}

function syncOpenCount() {
  getMetricsAggregator().setIncidentOpenCount(getOpenIncidents().length);
}

function resetIncidentsForTests() {
  incidents.clear();
  recentlyChanged.clear();
  syncOpenCount();
}

module.exports = {
  INCIDENT_TYPES,
  SEVERITY,
  buildSignature,
  openOrUpdateIncident,
  resolveIncident,
  getOpenIncidents,
  getAllIncidents,
  drainChangedIncidents,
  resetChangedIncidentsForTests,
  resetIncidentsForTests,
};
