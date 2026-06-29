/**
 * Next.js price-alert runner — permanently disabled.
 * Canonical path: worker/index.js :: checkPriceAlerts + sendTriggeredAlertEmail
 */

export const PRICE_ALERTS_RUNNER_VERSION = "2026-06-28-v8-thirty-second-check";
export const CHECK_INTERVAL_MS = 30_000;
export const MAX_ALERTS_PER_RUN = 20;

const CANONICAL_PATH = "worker/index.js::checkPriceAlerts";

function logDisabled(action) {
  console.log(
    "PRICE_ALERT_RUNNER_DISABLED",
    JSON.stringify({
      action,
      reason: "NEXTJS_RUNNER_PERMANENTLY_DISABLED",
      canonicalPath: CANONICAL_PATH,
      moduleVersion: PRICE_ALERTS_RUNNER_VERSION,
      ts: new Date().toISOString(),
    })
  );
}

export async function checkPriceAlerts() {
  logDisabled("checkPriceAlerts");

  return {
    skipped: true,
    reason: "NEXTJS_RUNNER_PERMANENTLY_DISABLED",
    canonicalPath: CANONICAL_PATH,
    message: "Price alert emails and triggers run only from worker/index.js",
  };
}

export function startPriceAlertsScheduler() {
  logDisabled("startPriceAlertsScheduler");
}
