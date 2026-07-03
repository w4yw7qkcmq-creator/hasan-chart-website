import { createUserNotification } from "./create-user-notification";
import { buildAnalysisReplyEmailHtml } from "./email-layout.js";
import { NOTIFICATION_TYPES } from "./notifications-shared";
import { blockPriceAlertEmailSend } from "./price-alert-email-guard.js";
import { sendWebsiteResendEmail } from "./resend-website.js";

export async function sendAnalysisReplyEmail({ email, coin, reply }) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const subject = "تم الرد على طلب التحليل";

  if (!resendApiKey || !email) {
    console.warn("ADMIN_REPLY_EMAIL_FAILED", {
      reason: !resendApiKey ? "Missing RESEND_API_KEY" : "Missing user email",
      email: email || null,
    });

    return {
      sent: false,
      reason: !resendApiKey ? "Missing RESEND_API_KEY" : "Missing user email",
    };
  }

  const blocked = blockPriceAlertEmailSend({
    path: "lib/analysis-reply-dispatch.js::sendAnalysisReplyEmail",
    subject,
    to: email,
  });

  if (blocked) {
    return {
      sent: false,
      skipped: true,
      reason: blocked.reason,
    };
  }

  try {
    const resendPayload = {
      from: "HasaN CharT World <alerts@hasanchartworld.com>",
      to: email,
      subject,
      html: buildAnalysisReplyEmailHtml({
        coin: coin || "العملة",
        reply: reply || "",
      }),
    };

    const outcome = await sendWebsiteResendEmail({
      path: "lib/analysis-reply-dispatch.js::sendAnalysisReplyEmail",
      resendApiKey,
      payload: resendPayload,
      to: email,
    });

    if (!outcome.success) {
      if (outcome.skipped) {
        return {
          sent: false,
          skipped: true,
          reason: outcome.reason,
        };
      }

      console.error("ADMIN_REPLY_EMAIL_FAILED", {
        email,
        status: outcome.status,
        error: outcome.error,
        result: outcome.result,
      });

      return {
        sent: false,
        status: outcome.status,
        error: outcome.error,
        data: outcome.result,
      };
    }

    console.log("ADMIN_REPLY_EMAIL_SENT", {
      email,
      status: outcome.status,
      messageId: outcome.id || null,
    });

    return {
      sent: true,
      status: outcome.status,
      data: outcome.result,
    };
  } catch (error) {
    console.error("ADMIN_REPLY_EMAIL_FAILED", {
      email,
      error: error?.message || String(error),
    });

    return {
      sent: false,
      error: error?.message || String(error),
    };
  }
}

export async function dispatchAnalysisReplyAlerts({
  supabase,
  userEmail,
  coin,
  reply,
  requestId,
}) {
  const normalizedEmail = String(userEmail || "").trim().toLowerCase();
  const coinLabel = String(coin || "العملة").trim().toUpperCase();

  let notificationCreated = false;

  if (normalizedEmail) {
    const { data, error } = await createUserNotification(supabase, {
      userEmail: normalizedEmail,
      type: NOTIFICATION_TYPES.ANALYSIS_REPLY,
      title: `📩 رد الإدارة على تحليل ${coinLabel}`,
      message: "وصل رد جديد على طلب التحليل. افتح صفحة طلباتي للاطلاع على التفاصيل.",
    });

    if (error) {
      console.error("ADMIN_REPLY_NOTIFICATION_CREATED", {
        success: false,
        requestId,
        email: normalizedEmail,
        error: error.message || String(error),
      });
    } else {
      notificationCreated = Boolean(data?.id);
      console.log("ADMIN_REPLY_NOTIFICATION_CREATED", {
        success: true,
        requestId,
        email: normalizedEmail,
        notificationId: data?.id || null,
      });
    }
  } else {
    console.error("ADMIN_REPLY_NOTIFICATION_CREATED", {
      success: false,
      requestId,
      reason: "Missing user email",
    });
  }

  const emailResult = normalizedEmail
    ? await sendAnalysisReplyEmail({
        email: normalizedEmail,
        coin: coinLabel,
        reply,
      })
    : {
        sent: false,
        reason: "Missing user email",
      };

  return {
    notificationCreated,
    emailResult,
  };
}
