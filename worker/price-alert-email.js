const PRICE_ALERT_FROM = "HasaN CharT Alerts <alerts@hasanchartworld.com>";
const PRICE_ALERT_CTA_URL = "https://www.hasanchartworld.com/alerts";
const PRICE_ALERT_EMAIL_TEMPLATE = "dark-compact-v1";
const PRICE_ALERT_MESSAGE_TYPE = "price-alert";
const PRICE_ALERT_EMAIL_LOGO_URL = "https://www.hasanchartworld.com/favicon.png";

function buildPriceAlertEmailLogoHtml() {
  return `<img src="${PRICE_ALERT_EMAIL_LOGO_URL}" alt="HasaN CharT World" width="64" height="64" style="display:block;border-radius:16px;margin:0 auto 16px;" />`;
}

function logPriceAlertDuplicateSkipped({ alertId, email, userId, emailSentAt, emailResendId }) {
  console.log(
    "PRICE_ALERT_EMAIL_DUPLICATE_SKIPPED",
    JSON.stringify({
      path: "worker/price-alert-email.js::sendPriceAlertEmail",
      alertId,
      email: email || null,
      userId: userId || null,
      emailSentAt: emailSentAt || null,
      emailResendId: emailResendId || null,
      template: PRICE_ALERT_EMAIL_TEMPLATE,
    })
  );
}

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
  const logoHtml = buildPriceAlertEmailLogoHtml();

  return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<body style="margin:0;padding:0;background:#020617;font-family:Arial,Tahoma,sans-serif;direction:rtl;text-align:right;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#020617;padding:20px 8px;">
<tr>
<td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#07142f;border:1px solid #1e3a5f;border-radius:22px;overflow:hidden;">
<tr>
<td align="center" style="background:#0ea5e9;padding:28px 18px;">
${logoHtml}
<div style="font-size:28px;font-weight:900;color:#ffffff;line-height:1.4;">HasaN CharT World</div>
<div style="margin-top:10px;font-size:14px;color:#e0f2fe;line-height:1.8;">تنبيهات الأسعار الذكية</div>
</td>
</tr>
<tr>
<td style="padding:22px 16px;">
<h1 style="margin:0 0 18px;color:#ffffff;font-size:26px;line-height:1.6;font-weight:900;text-align:center;">
🔔 وصل السعر إلى هدف التنبيه
</h1>
<p style="margin:0 0 18px;color:#94a3b8;font-size:15px;line-height:1.9;text-align:center;">
تم تفعيل التنبيه لأن السعر وصل إلى المستوى الذي حددته داخل المنصة.
</p>
<div style="background:#111c33;border:1px solid #263a5c;border-radius:18px;padding:22px;text-align:center;margin-bottom:16px;">
<div style="font-size:14px;color:#94a3b8;margin-bottom:10px;">العملة</div>
<div style="font-size:32px;font-weight:900;color:#67e8f9;line-height:1.3;">${safeCoin}</div>
</div>
<div style="background:#020617;border:1px solid #164e63;border-radius:18px;padding:18px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
<tr>
<td style="padding:10px 0;border-bottom:1px solid rgba(148,163,184,0.14);">
<div style="font-size:13px;color:#94a3b8;margin-bottom:6px;">السعر الذي طلبته</div>
<div style="font-size:22px;font-weight:800;color:#e2e8f0;">${safeTargetPrice}</div>
</td>
</tr>
<tr>
<td style="padding:10px 0;border-bottom:1px solid rgba(148,163,184,0.14);">
<div style="font-size:13px;color:#94a3b8;margin-bottom:6px;">السعر الحالي عند التفعيل</div>
<div style="font-size:24px;font-weight:900;color:#34d399;">${safeCurrentPrice}</div>
</td>
</tr>
<tr>
<td style="padding:10px 0 0;">
<div style="font-size:13px;color:#94a3b8;margin-bottom:6px;">نوع التنبيه</div>
<div style="font-size:18px;font-weight:800;color:#ffffff;">${safeConditionLabel}</div>
</td>
</tr>
</table>
</div>
<div style="text-align:center;margin-top:24px;">
<a href="${PRICE_ALERT_CTA_URL}" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:16px;font-weight:900;font-size:16px;">
فتح تنبيهات الأسعار
</a>
</div>
</td>
</tr>
<tr>
<td align="center" style="padding:18px;background:#020617;border-top:1px solid #1e293b;color:#64748b;font-size:12px;line-height:1.8;">
© 2026 HasaN CharT World — All Rights Reserved
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>
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

async function loadPriceAlertEmailState(supabase, alertId) {
  const normalizedAlertId = String(alertId || "").trim();
  if (!normalizedAlertId) {
    return { alertId: null, emailSentAt: null, emailResendId: null };
  }

  const { data, error } = await supabase
    .from("price_alerts")
    .select("id, email_sent_at, email_resend_id")
    .eq("id", normalizedAlertId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    alertId: data?.id || normalizedAlertId,
    emailSentAt: data?.email_sent_at || null,
    emailResendId: data?.email_resend_id || null,
  };
}

async function claimPriceAlertEmailSend(supabase, alertId) {
  const normalizedAlertId = String(alertId || "").trim();
  if (!normalizedAlertId) return false;

  const sentAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("price_alerts")
    .update({ email_sent_at: sentAt })
    .eq("id", normalizedAlertId)
    .is("email_sent_at", null)
    .select("id, email_sent_at")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data?.id);
}

