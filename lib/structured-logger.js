import { randomUUID } from "crypto";
import { redactLogMeta } from "./log-redaction.js";

const PUBLIC_ERROR_MESSAGES = {
  400: "طلب غير صالح.",
  401: "يجب تسجيل الدخول.",
  403: "غير مصرح لك بهذا الإجراء.",
  404: "المورد غير موجود.",
  429: "Too many requests, please try again later.",
  500: "حدث خطأ في الخادم. حاول لاحقاً.",
  502: "الخدمة غير متاحة مؤقتاً.",
  503: "الخدمة غير متاحة مؤقتاً.",
};

export function createRequestId() {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

export function getPublicErrorMessage(status = 500) {
  return PUBLIC_ERROR_MESSAGES[status] || PUBLIC_ERROR_MESSAGES[500];
}

export function shouldExposeErrorMessage(status = 500) {
  return status > 0 && status < 500;
}

export function getRequestLogContext(request) {
  if (!request) {
    return {
      requestId: null,
      route: null,
      method: null,
      responseTimeMs: null,
    };
  }

  const requestId = request.headers.get("x-request-id");
  const startedAt = Number(request.headers.get("x-request-start") || 0);
  const responseTimeMs =
    startedAt > 0 ? Math.max(0, Date.now() - startedAt) : null;

  let route = null;
  try {
    route = new URL(request.url).pathname;
  } catch {
    route = null;
  }

  return {
    requestId,
    route,
    method: request.method || null,
    responseTimeMs,
  };
}

const TECHNICAL_ERROR_PATTERNS = [
  /supabase/i,
  /postgres/i,
  /ECONNREFUSED/i,
  /fetch failed/i,
  /service role/i,
  /NEXT_PUBLIC_/i,
  /SUPABASE_/i,
  /OPENAI_/i,
  /RESEND_/i,
];

export function logStructured(level, event, meta = {}) {
  const payload = redactLogMeta({
    level,
    event,
    timestamp: new Date().toISOString(),
    ...meta,
  });

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export function logApiRequest(meta = {}) {
  logStructured("info", "api.request", meta);
}

export function logApiError(meta = {}) {
  logStructured("error", "api.error", meta);
}

export function logApiWarning(meta = {}) {
  logStructured("warn", "api.warning", meta);
}

function stripTechnicalClientMessage(message) {
  const value = String(message || "").trim();

  if (!value) {
    return getPublicErrorMessage(400);
  }

  if (TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(value))) {
    return getPublicErrorMessage(400);
  }

  return value;
}

export function sanitizeErrorForClient(error, status = 500) {
  if (shouldExposeErrorMessage(status)) {
    if (typeof error === "string") {
      return stripTechnicalClientMessage(error);
    }

    return stripTechnicalClientMessage(error?.message) || getPublicErrorMessage(status);
  }

  return getPublicErrorMessage(status);
}

export function buildApiErrorLogContext(request, extra = {}) {
  return redactLogMeta({
    ...getRequestLogContext(request),
    ...extra,
  });
}
