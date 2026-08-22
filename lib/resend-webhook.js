import crypto from "crypto";

function decodeWebhookSecret(secret) {
  const trimmed = String(secret || "").trim();
  if (!trimmed) return null;
  const base64Part = trimmed.startsWith("whsec_") ? trimmed.slice(6) : trimmed;
  return Buffer.from(base64Part, "base64");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function verifyResendWebhook(payload, headers, secret) {
  const webhookSecret = String(secret || "").trim();

  if (!webhookSecret) {
    throw new Error("RESEND_WEBHOOK_SECRET is not configured");
  }

  const svixId = headers.get("svix-id");
  const svixTimestamp = headers.get("svix-timestamp");
  const svixSignature = headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    throw new Error("Missing Svix webhook headers");
  }

  const secretBytes = decodeWebhookSecret(webhookSecret);
  if (!secretBytes) {
    throw new Error("Invalid webhook secret");
  }

  const signedContent = `${svixId}.${svixTimestamp}.${payload}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  const signatures = String(svixSignature)
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);

  const isValid = signatures.some((part) => {
    const [version, signature] = part.split(",");
    return version === "v1" && safeEqual(signature, expected);
  });

  if (!isValid) {
    throw new Error("Invalid webhook signature");
  }

  return JSON.parse(payload);
}

export function extractRecipientEmail(data = {}) {
  if (Array.isArray(data.to) && data.to.length > 0) {
    return String(data.to[0] || "").trim().toLowerCase();
  }

  if (typeof data.to === "string") {
    return data.to.trim().toLowerCase();
  }

  return "";
}

export function extractMessageType(data = {}) {
  const tags = data.tags;

  if (Array.isArray(tags)) {
    const match = tags.find((tag) => tag?.name === "message_type" || tag?.name === "type");
    if (match?.value) return String(match.value).trim();
  }

  if (tags && typeof tags === "object") {
    if (tags.message_type) return String(tags.message_type).trim();
    if (tags.type) return String(tags.type).trim();
    if (tags.category) return String(tags.category).trim();
  }

  return "general";
}

export function extractOutboxIdFromTags(data = {}) {
  const tags = data.tags;

  if (Array.isArray(tags)) {
    const match = tags.find((tag) => tag?.name === "outbox_id");
    if (match?.value) return String(match.value).trim();
  }

  if (tags && typeof tags === "object" && tags.outbox_id) {
    return String(tags.outbox_id).trim();
  }

  return null;
}

export function extractCampaignIdFromTags(data = {}) {
  const tags = data.tags;

  if (Array.isArray(tags)) {
    const match = tags.find((tag) => tag?.name === "campaign_id");
    if (match?.value) return String(match.value).trim();
  }

  if (tags && typeof tags === "object" && tags.campaign_id) {
    return String(tags.campaign_id).trim();
  }

  return null;
}

export function mapEventToStatus(eventType) {
  switch (eventType) {
    case "email.sent":
      return "sent";
    case "email.delivered":
      return "delivered";
    case "email.failed":
      return "failed";
    case "email.bounced":
      return "bounced";
    case "email.complained":
      return "complained";
    case "email.suppressed":
      return "suppressed";
    case "email.delivery_delayed":
      return "delayed";
    default:
      return null;
  }
}

export function parseResendEventTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseDeviceFromUserAgent(userAgent) {
  const ua = String(userAgent || "").trim();
  if (!ua) return null;

  if (/ipad|tablet|kindle|playbook/i.test(ua)) return "Tablet";
  if (/mobile|iphone|ipod|android.*mobile|windows phone/i.test(ua)) return "Mobile";
  if (/android/i.test(ua)) return "Tablet";
  return "Desktop";
}

export function extractEngagementMeta(data = {}, eventType = "") {
  const meta = {
    ip: null,
    device: null,
    country: null,
  };

  if (eventType === "email.clicked" && data.click) {
    meta.ip = data.click.ipAddress || data.click.ip || null;
    meta.device = parseDeviceFromUserAgent(data.click.userAgent);
  }

  if (data.country) {
    meta.country = String(data.country).trim();
  } else if (data.location?.country) {
    meta.country = String(data.location.country).trim();
  } else if (data.geo?.country) {
    meta.country = String(data.geo.country).trim();
  }

  return meta;
}
