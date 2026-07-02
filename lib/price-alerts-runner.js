/** @deprecated Price alerts run exclusively in worker/index.js (Railway worker). */

import {
  logPriceAlertEmailBlockedFromWebsite,
  PRICE_ALERT_CANONICAL_PATH,
} from "./price-alert-email-guard.js";

export const PRICE_ALERTS_RUNNER_VERSION = "2026-06-23-v25-block-website-price-alert-email";
export const PRICE_ALERT_SINGLE_PATH = PRICE_ALERT_CANONICAL_PATH;
export const CHECK_INTERVAL_MS = 30_000;
export const MAX_ALERTS_PER_RUN = 20;

export async function checkPriceAlerts() {
  logPriceAlertEmailBlockedFromWebsite({
    path: "lib/price-alerts-runner.js::checkPriceAlerts",
  });

  throw new Error(
    "Price alerts are handled only by worker/index.js deliverRealPriceAlert on Railway."
  );
}
