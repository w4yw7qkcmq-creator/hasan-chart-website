import { NOTIFICATION_SOUND_KEYS } from "./notification-sound-keys.js";
import { buildAnalysisReplyEmailHtml } from "./email-layout.js";
import { blockPriceAlertEmailSend } from "./price-alert-email-guard.js";
import { sendAnalysisReadyPush } from "./push-notifications.js";
import { sendWebsiteResendEmail } from "./resend-website.js";
import { dispatchSiteNotification, shouldDeliverEmailToRecipient } from "./site-notification-dispatch.js";

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
  const notificationTitle = `📩 رد الإدارة على تحليل ${coinLabel}`;
  const notificationMessage =
    "وصل رد جديد على طلب التحليل. افتح صفحة طلباتي للاطلاع على التفاصيل.";

  let notificationCreated = false;

  if (normalizedEmail) {
    const result = await dispatchSiteNotification(supabase, {
      preset: "analysis_reply",
      userEmail: normalizedEmail,
      title: notificationTitle,
      message: notificationMessage,
      metadata: {
        requestId,
        coin: coinLabel,
        notification_key: "analysis_reply",
      },
    });

    if (result.error) {
      console.error("ADMIN_REPLY_NOTIFICATION_CREATED", {
        success: false,
        requestId,
        email: normalizedEmail,
        error: result.error.message || String(result.error),
      });
    } else if (result.skipped) {
      console.log("ADMIN_REPLY_NOTIFICATION_CREATED", {
        success: false,
        skipped: true,
        requestId,
        email: normalizedEmail,
        reason: result.reason || "delivery-blocked",
      });
    } else {
      notificationCreated = Boolean(result.data?.id);
      console.log("ADMIN_REPLY_NOTIFICATION_CREATED", {
        success: true,
        requestId,
        email: normalizedEmail,
        notificationId: result.data?.id || null,
      });
    }
  } else {
    console.error("ADMIN_REPLY_NOTIFICATION_CREATED", {
      success: false,
      requestId,
      reason: "Missing user email",
    });
  }

  const emailAllowed = normalizedEmail
    ? await shouldDeliverEmailToRecipient(supabase, {
        userEmail: normalizedEmail,
        notificationKey: NOTIFICATION_SOUND_KEYS.ANALYSIS_REPLY,
      })
    : false;

  let pushResult = {
    sent: 0,
    failed: 0,
    skipped: 1,
    skipReason: normalizedEmail ? "not-attempted" : "missing-user-email",
  };

  if (normalizedEmail) {
    try {
      pushResult = await sendAnalysisReadyPush({
        supabase,
        email: normalizedEmail,
        coin: coinLabel,
        requestId,
        title: notificationTitle,
        body: notificationMessage,
      });

      if ((pushResult?.sent || 0) > 0) {
        console.log("ANALYSIS_REPLY_PUSH_SENT", {
          requestId,
          email: normalizedEmail,
          sent: pushResult.sent,
          failed: pushResult.failed || 0,
        });
      } else {
        console.log("ANALYSIS_REPLY_PUSH_SKIPPED", {
          requestId,
          email: normalizedEmail,
          reason: pushResult?.skipReason || "WEB_PUSH_NOT_SENT",
          sent: pushResult?.sent || 0,
          failed: pushResult?.failed || 0,
          skipped: pushResult?.skipped || 0,
        });
      }
    } catch (error) {
      console.error("ANALYSIS_REPLY_PUSH_ERROR", {
        requestId,
        email: normalizedEmail,
        error: error?.message || String(error),
      });

      pushResult = {
        sent: 0,
        failed: 1,
        skipped: 0,
        skipReason: error?.message || "WEB_PUSH_DISPATCH_FAILED",
      };
    }
  }

  const emailResult =
    normalizedEmail && emailAllowed
      ? await sendAnalysisReplyEmail({
          email: normalizedEmail,
          coin: coinLabel,
          reply,
        })
      : normalizedEmail
        ? {
            sent: false,
            skipped: true,
            reason: "notification-email-blocked-by-settings",
          }
        : {
            sent: false,
            reason: "Missing user email",
          };

  if (emailResult.sent) {
    console.log("ANALYSIS_REPLY_EMAIL_SENT", {
      requestId,
      email: normalizedEmail,
    });
  } else if (normalizedEmail) {
    console.log("ANALYSIS_REPLY_EMAIL_SKIPPED", {
      requestId,
      email: normalizedEmail,
      reason: emailResult.reason || emailResult.error || "not-sent",
      skipped: Boolean(emailResult.skipped),
    });
  }

  return {
    notificationCreated,
    emailResult,
    pushResult,
  };
}
