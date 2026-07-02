/** @deprecated Price alert emails are sent only from worker/price-alert-email.js on Railway. */

import {
  logPriceAlertEmailBlockedFromWebsite,
  PRICE_ALERT_CANONICAL_PATH,
} from "./price-alert-email-guard.js";

export const PRICE_ALERT_SINGLE_PATH = PRICE_ALERT_CANONICAL_PATH;

export function buildPriceAlertEmailPayload() {
  logPriceAlertEmailBlockedFromWebsite({
    path: "lib/price-alert-email.js::buildPriceAlertEmailPayload",
  });

  throw new Error(
    "Price alert emails are sent only from worker/price-alert-email.js (Railway worker)."
  );
}

export async function sendPriceAlertEmail() {
  logPriceAlertEmailBlockedFromWebsite({
    path: "lib/price-alert-email.js::sendPriceAlertEmail",
  });

  throw new Error(
    "Price alert emails are sent only from worker/price-alert-email.js (Railway worker)."
  );
}
