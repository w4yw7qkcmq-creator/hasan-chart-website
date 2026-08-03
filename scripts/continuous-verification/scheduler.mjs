import { CHECKPOINTS, CHECKPOINT_PROBE_MAP, CV_VERSION, SCHEDULER_BACKENDS } from "./config.mjs";

/**
 * Scheduling abstraction — no daemon. Supports manual, CI, Railway cron, GitHub Actions.
 */
export function getSchedulerPlan({ deployDetectedAt = new Date().toISOString(), backend = "manual" } = {}) {
  const base = new Date(deployDetectedAt).getTime();
  return {
    version: CV_VERSION,
    backend: SCHEDULER_BACKENDS.includes(backend) ? backend : "manual",
    deployDetectedAt,
    checkpoints: CHECKPOINTS.map((cp) => ({
      ...cp,
      scheduledAt: new Date(base + cp.delayMs).toISOString(),
      probes: CHECKPOINT_PROBE_MAP[cp.id],
      executeCommand: `npm run cv:checkpoint -- --id=${cp.id}`,
    })),
    note: "Scheduler plan only — not executed until cv:checkpoint or external cron invokes it.",
  };
}

export function getCheckpoint(id) {
  const cp = CHECKPOINTS.find((c) => c.id === id);
  if (!cp) throw new Error(`Unknown checkpoint: ${id}`);
  return { ...cp, probes: CHECKPOINT_PROBE_MAP[cp.id] };
}

export function listCheckpointIds() {
  return CHECKPOINTS.map((c) => c.id);
}
