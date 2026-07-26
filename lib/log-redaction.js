const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|api[_-]?key|authorization|cookie|session|bearer|credential|private[_-]?key|service[_-]?role|access[_-]?token|refresh[_-]?token|vapid|webhook[_-]?secret|turnstile|endpoint|p256dh|auth)/i;

const SENSITIVE_VALUE_PATTERNS = [
  /Bearer\s+\S+/gi,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /sk_[A-Za-z0-9]+/g,
  /re_[A-Za-z0-9]+/g,
];

function maskEmail(value) {
  const email = String(value || "").trim();
  const atIndex = email.indexOf("@");

  if (atIndex <= 0) {
    return "[redacted-email]";
  }

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  const visible = local.slice(0, Math.min(2, local.length));

  return `${visible}***@${domain}`;
}

function maskUserId(value) {
  const id = String(value || "").trim();
  if (!id) return "[redacted-id]";
  if (id.length <= 8) return "[redacted-id]";
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function maskEndpoint(value) {
  const endpoint = String(value || "").trim();
  if (!endpoint) return "[redacted-endpoint]";
  if (endpoint.length <= 24) return "[redacted-endpoint]";
  return `${endpoint.slice(0, 18)}…${endpoint.slice(-6)}`;
}

function redactString(value) {
  let output = String(value);

  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    output = output.replace(pattern, "[redacted]");
  }

  if (output.includes("@") && !output.includes("[redacted]")) {
    return maskEmail(output);
  }

  return output;
}

function redactValue(key, value, depth = 0) {
  if (value == null || depth > 6) {
    return value;
  }

  if (typeof value === "string") {
    if (SENSITIVE_KEY_PATTERN.test(String(key || ""))) {
      if (key === "endpoint") return maskEndpoint(value);
      return "[redacted]";
    }

    if (key === "userId" || key === "user_id") {
      return maskUserId(value);
    }

    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(key, item, depth + 1));
  }

  if (typeof value === "object") {
    return redactLogMeta(value, depth + 1);
  }

  return value;
}

export function redactLogMeta(meta = {}, depth = 0) {
  if (!meta || typeof meta !== "object") {
    return meta;
  }

  const output = {};

  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = key === "endpoint" ? maskEndpoint(value) : "[redacted]";
      continue;
    }

    if (key === "userEmail" || key === "email" || key === "recipient") {
      output[key] = typeof value === "string" ? maskEmail(value) : value;
      continue;
    }

    if (key === "userId" || key === "user_id") {
      output[key] = typeof value === "string" ? maskUserId(value) : value;
      continue;
    }

    output[key] = redactValue(key, value, depth);
  }

  return output;
}
