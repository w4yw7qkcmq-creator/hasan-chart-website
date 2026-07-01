const PRICE_ALERT_FROM = "HasaN CharT Alerts <alerts@hasanchartworld.com>";
const PRICE_ALERT_CTA_URL = "https://www.hasanchartworld.com/alerts";
const PRICE_ALERT_EMAIL_TEMPLATE = "dark-compact-v1";
const PRICE_ALERT_MESSAGE_TYPE = "price-alert";

const sentPriceAlertEmailIds = new Set();

function buildPriceAlertEmailHtml({
  coinLabel,
  conditionLabel,
  targetPrice,
  currentPrice,
}) {
  const safeCoin = String(coinLabel || "");
  const safeConditionLabel = String(conditionLabel || "");
  const safeTargetPrice = String(targetPrice ?? "");
  const safeCurrentPrice = String(currentPrice ?? "");

  return `
<div style="margin:0;padding:0;background:#020617;font-family:Arial,Tahoma,sans-serif;direction:rtl;text-align:right;color:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#020617;width:100%;padding:20px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:520px;background:#07142f;border-radius:18px;overflow:hidden;border:1px solid rgba(34,211,238,0.16);">
          <tr>
            <td style="padding:22px 20px 14px;border-bottom:1px solid rgba(34,211,238,0.12);background:#020817;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;line-height:1.6;font-weight:900;text-align:right;">
                🔔 وصل السعر إلى هدف التنبيه
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 20px;color:#cbd5e1;font-size:16px;line-height:1.9;font-weight:600;text-align:right;">
              <p style="margin:0 0 6px;"><strong style="color:#e2e8f0;">العملة:</strong> ${safeCoin}</p>
              <p style="margin:0 0 6px;"><strong style="color:#e2e8f0;">السعر الذي طلبته:</strong> ${safeTargetPrice}</p>
              <p style="margin:0 0 6px;"><strong style="color:#e2e8f0;">السعر الحالي عند التفعيل:</strong> ${safeCurrentPrice}</p>
              <p style="margin:0 0 6px;"><strong style="color:#e2e8f0;">نوع التنبيه:</strong> ${safeConditionLabel}</p>
              <p style="margin:12px 0 0;color:#94a3b8;font-size:14px;line-height:1.8;">تم تفعيل التنبيه لأن السعر وصل إلى المستوى المطلوب.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 20px 22px;">
              <a href="${PRICE_ALERT_CTA_URL}" style="display:inline-block;background:#0f172a;border:1px solid rgba(34,211,238,0.24);color:#e2e8f0;text-decoration:none;padding:14px 24px;border-radius:14px;font-size:15px;font-weight:800;">
                فتح تنبيهات الأسعار
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
  `.trim();
}

function buildPriceAlertEmailText({
  coinLabel,
  conditionLabel,
  targetPrice,
  currentPrice,
}) {
  return [
    "🔔 وصل السعر إلى هدف التنبيه",
    "",
    `العملة: ${coinLabel || ""}`,
    `السعر الذي طلبته: ${targetPrice ?? ""}`,
    `السعر الحالي عند التفعيل: ${currentPrice ?? ""}`,
    `نوع التنبيه: ${conditionLabel || ""}`,
    "",
    "تم تفعيل التنبيه لأن السعر وصل إلى المستوى المطلوب.",
    "",
    PRICE_ALERT_CTA_URL,
  ].join("\n");
}

function buildPriceAlertEmailPayload({
  email,
  coinLabel,
  conditionLabel,
  targetPrice,
  currentPrice,
  alertId = null,
}) {
  const safeCoin = String(coinLabel || "");
  const subject = `🔔 وصل السعر إلى هدف التنبيه - ${safeCoin}`;
  const normalizedAlertId = String(alertId || "").trim();

  const tags = [
    { name: "message_type", value: PRICE_ALERT_MESSAGE_TYPE },
    { name: "category", value: PRICE_ALERT_MESSAGE_TYPE },
    { name: "template", value: PRICE_ALERT_EMAIL_TEMPLATE },
  ];

  if (normalizedAlertId) {
    tags.push({ name: "alert_id", value: normalizedAlertId });
  }

  return {
    from: PRICE_ALERT_FROM,
    to: email,
    subject,
    tags,
    html: buildPriceAlertEmailHtml({
      coinLabel,
      conditionLabel,
      targetPrice,
      currentPrice,
    }),
    text: buildPriceAlertEmailText({
      coinLabel,
      conditionLabel,
      targetPrice,
      currentPrice,
    }),
  };
}

async function hasPriceAlertEmailAlreadySent(supabase, alertId) {
  const normalizedAlertId = String(alertId || "").trim();
  if (!normalizedAlertId) return false;

  if (sentPriceAlertEmailIds.has(normalizedAlertId)) {
    return true;
  }

  const { data: alertRow, error: alertError } = await supabase
    .from("price_alerts")
    .select("email_sent_at, email_resend_id")
    .eq("id", normalizedAlertId)
    .maybeSingle();

  if (alertError) {
    if (/email_sent_at|email_resend_id/.test(String(alertError.message || ""))) {
      return sentPriceAlertEmailIds.has(normalizedAlertId);
    }

    throw alertError;
  }

  if (alertRow?.email_sent_at || alertRow?.email_resend_id) {
    sentPriceAlertEmailIds.add(normalizedAlertId);
    return true;
  }

  return false;
}

