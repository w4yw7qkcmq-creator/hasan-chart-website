export function createTimeline({ deployDetectedAt, checkpoints = [], incidents = [] }) {
  const events = [];

  if (deployDetectedAt) {
    events.push({ ts: deployDetectedAt, type: "deploy-detected", message: "Deploy detected — CV schedule armed" });
  }

  for (const cp of checkpoints) {
    events.push({ ts: cp.startedAt, type: "checkpoint-started", message: `${cp.label} started`, checkpoint: cp.id });
    for (const probe of cp.probes || []) {
      events.push({
        ts: probe.finishedAt || cp.finishedAt,
        type: "probe-result",
        checkpoint: cp.id,
        probe: probe.probe,
        status: probe.status,
        message: `${probe.probe}: ${probe.status}${probe.retried ? " (retried)" : ""}`,
      });
      if (probe.retryStatus === "Retried Successfully" || probe.retryStatus === "Retry Failed") {
        events.push({
          ts: probe.finishedAt,
          type: "retry-result",
          checkpoint: cp.id,
          probe: probe.probe,
          message: probe.retryStatus,
        });
      }
    }
    if (cp.verdict) {
      events.push({ ts: cp.finishedAt, type: "checkpoint-verdict", checkpoint: cp.id, message: cp.verdict });
    }
  }

  for (const inc of incidents) {
    events.push({ ts: inc.detectedAt, type: "incident-created", message: inc.summary, incidentId: inc.incidentId });
    if (inc.recoveredAt) {
      events.push({ ts: inc.recoveredAt, type: "incident-recovered", message: "Recovered automatically", incidentId: inc.incidentId });
    }
  }

  events.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  return events;
}

export function appendTimelineEvent(timeline, event) {
  return [...timeline, event].sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
}
