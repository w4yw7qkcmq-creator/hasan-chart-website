

import { buildEmailLogoHtml } from "./email-branding.js";
import { buildUnifiedEmailLayout } from "./email-layout.js";
import {
  blockPriceAlertEmailSend,
  isPriceAlertEmailContent,
  logPriceAlertEmailBlockedFromSupabaseOrWebsite,
  PRICE_ALERT_EMAIL_BLOCKED_EVENT,
} from "./price-alert-email-guard.js";
import { sendWebsiteResendEmail } from "./resend-website.js";

const DEFAULT_FROM = "HasaN CharT World <support@hasanchartworld.com>";
const DEFAULT_SITE_URL = "https://www.hasanchartworld.com";

export { buildEmailLogoHtml, getEmailLogoUrl } from "./email-branding.js";

export function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;
}

export function buildEmailLayout({ title, content, actionText, actionUrl, preheader }) {
  if (isPriceAlertEmailContent({ title, content })) {
    logPriceAlertEmailBlockedFromSupabaseOrWebsite({
      service: "hasan-chart-website",
      path: "lib/email.js::buildEmailLayout",
      title: title || null,
    });

    throw new Error(PRICE_ALERT_EMAIL_BLOCKED_EVENT);
  }

  const safeTitle = title || "HasaN CharT World";

  return buildUnifiedEmailLayout({
    siteUrl: getSiteUrl(),
    title: safeTitle,
    bodyHtml: content || "",
    actionText,
    actionUrl,
    preheader,
  });
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

export async function sendTemplateEmail({ to, subject, title, content, actionText, actionUrl, replyTo, preheader }) {
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
    html: buildEmailLayout({ title, content, actionText, actionUrl, preheader }),
    replyTo,
  });
}
