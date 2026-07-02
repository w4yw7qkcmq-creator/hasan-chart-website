const PRICE_ALERT_CANONICAL_PATH = "worker/price-alert-email.js::sendPriceAlertEmail";

const PRICE_ALERT_TEXT_MARKERS = [
  "وصل السعر إلى هدف التنبيه",
  "وصل السعر",
  "تم تفعيل تنبيه",
  "تم تفعيل تنبيه السعر",
  "تحقق تنبيه",
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

function matchesLegacyPriceAlertSubject(subject) {
  const normalized = normalizeEmailGuardText(subject);
  if (!normalized) return false;

  if (normalized.includes("تم تفعيل تنبيه")) return true;
  if (normalized.includes("تحقق تنبيه")) return true;
  if (/تنبيه\s+[a-z0-9-]{2,20}usdt/.test(normalized)) return true;

  return false;
}

function hasPriceAlertTag(tags) {
  if (!Array.isArray(tags)) return false;

  return tags.some((tag) => {
    const name = normalizeEmailGuardText(tag?.name);
    const value = normalizeEmailGuardText(tag?.value);

    if (name === "message_type" && value === "price-alert") return true;
    if (name === "category" && value === "price-alert") return true;
    if (name === "alert_id" && value) return true;

    return false;
  });
}

function isPriceAlertEmailContent(fields = {}) {
  if (fields?.alertId) return true;
  if (hasPriceAlertTag(fields.tags)) return true;
  if (matchesLegacyPriceAlertSubject(fields.subject || fields.title)) return true;

  const blob = collectEmailGuardText(fields);
  if (!blob) return false;

  return PRICE_ALERT_TEXT_MARKERS.some((marker) =>
    blob.includes(normalizeEmailGuardText(marker))
  );
}

function logPriceAlertEmailBlockedOldPath({
  path,
  subject = null,
  title = null,
  alertId = null,
  label = null,
  to = null,
}) {
  console.log(
    "PRICE_ALERT_EMAIL_BLOCKED_FROM_WEBSITE",
    JSON.stringify({
      service: "hasan-chart-worker-email-queue",
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

function blockPriceAlertEmailSend({ path, ...fields }) {
  if (!isPriceAlertEmailContent(fields)) {
    return null;
  }

  logPriceAlertEmailBlockedOldPath({
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

module.exports = {
  PRICE_ALERT_CANONICAL_PATH,
  isPriceAlertEmailContent,
  logPriceAlertEmailBlockedOldPath,
  blockPriceAlertEmailSend,
};
