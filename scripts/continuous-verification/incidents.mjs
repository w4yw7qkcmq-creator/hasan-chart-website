import fs from "node:fs";
import path from "node:path";
import { RUNBOOK_MAP } from "./config.mjs";

const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };

export function createIncident({ checkpoint, environment, commit, failedProbes, probeResults }) {
  const severity = highestPriority(failedProbes, probeResults);
  const incidentId = `CV-INC-${Date.now()}-${checkpoint.id}`;
  return {
    incidentId,
    checkpoint: checkpoint.id,
    detectedAt: new Date().toISOString(),
    environment,
    commit: commit || "unknown",
    failedProbes: failedProbes.map((p) => p.id),
    severity,
    summary: `${failedProbes.length} probe(s) failed at ${checkpoint.label}`,
    evidence: probeResults.filter((r) => r.status === "FAIL" || r.status === "WARN"),
    retries: probeResults.map((r) => ({ probe: r.probe, retryStatus: r.retryStatus, attempts: r.attempts })),
    suggestedRunbook: pickRunbook(failedProbes),
    status: "open",
    recoveredAt: null,
    timeline: [{ ts: new Date().toISOString(), type: "incident-created", message: summaryMessage(failedProbes) }],
  };
}

export function markRecovered(incident, checkpoint, probeResults) {
  const stillFailing = probeResults.filter((r) => r.status === "FAIL");
  if (stillFailing.length) return incident;
  return {
    ...incident,
    status: "recovered",
    recoveredAt: new Date().toISOString(),
    timeline: [
      ...incident.timeline,
      {
        ts: new Date().toISOString(),
        type: "recovered-automatically",
        message: `Checkpoint ${checkpoint.id} passed after prior failure`,
      },
    ],
  };
}

export function mergeIncidents(existing, created, checkpointResults) {
  const open = existing.filter((i) => i.status === "open");
  const updated = [];
  const newOnes = [];

  for (const inc of open) {
    const related = checkpointResults.filter((r) => inc.failedProbes.includes(r.probe));
    if (related.every((r) => r.status === "PASS" || r.status === "UNKNOWN")) {
      updated.push(markRecovered(inc, { id: inc.checkpoint }, checkpointResults));
    } else {
      updated.push(inc);
    }
  }

  if (created) newOnes.push(created);
  const resolved = existing.filter((i) => i.status !== "open");
  return [...resolved, ...updated, ...newOnes];
}

export function saveIncidents(dir, incidents) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "incidents.json");
  fs.writeFileSync(file, JSON.stringify({ incidents, updatedAt: new Date().toISOString() }, null, 2));
  return file;
}

export function loadIncidents(dir) {
  const file = path.join(dir, "incidents.json");
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8")).incidents || [];
}

function highestPriority(failedProbes, results) {
  const priorities = results
    .filter((r) => r.status === "FAIL" || (r.status === "WARN" && r.priority))
    .map((r) => r.priority || probePriority(r.probe))
    .filter(Boolean);
  if (priorities.includes("P0")) return "P0";
  if (priorities.includes("P1")) return "P1";
  if (priorities.includes("P2")) return "P2";
  return "P3";
}

function probePriority(probeId) {
  const map = {
    "web-health": "P0",
    "auth-gate": "P0",
    "instant-analysis-health": "P1",
    workers: "P1",
    "order-book": "P1",
    news: "P1",
    "release-gate": "P1",
    "operational-signals": "P2",
  };
  return map[probeId] || "P2";
}

function pickRunbook(failedProbes) {
  const id = failedProbes[0]?.id || "operational-signals";
  return `scripts/ops/docs/runbooks/${RUNBOOK_MAP[id] || "continuous-verification.md"}`;
}

function summaryMessage(failedProbes) {
  return `Failed: ${failedProbes.map((p) => p.id).join(", ")}`;
}

export function openIncidents(incidents) {
  return incidents.filter((i) => i.status === "open");
}

export function worstSeverity(incidents) {
  const open = openIncidents(incidents);
  if (!open.length) return null;
  return open.sort((a, b) => PRIORITY_ORDER[a.severity] - PRIORITY_ORDER[b.severity])[0].severity;
}
