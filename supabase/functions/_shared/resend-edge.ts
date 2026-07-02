import {
  blockSupabaseResendPayload,
  logSupabasePriceAlertEmailBlocked,
  SUPABASE_PRICE_ALERT_EMAIL_BLOCKED,
} from "./price-alert-email-guard.ts";

type ResendPayload = Record<string, unknown>;

export async function sendSupabaseResendEmail({
  path,
  resendApiKey,
  payload,
}: {
  path: string;
  resendApiKey: string;
  payload: ResendPayload;
}) {
  const blocked = blockSupabaseResendPayload(path, payload);

  if (blocked) {
    return blocked;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      success: false,
      sent: false,
      status: response.status,
      error: data?.message || response.statusText || "Email provider error",
      data,
    };
  }

  return {
    success: true,
    sent: true,
    status: response.status,
    data,
  };
}

export function rejectSupabasePriceAlertRequest(
  path: string,
  body: Record<string, unknown>,
  reason = "price-alert-request-detected"
) {
  logSupabasePriceAlertEmailBlocked(path, {
    reason,
    email: body?.email || body?.to || null,
    coin: body?.coin || null,
    alertId: body?.alertId || body?.alert_id || null,
    type: body?.type || body?.message_type || null,
  });

  return {
    success: false,
    blocked: true,
    reason: SUPABASE_PRICE_ALERT_EMAIL_BLOCKED,
    canonicalPath: "worker/price-alert-email.js::sendPriceAlertEmail",
  };
}