async function claimPriceAlertEmailSend(supabase, alertId) {
  const normalizedAlertId = String(alertId || "").trim();
  if (!normalizedAlertId) return false;

  if (sentPriceAlertEmailIds.has(normalizedAlertId)) {
    return false;
  }

  const { data, error } = await supabase
    .from("price_alerts")
    .update({ email_sent_at: new Date().toISOString() })
    .eq("id", normalizedAlertId)
    .is("email_sent_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    if (/email_sent_at/.test(String(error.message || ""))) {
      if (sentPriceAlertEmailIds.has(normalizedAlertId)) return false;
      sentPriceAlertEmailIds.add(normalizedAlertId);
      return true;
    }

    throw error;
  }

  if (!data?.id) {
    return false;
  }

  sentPriceAlertEmailIds.add(normalizedAlertId);
  return true;
}

async function recordPriceAlertEmailMessage(supabase, { alertId, email, resendId, subject }) {
  if (!resendId) return;

  const row = {
    resend_id: resendId,
    recipient_email: String(email || "").trim().toLowerCase(),
    subject: subject || null,
    message_type: PRICE_ALERT_MESSAGE_TYPE,
    status: "sent",
    sent_at: new Date().toISOString(),
    last_event_at: new Date().toISOString(),
  };

  const { error: messageError } = await supabase.from("email_messages").upsert(row, {
    onConflict: "resend_id",
  });

  if (messageError) {
    console.error(
      "PRICE_ALERT_EMAIL_SENT_SINGLE",
      JSON.stringify({
        phase: "email_messages_upsert_failed",
        alertId,
        email,
        resendId,
        message: messageError.message || String(messageError),
      })
    );
  }

  const { error: alertUpdateError } = await supabase
    .from("price_alerts")
    .update({ email_resend_id: resendId })
    .eq("id", alertId);

  if (alertUpdateError && !/email_resend_id/.test(String(alertUpdateError.message || ""))) {
    console.error(
      "PRICE_ALERT_EMAIL_SENT_SINGLE",
      JSON.stringify({
        phase: "price_alerts_resend_id_update_failed",
        alertId,
        resendId,
        message: alertUpdateError.message || String(alertUpdateError),
      })
    );
  }
}

async function sendPriceAlertEmail({
  supabase,
  resendApiKey,
  email,
  coinLabel,
  conditionLabel,
  targetPrice,
  currentPrice,
  alertId,
  userId = null,
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedAlertId = String(alertId || "").trim();

  if (!resendApiKey || !normalizedEmail) {
    return {
      success: false,
      skipped: true,
      sent: false,
      reason: !resendApiKey ? "Missing RESEND_API_KEY" : "Missing user email",
    };
  }

  if (!normalizedAlertId) {
    return {
      success: false,
      skipped: true,
      sent: false,
      reason: "Missing alertId",
    };
  }

  if (await hasPriceAlertEmailAlreadySent(supabase, normalizedAlertId)) {
    return {
      success: true,
      skipped: true,
      sent: false,
      reason: "EMAIL_ALREADY_SENT_FOR_ALERT",
      alertId: normalizedAlertId,
    };
  }

  const claimed = await claimPriceAlertEmailSend(supabase, normalizedAlertId);
  if (!claimed) {
    return {
      success: true,
      skipped: true,
      sent: false,
      reason: "EMAIL_ALREADY_SENT_FOR_ALERT",
      alertId: normalizedAlertId,
    };
  }

  const payload = buildPriceAlertEmailPayload({
    email: normalizedEmail,
    coinLabel,
    conditionLabel,
    targetPrice,
    currentPrice,
    alertId: normalizedAlertId,
  });

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
    sentPriceAlertEmailIds.delete(normalizedAlertId);

    await supabase
      .from("price_alerts")
      .update({ email_sent_at: null })
      .eq("id", normalizedAlertId)
      .catch(() => null);

    return {
      success: false,
      sent: false,
      status: response.status,
      error: data?.message || response.statusText || "Email provider error",
      result: data,
    };
  }

  const resendId = data?.id || null;

  await recordPriceAlertEmailMessage(supabase, {
    alertId: normalizedAlertId,
    email: normalizedEmail,
    resendId,
    subject: payload.subject,
  });

  console.log(
    "PRICE_ALERT_EMAIL_SENT_SINGLE",
    JSON.stringify({
      path: "worker/price-alert-email.js::sendPriceAlertEmail",
      alertId: normalizedAlertId,
      email: normalizedEmail,
      userId: userId || null,
      resendId,
      template: PRICE_ALERT_EMAIL_TEMPLATE,
    })
  );

  return {
    success: true,
    sent: true,
    status: response.status,
    id: resendId,
    data,
  };
}

module.exports = {
  PRICE_ALERT_FROM,
  PRICE_ALERT_CTA_URL,
  PRICE_ALERT_EMAIL_TEMPLATE,
  PRICE_ALERT_MESSAGE_TYPE,
  buildPriceAlertEmailPayload,
  sendPriceAlertEmail,
};