async function releasePriceAlertEmailClaim(supabase, alertId) {
  const normalizedAlertId = String(alertId || "").trim();
  if (!normalizedAlertId) return;

  await supabase
    .from("price_alerts")
    .update({ email_sent_at: null, email_resend_id: null })
    .eq("id", normalizedAlertId)
    .not("email_sent_at", "is", null);
}

async function finalizePriceAlertEmailSend(supabase, { alertId, email, resendId, subject, sentAt }) {
  if (!resendId) return;

  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedAlertId = String(alertId || "").trim();
  const sentTimestamp = sentAt || new Date().toISOString();

  const { error: alertUpdateError } = await supabase
    .from("price_alerts")
    .update({
      email_sent_at: sentTimestamp,
      email_resend_id: resendId,
    })
    .eq("id", normalizedAlertId);

  if (alertUpdateError) {
    console.error(
      "PRICE_ALERT_EMAIL_SENT_SINGLE",
      JSON.stringify({
        phase: "price_alerts_finalize_failed",
        alertId: normalizedAlertId,
        resendId,
        message: alertUpdateError.message || String(alertUpdateError),
      })
    );
  }

  const { error: messageError } = await supabase.from("email_messages").upsert(
    {
      resend_id: resendId,
      recipient_email: normalizedEmail,
      subject: subject || null,
      message_type: PRICE_ALERT_MESSAGE_TYPE,
      status: "sent",
      sent_at: sentTimestamp,
      last_event_at: sentTimestamp,
    },
    { onConflict: "resend_id" }
  );

  if (messageError) {
    console.error(
      "PRICE_ALERT_EMAIL_SENT_SINGLE",
      JSON.stringify({
        phase: "email_messages_upsert_failed",
        alertId: normalizedAlertId,
        email: normalizedEmail,
        resendId,
        message: messageError.message || String(messageError),
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

  let claimed = false;

  try {
    claimed = await claimPriceAlertEmailSend(supabase, normalizedAlertId);
  } catch (error) {
    return {
      success: false,
      sent: false,
      error: error?.message || String(error),
      reason: "EMAIL_CLAIM_FAILED",
    };
  }

  if (!claimed) {
    let refreshedState = { emailSentAt: null, emailResendId: null };

    try {
      refreshedState = await loadPriceAlertEmailState(supabase, normalizedAlertId);
    } catch (error) {
      logPriceAlertDuplicateSkipped({
        alertId: normalizedAlertId,
        email: normalizedEmail,
        userId,
        emailSentAt: null,
        emailResendId: null,
      });

      return {
        success: true,
        skipped: true,
        sent: false,
        reason: "EMAIL_ALREADY_SENT_FOR_ALERT",
        alertId: normalizedAlertId,
      };
    }

    logPriceAlertDuplicateSkipped({
      alertId: normalizedAlertId,
      email: normalizedEmail,
      userId,
      emailSentAt: refreshedState.emailSentAt,
      emailResendId: refreshedState.emailResendId,
    });

    return {
      success: true,
      skipped: true,
      sent: false,
      reason: "EMAIL_ALREADY_SENT_FOR_ALERT",
      alertId: normalizedAlertId,
      emailSentAt: refreshedState.emailSentAt,
      emailResendId: refreshedState.emailResendId,
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

  console.log(
    "PRICE_ALERT_EMAIL_SENT_SINGLE",
    JSON.stringify({
      phase: "pre-send",
      path: "worker/price-alert-email.js::sendPriceAlertEmail",
      alertId: normalizedAlertId,
      email: normalizedEmail,
      userId: userId || null,
      template: PRICE_ALERT_EMAIL_TEMPLATE,
      subject: payload.subject,
    })
  );

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
    try {
      await releasePriceAlertEmailClaim(supabase, normalizedAlertId);
    } catch (releaseError) {
      console.error(
        "PRICE_ALERT_EMAIL_CLAIM_RELEASE_FAILED",
        JSON.stringify({
          alertId: normalizedAlertId,
          message: releaseError?.message || String(releaseError),
        })
      );
    }

    return {
      success: false,
      sent: false,
      status: response.status,
      error: data?.message || response.statusText || "Email provider error",
      result: data,
    };
  }

  const resendId = data?.id || null;
  const sentAt = new Date().toISOString();

  await finalizePriceAlertEmailSend(supabase, {
    alertId: normalizedAlertId,
    email: normalizedEmail,
    resendId,
    subject: payload.subject,
    sentAt,
  });

  console.log(
    "PRICE_ALERT_EMAIL_SENT_SINGLE",
    JSON.stringify({
      phase: "sent",
      path: "worker/price-alert-email.js::sendPriceAlertEmail",
      alertId: normalizedAlertId,
      email: normalizedEmail,
      userId: userId || null,
      resendId,
      emailSentAt: sentAt,
      emailResendId: resendId,
      template: PRICE_ALERT_EMAIL_TEMPLATE,
    })
  );

  return {
    success: true,
    sent: true,
    status: response.status,
    id: resendId,
    emailSentAt: sentAt,
    emailResendId: resendId,
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
