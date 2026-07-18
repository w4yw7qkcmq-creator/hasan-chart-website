import { buildAnalysisReplyEmailHtml } from "./email-layout.js";
import { dispatchTransactionalEmail } from "./email-dispatch.js";
import { blockPriceAlertEmailSend } from "./price-alert-email-guard.js";
import { sendAnalysisReadyPush } from "./push-notifications.js";
import { sendWebsiteResendEmail } from "./resend-website.js";
import { dispatchSiteNotification } from "./site-notification-dispatch.js";

const ANALYSIS_REPLY_SUBJECT = "تم الرد على طلب التحليل";
const ANALYSIS_REPLY_FROM = "HasaN CharT World <alerts@hasanchartworld.com>";

export function buildAnalysisReplyIdempotencyKey(analysisRequestId) {
  return `analysis_reply:${String(analysisRequestId || "").trim()}`;
}

async function sendAnalysisReplyDirectEmail({ to, subject, html }) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const normalizedEmail = String(to || "").trim().toLowerCase();

  if (!resendApiKey || !normalizedEmail) {
    return {
      success: false,
      skipped: true,
      error: !resendApiKey ? "Missing RESEND_API_KEY" : "Missing recipient",
    };
  }

  const blocked = blockPriceAlertEmailSend({
    path: "lib/analysis-reply-dispatch.js::sendAnalysisReplyEmail",
    subject,
    html,
    to: normalizedEmail,
  });

  if (blocked) {
    return blocked;
  }

  return sendWebsiteResendEmail({
    path: "lib/analysis-reply-dispatch.js::sendAnalysisReplyEmail",
    resendApiKey,
    payload: {
      from: ANALYSIS_REPLY_FROM,
      to: normalizedEmail,
      subject,
      html,
    },
    to: normalizedEmail,
  });
}

function mapAnalysisReplyDispatchResult(dispatchResult) {
  if (!dispatchResult) {
    return {
      sent: false,
      reason: "empty-dispatch-result",
    };
  }

  if (dispatchResult.mode === "outbox") {
    const queued = Boolean(dispatchResult.enqueued || dispatchResult.duplicate);

    return {
      sent: dispatchResult.success === true && queued,
      skipped: Boolean(dispatchResult.duplicate),
      duplicate: Boolean(dispatchResult.duplicate),
      mode: "outbox",
      record: dispatchResult.record || null,
      error: dispatchResult.error || null,
    };
  }

  if (dispatchResult.success === false) {
    return {
      sent: false,
      skipped: Boolean(dispatchResult.skipped),
      status: dispatchResult.status,
      error: dispatchResult.error,
      data: dispatchResult.result,
    };
  }

  return {
    sent: true,
    status: dispatchResult.status,
    data: dispatchResult.result,
    messageId: dispatchResult.id || null,
    mode: "direct",
  };
}

export async function sendAnalysisReplyEmail({ email, coin, reply, requestId }, deps = {}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedRequestId = String(requestId || "").trim();
  const coinLabel = String(coin || "العملة").trim().toUpperCase();
  const dispatchFn = deps.dispatchTransactionalEmail || dispatchTransactionalEmail;

  if (!normalizedRequestId) {
    console.warn("ADMIN_REPLY_EMAIL_FAILED", {
      reason: "Missing analysis request id",
      email: normalizedEmail || null,
    });

    return {
      sent: false,
      reason: "Missing analysis request id",
    };
  }

  if (!normalizedEmail) {
    console.warn("ADMIN_REPLY_EMAIL_FAILED", {
      reason: "Missing user email",
      requestId: normalizedRequestId,
    });

    return {
      sent: false,
      reason: "Missing user email",
    };
  }

  const html = buildAnalysisReplyEmailHtml({
    coin: coinLabel,
    reply: reply || "",
  });

  try {
    console.log("ANALYSIS_REPLY_EMAIL_DISPATCH_STARTED", {
      requestId: normalizedRequestId,
      email: normalizedEmail,
    });

    const dispatchResult = await dispatchFn(
      {
        idempotencyKey: buildAnalysisReplyIdempotencyKey(normalizedRequestId),
        recipientEmail: normalizedEmail,
        subject: ANALYSIS_REPLY_SUBJECT,
        html,
        messageType: "analysis_reply",
        recordId: normalizedRequestId,
        metadata: {
          source: "analysis_reply",
          analysisRequestId: normalizedRequestId,
          userEmail: normalizedEmail,
          coin: coinLabel,
        },
      },
      {
        sendDirectEmail: sendAnalysisReplyDirectEmail,
        ...deps.dispatchDeps,
      }
    );

    const emailResult = mapAnalysisReplyDispatchResult(dispatchResult);

    console.log("ANALYSIS_REPLY_EMAIL_DISPATCH_RESULT", {
      requestId: normalizedRequestId,
      email: normalizedEmail,
      sent: emailResult.sent,
      mode: emailResult.mode || null,
      skipped: Boolean(emailResult.skipped),
      duplicate: Boolean(emailResult.duplicate),
      outboxId: emailResult.record?.id || null,
      error: emailResult.error || emailResult.reason || null,
    });

    if (emailResult.sent) {
      console.log("ADMIN_REPLY_EMAIL_SENT", {
        email: normalizedEmail,
        requestId: normalizedRequestId,
        mode: emailResult.mode || "direct",
        messageId: emailResult.messageId || emailResult.record?.resend_id || null,
      });
    } else {
      console.error("ADMIN_REPLY_EMAIL_FAILED", {
        email: normalizedEmail,
        requestId: normalizedRequestId,
        status: emailResult.status,
        error: emailResult.error,
        reason: emailResult.reason,
        result: emailResult.data,
      });
    }

    return emailResult;
  } catch (error) {
    console.error("ADMIN_REPLY_EMAIL_FAILED", {
      email: normalizedEmail,
      requestId: normalizedRequestId,
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

  const emailResult = normalizedEmail
    ? await sendAnalysisReplyEmail({
        email: normalizedEmail,
        coin: coinLabel,
        reply,
        requestId,
      })
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
