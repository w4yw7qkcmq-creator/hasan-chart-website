import {
  buildEmailActionButton,
  buildEmailHeading,
  buildEmailParagraph,
  buildUnifiedEmailLayout,
  escapeEmailHtml,
} from "../email-layout.js";
import { buildUnsubscribeUrl, createEmailUnsubscribeToken } from "./unsubscribe-token.js";

const ALLOWED_TAGS = new Set([
  "p", "h1", "h2", "h3", "strong", "b", "em", "i", "a", "br", "ul", "ol", "li", "div", "span",
]);

function stripDisallowedTags(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

export function sanitizeCampaignHtml(html) {
  const cleaned = stripDisallowedTags(html);
  return cleaned.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (match, tag) => {
    if (!ALLOWED_TAGS.has(String(tag).toLowerCase())) {
      return "";
    }
    return match.replace(/javascript:/gi, "");
  });
}

export function buildCampaignEmailHtml({
  subject,
  previewText,
  htmlContent,
  textContent,
  userId,
  normalizedEmail,
  campaignId,
  isTest = false,
  siteUrl,
} = {}) {
  const safeSubject = escapeEmailHtml(subject);
  const testBanner = isTest
    ? buildEmailParagraph(
        "<strong>رسالة تجريبية — TEST</strong> · هذه معاينة داخلية ولا تُحسب ضمن إحصائيات الحملة.",
        { tone: "red" }
      )
    : "";

  const bodyHtml = sanitizeCampaignHtml(htmlContent);
  const contentBlocks = [
    testBanner,
    buildEmailHeading(safeSubject, { level: 2 }),
    `<div style="line-height:1.9;color:#e2e8f0;font-size:16px;">${bodyHtml}</div>`,
  ].filter(Boolean);

  let unsubscribeFooter = "";
  if (userId && normalizedEmail && !isTest) {
    const token = createEmailUnsubscribeToken({ userId, normalizedEmail, campaignId });
    const unsubscribeUrl = buildUnsubscribeUrl(token, siteUrl);
    unsubscribeFooter = [
      buildEmailParagraph(
        "وصلتك هذه الرسالة لأنك مسجل في HasaN CharT World ووافقت على تلقي رسائل تسويقية.",
        { muted: true }
      ),
      buildEmailActionButton("إلغاء الاشتراك", unsubscribeUrl, { variant: "secondary" }),
    ].join("");
  }

  return buildUnifiedEmailLayout({
    title: safeSubject,
    preheader: previewText || textContent || subject,
    contentHtml: contentBlocks.join(""),
    footerHtml: unsubscribeFooter,
  });
}

export function buildCampaignEmailText({ subject, textContent, htmlContent, isTest = false } = {}) {
  const prefix = isTest ? "[TEST] " : "";
  const body = textContent || String(htmlContent || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return `${prefix}${subject}\n\n${body}`.trim();
}
