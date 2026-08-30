/**
 * Privacy scrubber for Sentry events — mirrors lib/log-redaction.js principles.
 */

const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|api[_-]?key|authorization|cookie|session|bearer|credential|private[_-]?key|service[_-]?role|access[_-]?token|refresh[_-]?token|vapid|webhook[_-]?secret|turnstile|payment[_-]?proof|p256dh|auth)/i;

const SENSITIVE_VALUE_PATTERNS = [
  /Bearer\s+\S+/gi,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /sk_[A-Za-z0-9]+/g,
  /re_[A-Za-z0-9]+/g,
];

const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-service-account-secret",
  "x-iam-service-secret",
  "x-supabase-auth",
]);

const SENSITIVE_QUERY_PARAMS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "code",
  "secret",
  "password",
  "api_key",
  "apikey",
]);

function redactString(value) {
  let output = String(value || "");

  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    output = output.replace(pattern, "[redacted]");
  }

  return output;
}

function scrubValue(key, value, depth = 0) {
  if (value == null || depth > 8) {
    return value;
  }

  if (typeof value === "string") {
    if (SENSITIVE_KEY_PATTERN.test(String(key || ""))) {
      return "[redacted]";
    }
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(key, item, depth + 1));
  }

  if (typeof value === "object") {
    return scrubObject(value, depth + 1);
  }

  return value;
}

function scrubObject(input, depth = 0) {
  if (!input || typeof input !== "object") {
    return input;
  }

  const output = {};

  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = "[redacted]";
      continue;
    }

    if (key === "email" || key === "userEmail" || key === "recipient") {
      output[key] = "[redacted-email]";
      continue;
    }

    output[key] = scrubValue(key, value, depth);
  }

  return output;
}

function scrubUrl(urlValue) {
  if (!urlValue) return urlValue;

  try {
    const url = new URL(String(urlValue));
    for (const param of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_PARAMS.has(param.toLowerCase())) {
        url.searchParams.set(param, "[redacted]");
      }
    }
    return redactString(url.toString());
  } catch {
    return redactString(urlValue);
  }
}

/**
 * @param {import("@sentry/nextjs").ErrorEvent} event
 * @returns {import("@sentry/nextjs").ErrorEvent | null}
 */
export function scrubSentryEvent(event) {
  if (!event || typeof event !== "object") {
    return event;
  }

  if (event.user) {
    delete event.user.email;
    delete event.user.username;
    delete event.user.ip_address;
    if (event.user.id) {
      event.user.id = "[redacted-id]";
    }
  }

  if (event.request) {
    if (event.request.headers) {
      for (const header of Object.keys(event.request.headers)) {
        if (SENSITIVE_HEADER_NAMES.has(header.toLowerCase())) {
          event.request.headers[header] = "[redacted]";
        }
      }
    }

    if (event.request.cookies) {
      event.request.cookies = "[redacted]";
    }

    if (event.request.data) {
      event.request.data = scrubObject(event.request.data);
    }

    if (event.request.query_string) {
      event.request.query_string = scrubUrl(`https://local/?${event.request.query_string}`).replace(
        "https://local/?",
        ""
      );
    }

    if (event.request.url) {
      event.request.url = scrubUrl(event.request.url);
    }
  }

  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => {
      const next = { ...crumb };
      if (next.data) {
        next.data = scrubObject(next.data);
      }
      if (next.message) {
        next.message = redactString(next.message);
      }
      return next;
    });
  }

  if (event.extra) {
    event.extra = scrubObject(event.extra);
  }

  if (event.contexts) {
    event.contexts = scrubObject(event.contexts);
  }

  return event;
}
