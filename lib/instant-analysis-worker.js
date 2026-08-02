import { fetchWithTimeout } from "./fetch-with-timeout";

const DEFAULT_POST_TIMEOUT_MS = 20_000;
const DEFAULT_GET_TIMEOUT_MS = 12_000;
const DEFAULT_HEALTH_TIMEOUT_MS = 8_000;

export function resolveRailwayAiWorkerUrl() {
  const raw = String(
    process.env.RAILWAY_AI_WORKER_URL || process.env.NEXT_PUBLIC_RAILWAY_AI_WORKER_URL || ""
  ).trim();

  if (!raw) {
    return null;
  }

  const normalized = raw.replace(/\/+$/, "");

  if (!/^https?:\/\//i.test(normalized)) {
    return null;
  }

  return normalized;
}

export function isInstantAnalysisWorkerConfigured() {
  return Boolean(resolveRailwayAiWorkerUrl());
}

function getWorkerSecret() {
  return String(process.env.WORKER_API_SECRET || process.env.CRON_SECRET || "").trim();
}

export function buildWorkerRequestHeaders(extraHeaders = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  const secret = getWorkerSecret();
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
  }

  return headers;
}

export function buildInstantAnalysisErrorBody({
  code,
  message,
  details,
  retryAfterSeconds,
  nextAllowedAt,
}) {
  const body = {
    success: false,
    code: code || "INSTANT_ANALYSIS_ERROR",
    message: message || "خدمة التحليل اللحظي غير متاحة مؤقتاً. يرجى المحاولة بعد قليل.",
  };

  if (typeof retryAfterSeconds === "number" && retryAfterSeconds > 0) {
    body.retryAfterSeconds = retryAfterSeconds;
  }

  if (nextAllowedAt) {
    body.nextAllowedAt = nextAllowedAt;
  }

  if (process.env.NODE_ENV === "development" && details) {
    body.details = details;
  }

  return body;
}

export function instantAnalysisErrorResponse({
  status = 500,
  code,
  message,
  details,
  retryAfterSeconds,
  nextAllowedAt,
}) {
  return Response.json(
    buildInstantAnalysisErrorBody({ code, message, details, retryAfterSeconds, nextAllowedAt }),
    {
      status,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}

export async function forwardInstantAnalysisRequest(path, { method = "GET", body, timeoutMs } = {}) {
  const baseUrl = resolveRailwayAiWorkerUrl();

  if (!baseUrl) {
    return {
      ok: false,
      status: 503,
      code: "WORKER_NOT_CONFIGURED",
      message: "خدمة التحليل اللحظي غير متاحة مؤقتاً. يرجى المحاولة بعد قليل.",
    };
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${baseUrl}${normalizedPath}`;
  const resolvedTimeout =
    timeoutMs || (method === "GET" ? DEFAULT_GET_TIMEOUT_MS : DEFAULT_POST_TIMEOUT_MS);

  try {
    const response = await fetchWithTimeout(
      url,
      {
        method,
        headers: buildWorkerRequestHeaders(),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      },
      resolvedTimeout
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        code: data?.code || data?.error || "WORKER_REQUEST_FAILED",
        message:
          typeof data?.message === "string"
            ? data.message
            : typeof data?.error === "string"
              ? data.error
              : "تعذر إكمال طلب التحليل اللحظي.",
        details: data,
      };
    }

    return {
      ok: true,
      status: response.status,
      data,
    };
  } catch (error) {
    const isTimeout = error?.code === "FETCH_TIMEOUT" || error?.name === "AbortError";

    return {
      ok: false,
      status: isTimeout ? 504 : 502,
      code: isTimeout ? "WORKER_TIMEOUT" : "WORKER_UNREACHABLE",
      message: "خدمة التحليل اللحظي غير متاحة مؤقتاً. يرجى المحاولة بعد قليل.",
      details: error?.message || String(error),
    };
  }
}

export async function probeInstantAnalysisWorkerHealth() {
  if (!isInstantAnalysisWorkerConfigured()) {
    return {
      status: "unavailable",
      configured: false,
    };
  }

  const result = await forwardInstantAnalysisRequest("/health", {
    method: "GET",
    timeoutMs: DEFAULT_HEALTH_TIMEOUT_MS,
  });

  if (result.ok && result.data?.success) {
    return {
      status: "ok",
      configured: true,
    };
  }

  return {
    status: "unavailable",
    configured: true,
  };
}

export function isValidInstantAnalysisJobId(jobId) {
  return isWorkerInstantAnalysisJobId(jobId);
}

export function isWorkerInstantAnalysisJobId(jobId) {
  return /^job_\d+_[a-z0-9]{6}$/i.test(String(jobId || "").trim());
}

export function isInlineInstantAnalysisJobId(jobId) {
  return /^inline:[0-9a-f-]{36}$/i.test(String(jobId || "").trim());
}
