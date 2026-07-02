export const PRICE_ALERT_CANONICAL_PATH = "worker/price-alert-email.js::sendPriceAlertEmail";

const PRICE_ALERT_TEXT_MARKERS = [
  "وصل السعر إلى هدف التنبيه",
  "وصل السعر",
  "تم تفعيل تنبيه السعر",
  "price alert triggered",
  "price alert",
  "price-alert",
  "price_alert",
  "تنبيه السعر",
  "تنبيهات الأسعار",
  "هدف التنبيه",
  "فتح تنبيهات الأسعار",
  "السعر الذي طلبته",
  "السعر الحالي عند التفعيل",
  "target_price",
  "triggered_price",
  "dark-compact-v1",
];

let websiteGuardBootLogged = false;

function normalizeEmailGuardText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function collectEmailGuardText({ subject, html, text, title, content, template, tags } = {}) {
  const tagText = Array.isArray(tags)
    ? tags.map((tag) => `${tag?.name || ""}:${tag?.value || ""}`).join("\n")
    : "";

  return [subject, html, text, title, content, template, tagText]
    .map(normalizeEmailGuardText)
    .filter(Boolean)
    .join("\n");
}

export function isPriceAlertEmailContent(fields = {}) {
  const blob = collectEmailGuardText(fields);
  if (!blob) return false;

  return PRICE_ALERT_TEXT_MARKERS.some((marker) =>
    blob.includes(normalizeEmailGuardText(marker))
  );
}

function logWebsiteGuardBootOnce() {
  if (websiteGuardBootLogged) return;
  websiteGuardBootLogged = true;

  console.log(
    "PRICE_ALERT_WEBSITE_EMAIL_GUARD_ACTIVE",
    JSON.stringify({
      service: "hasan-chart-website",
      canonicalPath: PRICE_ALERT_CANONICAL_PATH,
      markerCount: PRICE_ALERT_TEXT_MARKERS.length,
    })
  );
}

export function logPriceAlertEmailBlockedFromWebsite({
  path,
  subject = null,
  title = null,
  alertId = null,
  label = null,
  to = null,
}) {
  logWebsiteGuardBootOnce();

  console.log(
    "PRICE_ALERT_EMAIL_BLOCKED_FROM_WEBSITE",
    JSON.stringify({
      service: "hasan-chart-website",
      path: path || "unknown",
      canonicalPath: PRICE_ALERT_CANONICAL_PATH,
      subject: subject || null,
      title: title || null,
      alertId: alertId || null,
      label: label || null,
      to: to || null,
    })
  );
}

export function blockPriceAlertEmailSend({ path, ...fields }) {
  logWebsiteGuardBootOnce();

  if (!isPriceAlertEmailContent(fields)) {
    return null;
  }

  logPriceAlertEmailBlockedFromWebsite({
    path,
    subject: fields.subject || null,
    title: fields.title || null,
    alertId: fields.alertId || null,
    label: fields.label || null,
    to: fields.to || null,
  });

  return {
    success: false,
    skipped: true,
    sent: false,
    reason: "PRICE_ALERT_EMAIL_BLOCKED_FROM_WEBSITE",
    canonicalPath: PRICE_ALERT_CANONICAL_PATH,
  };
}

export function blockWebsiteResendPayload({ path, payload, to = null }) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  return blockPriceAlertEmailSend({
    path,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    tags: payload.tags,
    to: to || payload.to || null,
  });
}

/** @deprecated Use logPriceAlertEmailBlockedFromWebsite */
export function logPriceAlertEmailBlockedOldPath(details) {
  logPriceAlertEmailBlockedFromWebsite(details);
}
