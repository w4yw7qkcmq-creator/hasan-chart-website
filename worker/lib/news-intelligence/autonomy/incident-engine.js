const crypto = require("crypto");
const { INCIDENT_TYPES, SEVERITY } = require("./reason-taxonomy");
const { logAutonomyEvent } = require("./structured-log");
const { getMetricsAggregator } = require("./metrics-aggregator");

const DEDUPE_WINDOW_MS = 15 * 60_000;
const incidents = new Map();

function buildSignature(type, context = {}) {
  return crypto
    .createHash("sha256")
    .update([type, context.affectedSource || "", context.affectedEventType || ""].join("|"))
    .digest("hex")
    .slice(0, 24);
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
    logAutonomyEvent("NEWS_INCIDENT_UPDATED", {
      incidentId: existing.incidentId,
      type: existing.incidentType,
      count: existing.count,
      severity: existing.severity,
    });
    syncOpenCount();
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
  return incident;
}

function resolveIncident(signature) {
  const incident = incidents.get(signature);
  if (!incident) return null;
  incident.currentState = "resolved";
  incident.resolvedAt = new Date().toISOString();
  logAutonomyEvent("NEWS_INCIDENT_RESOLVED", { incidentId: incident.incidentId, type: incident.incidentType });
  syncOpenCount();
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
  syncOpenCount();
}

module.exports = {
  INCIDENT_TYPES,
  SEVERITY,
  openOrUpdateIncident,
  resolveIncident,
  getOpenIncidents,
  getAllIncidents,
  resetIncidentsForTests,
};
