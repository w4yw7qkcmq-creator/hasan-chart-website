import { createUserNotification } from "./create-user-notification";
import { buildEmailLogoHtml } from "./email-branding.js";
import { NOTIFICATION_TYPES } from "./notifications-shared";
import { blockPriceAlertEmailSend } from "./price-alert-email-guard.js";

const escapeHtml = (value) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("\n", "<br />");

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

  const safeCoin = escapeHtml(coin || "العملة");
  const safeReply = escapeHtml(reply || "");
  const logoHtml = buildEmailLogoHtml();

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
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "HasaN CharT World <alerts@hasanchartworld.com>",
        to: email,
        subject,
        html: `
<div style="margin:0;padding:0;background:#020617;font-family:Arial,Tahoma,sans-serif;direction:rtl;text-align:right;color:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#020617;margin:0;padding:0;width:100%;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:560px;background:#07142f;border:1px solid rgba(34,211,238,0.22);border-radius:24px;overflow:hidden;box-shadow:0 0 42px rgba(37,99,235,0.24);">
          <tr>
            <td style="padding:0;">
              <div style="background:linear-gradient(135deg,#07142f 0%,#0b63ff 55%,#06b6d4 100%);padding:30px 22px;text-align:center;">
                ${logoHtml}
                <div style="display:inline-block;background:rgba(2,6,23,0.28);border:1px solid rgba(255,255,255,0.28);border-radius:999px;padding:9px 16px;color:#ffffff;font-size:13px;font-weight:800;letter-spacing:0.3px;white-space:nowrap;">
                  HasaN CharT World
                </div>
                <h1 style="margin:18px 0 0;color:#ffffff;font-size:27px;line-height:1.45;font-weight:900;text-align:center;">
                  تم الرد على طلب التحليل
                </h1>
                <p style="margin:8px 0 0;color:#dbeafe;font-size:14px;line-height:1.9;text-align:center;">
                  يمكنك مشاهدة الرد الكامل داخل حسابك في المنصة
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 18px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#0b1b3a;border:1px solid rgba(34,211,238,0.20);border-radius:20px;">
                <tr>
                  <td style="padding:20px;text-align:center;">
                    <div style="color:#93c5fd;font-size:13px;font-weight:800;margin-bottom:9px;">العملة المطلوبة</div>
                    <div style="color:#ffffff;font-size:32px;line-height:1.25;font-weight:900;word-break:break-word;">${safeCoin}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 18px 6px;">
              <div style="background:#020817;border:1px solid rgba(34,211,238,0.18);border-radius:18px;padding:18px;color:#e2e8f0;font-size:16px;line-height:2.05;font-weight:600;word-break:break-word;">
                ${safeReply}
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 18px 30px;">
              <a href="https://www.hasanchartworld.com/my-analysis" style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#2563eb);color:#ffffff;text-decoration:none;padding:16px 30px;border-radius:16px;font-size:16px;font-weight:900;line-height:1;white-space:nowrap;box-shadow:0 0 24px rgba(37,99,235,0.38);">
                مشاهدة الرد داخل المنصة
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
        `,
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("ADMIN_REPLY_EMAIL_FAILED", {
        email,
        status: response.status,
        data,
      });

      return {
        sent: false,
        status: response.status,
        data,
      };
    }

    console.log("ADMIN_REPLY_EMAIL_SENT", {
      email,
      status: response.status,
      messageId: data?.id || null,
    });

    return {
      sent: true,
      status: response.status,
      data,
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
