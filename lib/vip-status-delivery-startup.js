/**
 * Startup policy for VIP status delivery worker execution modes.
 */

export function resolveDisabledWorkerStartup({ oneShot, enabled }) {
  if (enabled) {
    return { action: "continue" };
  }

  if (oneShot) {
    return {
      action: "skip",
      exitCode: 0,
      event: "VIP_STATUS_DELIVERY_WORKER_SKIPPED",
      level: "info",
    };
  }

  return {
    action: "fatal",
    exitCode: 1,
    event: "VIP_STATUS_DELIVERY_WORKER_DISABLED_FATAL",
    level: "error",
    message:
      "VIP_STATUS_DELIVERY_WORKER_ENABLED is not truthy on dedicated persistent worker service",
  };
}
