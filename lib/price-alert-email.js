/** @deprecated Price alert emails are sent only from worker/price-alert-email.js on Railway. */

export const PRICE_ALERT_SINGLE_PATH = "worker/price-alert-email.js::sendPriceAlertEmail";

export function buildPriceAlertEmailPayload() {
  throw new Error(
    "Price alert emails are sent only from worker/price-alert-email.js (Railway worker)."
  );
}

export async function sendPriceAlertEmail() {
  throw new Error(
    "Price alert emails are sent only from worker/price-alert-email.js (Railway worker)."
  );
}
