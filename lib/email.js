

import { buildEmailLogoHtml } from "./email-branding.js";
import {
  blockPriceAlertEmailSend,
  isPriceAlertEmailContent,
  logPriceAlertEmailBlockedFromWebsite,
} from "./price-alert-email-guard.js";
import { sendWebsiteResendEmail } from "./resend-website.js";

const DEFAULT_FROM = "HasaN CharT World <support@hasanchartworld.com>";
const DEFAULT_SITE_URL = "https://www.hasanchartworld.com";

export { buildEmailLogoHtml, getEmailLogoUrl } from "./email-branding.js";

export function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;
}

export function buildEmailLayout({ title, content, actionText, actionUrl }) {
  if (isPriceAlertEmailContent({ title, content })) {
    logPriceAlertEmailBlockedFromWebsite({
      path: "lib/email.js::buildEmailLayout",
      title: title || null,
    });

    throw new Error("PRICE_ALERT_EMAIL_BLOCKED_FROM_WEBSITE");
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
    const resendPayload = {
      from: fromEmail,
      to: recipients,
      subject: subject || "HasaN CharT World",
      html,
      text,
      reply_to: replyToEmail,
      tags,
    };

    const outcome = await sendWebsiteResendEmail({
      path: "lib/email.js::sendEmail",
      resendApiKey,
      payload: resendPayload,
      to: recipients,
    });

    if (!outcome.success) {
      if (outcome.skipped) {
        return outcome;
      }

      console.error("EMAIL_SEND_FAILED:", {
        to: recipients,
        status: outcome.status,
        result: outcome.result,
        error: outcome.error,
      });

      return outcome;
    }

    console.log("EMAIL_SEND_SUCCESS:", {
      to: recipients,
      subject,
      id: outcome.id || null,
    });

    return outcome;
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
