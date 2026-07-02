export const PRICE_ALERT_CANONICAL_PATH =
  "worker/price-alert-email.js::sendPriceAlertEmail";

export const SUPABASE_PRICE_ALERT_EMAIL_BLOCKED =
  "SUPABASE_PRICE_ALERT_EMAIL_BLOCKED";

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
  "trading intelligence platform",
  "email-logo.png",
  "hasan chart alerts",
  "alerts@hasanchartworld.com",
  "target_price",
  "triggered_price",
  "dark-compact-v1",
];

const PRICE_ALERT_REQUEST_KEYS = new Set([
  "alertid",
  "alert_id",
  "targetprice",
  "target_price",
  "currentprice",
  "current_price",
  "triggeredprice",
  "triggered_price",
  "condition",
  "message_type",
  "messageType",
]);

function normalizeEmailGuardText(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function collectEmailGuardText(fields: Record<string, unknown> = {}) {
  const tags = fields.tags;
  const tagText = Array.isArray(tags)
    ? tags
        .map((tag) => {
          const item = tag as Record<string, unknown>;
          return `${item?.name || ""}:${item?.value || ""}`;
        })
        .join("\n")
    : "";

  return [
    fields.subject,
    fields.html,
    fields.text,
    fields.title,
    fields.content,
    fields.template,
    fields.reply,
    fields.message,
    fields.body,
    tagText,
  ]
    .map(normalizeEmailGuardText)
    .filter(Boolean)
    .join("\n");
}

function matchesLegacyPriceAlertSubject(subject: unknown) {
  const normalized = normalizeEmailGuardText(subject);
  if (!normalized) return false;

  if (normalized.includes("تم تفعيل تنبيه")) return true;
  if (normalized.includes("تحقق تنبيه")) return true;
  if (/تنبيه\s+[a-z0-9-]{2,20}usdt/.test(normalized)) return true;

  return false;
}

function hasPriceAlertTag(tags: unknown) {
  if (!Array.isArray(tags)) return false;

  return tags.some((tag) => {
    const item = tag as Record<string, unknown>;
    const name = normalizeEmailGuardText(item?.name);
    const value = normalizeEmailGuardText(item?.value);

    if (name === "message_type" && value === "price-alert") return true;
    if (name === "category" && value === "price-alert") return true;
    if (name === "alert_id" && value) return true;

    return false;
  });
}

function hasPriceAlertRequestKeys(body: Record<string, unknown>) {
  for (const key of Object.keys(body)) {
    const normalizedKey = key.trim().toLowerCase();
    if (PRICE_ALERT_REQUEST_KEYS.has(normalizedKey)) {
      return true;
    }
  }

  return false;
}

export function isPriceAlertEmailContent(fields: Record<string, unknown> = {}) {
  if (fields?.alertId || fields?.alert_id) return true;

  const messageType = normalizeEmailGuardText(
    fields.type || fields.message_type || fields.messageType
  );
  if (messageType === "price-alert" || messageType === "price_alert") {
    return true;
  }

  if (hasPriceAlertTag(fields.tags)) return true;
  if (matchesLegacyPriceAlertSubject(fields.subject || fields.title)) {
    return true;
  }

  const blob = collectEmailGuardText(fields);
  if (!blob) return false;

  return PRICE_ALERT_TEXT_MARKERS.some((marker) =>
    blob.includes(normalizeEmailGuardText(marker))
  );
}

export function isSupabasePriceAlertEmailRequest(
  body: Record<string, unknown> = {}
) {
  if (!body || typeof body !== "object") return false;

  if (hasPriceAlertRequestKeys(body)) return true;

  return isPriceAlertEmailContent(body);
}

export function logSupabasePriceAlertEmailBlocked(
  path: string,
  extra: Record<string, unknown> = {}
) {
  console.log(
    SUPABASE_PRICE_ALERT_EMAIL_BLOCKED,
    JSON.stringify({
      service: "supabase-edge",
      path: path || "unknown",
      canonicalPath: PRICE_ALERT_CANONICAL_PATH,
      ...extra,
    })
  );
}

export function blockSupabasePriceAlertEmail(
  path: string,
  extra: Record<string, unknown> = {}
) {
  logSupabasePriceAlertEmailBlocked(path, extra);

  return {
    success: false,
    skipped: true,
    sent: false,
    blocked: true,
    reason: SUPABASE_PRICE_ALERT_EMAIL_BLOCKED,
    canonicalPath: PRICE_ALERT_CANONICAL_PATH,
  };
}

export function blockSupabaseResendPayload(
  path: string,
  payload: Record<string, unknown> | null | undefined,
  extra: Record<string, unknown> = {}
) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (
    !isPriceAlertEmailContent({
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      tags: payload.tags,
      title: payload.title,
      content: payload.content,
      template: payload.template,
      type: payload.type,
      alertId: payload.alertId || payload.alert_id,
    })
  ) {
    return null;
  }

  return blockSupabasePriceAlertEmail(path, {
    subject: payload.subject || null,
    to: payload.to || null,
    ...extra,
  });
}
