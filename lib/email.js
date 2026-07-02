

import { buildEmailLogoHtml } from "./email-branding.js";
import {
  blockPriceAlertEmailSend,
  isPriceAlertEmailContent,
  logPriceAlertEmailBlockedOldPath,
} from "./price-alert-email-guard.js";

const DEFAULT_FROM = "HasaN CharT World <support@hasanchartworld.com>";
const DEFAULT_SITE_URL = "https://www.hasanchartworld.com";

export { buildEmailLogoHtml, getEmailLogoUrl } from "./email-branding.js";

export function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;
}

export function buildEmailLayout({ title, content, actionText, actionUrl }) {
  if (isPriceAlertEmailContent({ title, content })) {
    logPriceAlertEmailBlockedOldPath({
      path: "lib/email.js::buildEmailLayout",
      title: title || null,
    });

    throw new Error("PRICE_ALERT_EMAIL_BLOCKED_OLD_PATH");
  }

  const safeTitle = title || "HasaN CharT World";
  const logoHtml = buildEmailLogoHtml(getSiteUrl());
  const button =
    actionText && actionUrl
      ? `
        <p style="margin-top:28px;text-align:center">
          <a href="${actionUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:14px;padding:13px 24px;font-weight:800">
            ${actionText}
          </a>
        </p>
      `
      : "";

  return `
    <div dir="rtl" style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;overflow:hidden;box-shadow:0 18px 60px rgba(15,23,42,.08)">
        <div style="background:linear-gradient(135deg,#06b6d4,#2563eb);color:white;padding:28px;text-align:center">
          ${logoHtml}
          <div style="font-size:14px;font-weight:800;opacity:.95">HasaN CharT World</div>
          <h1 style="margin:10px 0 0;font-size:26px;line-height:1.5">${safeTitle}</h1>
        </div>
        <div style="padding:28px;line-height:1.9;font-size:16px">
          ${content || ""}
          ${button}
          <p style="margin-top:28px;color:#64748b;font-size:13px;line-height:1.8">
            هذه رسالة آلية من منصة HasaN CharT World.
          </p>
        </div>
      </div>
    </div>
  `;
}

export async function sendEmail({ to, subject, html, text, replyTo, tags }) {
  const blocked = blockPriceAlertEmailSend({
    path: "lib/email.js::sendEmail",
    subject,
    html,
    text,
    tags,
    to,
  });

  if (blocked) {
    return blocked;
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.EMAIL_FROM || DEFAULT_FROM;
  const replyToEmail = replyTo || process.env.EMAIL_REPLY_TO || "support@hasanchartworld.com";

  if (!resendApiKey) {
    console.error("EMAIL_SEND_SKIPPED: Missing RESEND_API_KEY");
    return { success: false, skipped: true, error: "Missing RESEND_API_KEY" };
  }

  const recipients = Array.isArray(to)
    ? to.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
    : [String(to || "").trim().toLowerCase()].filter(Boolean);

  if (recipients.length === 0) {
    console.error("EMAIL_SEND_SKIPPED: Missing recipient");
    return { success: false, skipped: true, error: "Missing recipient" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: recipients,
        subject: subject || "HasaN CharT World",
        html,
        text,
        reply_to: replyToEmail,
      }),
    });

    const resultText = await response.text().catch(() => "");
    const result = resultText ? JSON.parse(resultText) : {};

    if (!response.ok) {
      console.error("EMAIL_SEND_FAILED:", {
        to: recipients,
        status: response.status,
        result,
      });

      return {
        success: false,
        error: result?.message || response.statusText || "Email provider error",
        status: response.status,
        result,
      };
    }

    console.log("EMAIL_SEND_SUCCESS:", {
      to: recipients,
      subject,
      id: result?.id || null,
    });

    return {
      success: true,
      id: result?.id || null,
      result,
    };
  } catch (error) {
    console.error("EMAIL_SEND_ERROR:", error?.message || error);
    return {
      success: false,
      error: error?.message || "Email send error",
    };
  }
}

export async function sendTemplateEmail({ to, subject, title, content, actionText, actionUrl, replyTo }) {
  const blocked = blockPriceAlertEmailSend({
    path: "lib/email.js::sendTemplateEmail",
    subject,
    title,
    content,
    to,
  });

  if (blocked) {
    return blocked;
  }

  return sendEmail({
    to,
    subject,
    html: buildEmailLayout({ title, content, actionText, actionUrl }),
    replyTo,
  });
}
