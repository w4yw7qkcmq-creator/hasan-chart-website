import { jsonError, jsonOk, jsonRateLimited, CACHE_NO_STORE } from "./api-response";
import {
  buildApiErrorLogContext,
  shouldExposeErrorMessage,
} from "./structured-logger";

/**
 * Unified API error handler — returns safe client messages and logs internally.
 */
export function handleApiError(error, status = 500, options = {}) {
  const {
    request = null,
    route = null,
    logContext: extraLogContext = {},
    exposeMessage = shouldExposeErrorMessage(status),
    cacheControl = CACHE_NO_STORE,
  } = options;

  const logContext = buildApiErrorLogContext(request, {
    route,
    ...extraLogContext,
  });

  return jsonError(error, status, {
    cacheControl,
    exposeMessage,
    logContext: {
      ...logContext,
      forceLog: status >= 500,
    },
  });
}

export function handleApiSuccess(body, options = {}) {
  return jsonOk(body, options);
}

export function handleApiRateLimited(options = {}) {
  return jsonRateLimited(options);
}

export function buildRouteLogContext(request, route, extra = {}) {
  return buildApiErrorLogContext(request, {
    route,
    ...extra,
  });
}
