/** @deprecated Price alerts run exclusively in worker/index.js (Railway worker). */
export const PRICE_ALERTS_RUNNER_VERSION = "2026-07-01-v22-single-email-idempotent";
export const PRICE_ALERT_SINGLE_PATH = "worker/price-alert-email.js::sendPriceAlertEmail";
export const CHECK_INTERVAL_MS = 30_000;
export const MAX_ALERTS_PER_RUN = 20;
