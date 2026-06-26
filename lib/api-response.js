import {
  logApiError,
  sanitizeErrorForClient,
  shouldExposeErrorMessage,
} from "./structured-logger";

export const CACHE_PUBLIC_MARKET = "public, s-maxage=8, stale-while-revalidate=30";
export const CACHE_PUBLIC_CONTENT = "public, s-maxage=30, stale-while-revalidate=120";
export const CACHE_PRIVATE_USER = "private, max-age=8, stale-while-revalidate=20";
export const CACHE_PRIVATE_SHORT = "private, max-age=5, stale-while-revalidate=15";
export const CACHE_NO_STORE = "no-store, max-age=0";

export function jsonResponse(body, { status = 200, cacheControl, extraHeaders = {} } = {}) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Accept-Encoding",
    ...extraHeaders,
  };

  if (cacheControl) {
    headers["Cache-Control"] = cacheControl;
  }

  return Response.json(body, { status, headers });
}

export function jsonOk(body, options = {}) {
  return jsonResponse({ success: true, ...body }, options);
}

export function jsonError(error, status = 500, options = {}) {
  const { cacheControl, logContext = {}, exposeMessage = shouldExposeErrorMessage(status) } =
    options;

  const internalMessage =
    typeof error === "string" ? error : error?.message || "Server Error";

  if (status >= 500 || logContext.forceLog) {
    logApiError({
      ...logContext,
      status,
      error: internalMessage,
    });
  }

  const publicMessage = exposeMessage
    ? sanitizeErrorForClient(error, status)
    : sanitizeErrorForClient(null, status);

  return jsonResponse(
    {
      success: false,
      error: publicMessage,
      ...(logContext.requestId ? { requestId: logContext.requestId } : {}),
    },
    { status, cacheControl: cacheControl || CACHE_NO_STORE }
  );
}

export function jsonRateLimited() {
  return jsonError("تم تجاوز عدد المحاولات المسموح. حاول لاحقاً.", 429, {
    cacheControl: CACHE_NO_STORE,
    exposeMessage: true,
  });
}
