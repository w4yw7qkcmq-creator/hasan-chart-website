export const TURNSTILE_CLIENT_ERROR_EVENT = "turnstile_client_error";
export const TURNSTILE_REGISTER_ACTION = "register";

const TURNSTILE_CLIENT_ERROR_CODE_PATTERN = /^\d{3,6}$/;

export function normalizeTurnstileClientErrorCode(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const code = String(value).trim();
  if (!TURNSTILE_CLIENT_ERROR_CODE_PATTERN.test(code)) {
    return null;
  }

  return code;
}

const BROWSER_FAMILY_PATTERN = /^[a-z0-9_]{2,32}$/;

export function normalizeBrowserFamily(value) {
  const family = String(value || "")
    .trim()
    .toLowerCase();

  if (!family || !BROWSER_FAMILY_PATTERN.test(family)) {
    return null;
  }

  return family;
}

const CLIENT_REPORT_ID_PATTERN = /^[a-f0-9-]{8,36}$/i;

export function normalizeClientReportId(value) {
  const id = String(value || "").trim();
  if (!id || !CLIENT_REPORT_ID_PATTERN.test(id)) {
    return null;
  }

  return id.slice(0, 36);
}

export function parseTurnstileClientTelemetryPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, reason: "invalid_body" };
  }

  if (body.event !== TURNSTILE_CLIENT_ERROR_EVENT) {
    return { ok: false, reason: "invalid_event" };
  }

  if (body.action !== TURNSTILE_REGISTER_ACTION) {
    return { ok: false, reason: "invalid_action" };
  }

  const code = normalizeTurnstileClientErrorCode(body.code);
  if (!code) {
    return { ok: false, reason: "invalid_code" };
  }

  const payload = {
    event: TURNSTILE_CLIENT_ERROR_EVENT,
    code,
    action: TURNSTILE_REGISTER_ACTION,
    timestamp: new Date().toISOString(),
  };

  const browserFamily = normalizeBrowserFamily(body.browserFamily);
  if (browserFamily) {
    payload.browserFamily = browserFamily;
  }

  const clientReportId = normalizeClientReportId(body.clientReportId);
  if (clientReportId) {
    payload.clientReportId = clientReportId;
  }

  return { ok: true, payload };
}

export function detectBrowserFamily(userAgent = "") {
  const ua = String(userAgent || "");
  if (/SamsungBrowser/i.test(ua)) return "samsung_internet";
  if (/Edg\//i.test(ua)) return "edge";
  if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) return "chrome";
  if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return "safari";
  if (/Firefox/i.test(ua)) return "firefox";
  return "other";
}
