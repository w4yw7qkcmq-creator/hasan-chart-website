const PRICE_ALERT_FROM = "HasaN CharT Alerts <alerts@hasanchartworld.com>";
const PRICE_ALERT_CTA_URL = "https://www.hasanchartworld.com/alerts";
const PRICE_ALERT_EMAIL_TEMPLATE = "dark-compact-v1";
const PRICE_ALERT_MESSAGE_TYPE = "price-alert";

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
