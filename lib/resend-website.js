import {
  blockWebsiteResendPayload,
  logPriceAlertEmailBlockedFromWebsite,
} from "./price-alert-email-guard.js";

/**
 * Single Resend send entrypoint for hasan-chart-website (Next.js).
 * Price alert emails are blocked here before any network call.
 */
export async function sendWebsiteResendEmail({
  path,
  resendApiKey,
  payload,
  to = null,
}) {
  const blocked = blockWebsiteResendPayload({
    path: path || "lib/resend-website.js::sendWebsiteResendEmail",
    payload,
    to,
  });

  if (blocked) {
    return blocked;
  }

  if (!resendApiKey) {
    return {
      success: false,
      skipped: true,
      error: "Missing RESEND_API_KEY",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const resultText = await response.text().catch(() => "");
  let result = {};

  try {
    result = resultText ? JSON.parse(resultText) : {};
  } catch {
    result = { raw: resultText };
  }

  if (!response.ok) {
    return {
      success: false,
      error: result?.message || response.statusText || "Email provider error",
      status: response.status,
      result,
    };
  }

  return {
    success: true,
    id: result?.id || null,
    status: response.status,
    result,
  };
}

export function logWebsitePriceAlertRouteBlocked(path, extra = {}) {
  logPriceAlertEmailBlockedFromWebsite({
    path,
    ...extra,
  });
}
