const axios = require("axios");

const DEFAULT_USER_AGENT =
  process.env.ECONOMIC_DISCOVERY_USER_AGENT ||
  "HasanChartWorld-EconomicDiscovery/1.0 (public-calendar; +https://hasanchart.world; no-automation-bypass)";

const CAPTCHA_PATTERNS = [
  /captcha/i,
  /cf-challenge/i,
  /challenge-platform/i,
  /g-recaptcha/i,
  /hcaptcha/i,
  /access denied/i,
  /please verify you are a human/i,
];

function isChallengeResponse({ status, headers, body }) {
  if ([401, 403, 429].includes(status)) {
    return true;
  }

  const text = String(body || "").slice(0, 8000);
  return CAPTCHA_PATTERNS.some((pattern) => pattern.test(text));
}

function createConservativeHttpClient(options = {}) {
  const dailyLimit = options.dailyLimit || Number(process.env.ECONOMIC_DISCOVERY_DAILY_LIMIT || 500);
  const defaultTimeoutMs = options.timeoutMs || 15000;
  const cache = new Map();
  let dayKey = new Date().toISOString().slice(0, 10);
  let requestsToday = 0;
  let blockedUntil = 0;
  let backoffMs = 0;
  let lastErrorSafe = null;

  function rotateDayIfNeeded() {
    const currentDay = new Date().toISOString().slice(0, 10);
    if (currentDay !== dayKey) {
      dayKey = currentDay;
      requestsToday = 0;
    }
  }

  function getState() {
    rotateDayIfNeeded();
    return {
      requestsToday,
      dailyLimit,
      blockedUntil: blockedUntil ? new Date(blockedUntil).toISOString() : null,
      lastErrorSafe,
      backoffMs,
    };
  }

  function blockProvider(reason, retryAfterSeconds = null) {
    const waitMs = retryAfterSeconds ? retryAfterSeconds * 1000 : Math.min(60 * 60 * 1000, Math.max(backoffMs * 2, 60_000));
    blockedUntil = Date.now() + waitMs;
    backoffMs = waitMs;
    lastErrorSafe = reason;
    return {
      blocked: true,
      blockedUntil: new Date(blockedUntil).toISOString(),
      reason,
    };
  }

  async function fetchUrl(url, fetchOptions = {}) {
    rotateDayIfNeeded();

    if (Date.now() < blockedUntil) {
      return {
        ok: false,
        blocked: true,
        reason: "provider_blocked",
        blockedUntil: new Date(blockedUntil).toISOString(),
        lastErrorSafe,
      };
    }

    if (requestsToday >= dailyLimit) {
      return {
        ok: false,
        blocked: true,
        reason: "daily_request_limit_reached",
        blockedUntil: null,
        lastErrorSafe: "daily_request_limit_reached",
      };
    }

    const method = (fetchOptions.method || "GET").toUpperCase();
    const cacheKey = `${method}:${url}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.storedAt < (fetchOptions.cacheTtlMs || 0)) {
      return {
        ok: true,
        status: 200,
        fromCache: true,
        cacheHit: true,
        headers: cached.headers,
        body: cached.body,
        etag: cached.etag,
        lastModified: cached.lastModified,
      };
    }

    const headers = {
      "User-Agent": DEFAULT_USER_AGENT,
      Accept: fetchOptions.accept || "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      ...fetchOptions.headers,
    };

    if (cached?.etag) {
      headers["If-None-Match"] = cached.etag;
    }
    if (cached?.lastModified) {
      headers["If-Modified-Since"] = cached.lastModified;
    }

    requestsToday += 1;

    try {
      const response = await axios.request({
        url,
        method,
        timeout: fetchOptions.timeoutMs || defaultTimeoutMs,
        headers,
        data: fetchOptions.body,
        validateStatus: () => true,
        responseType: fetchOptions.responseType || "text",
        maxRedirects: 3,
      });

      const body = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
      const retryAfterHeader = response.headers?.["retry-after"];
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : null;

      if (response.status === 304 && cached) {
        backoffMs = 0;
        return {
          ok: true,
          status: 304,
          fromCache: true,
          cacheHit: true,
          headers: cached.headers,
          body: cached.body,
          etag: cached.etag,
          lastModified: cached.lastModified,
        };
      }

      if (response.status === 429) {
        blockProvider("http_429", retryAfterSeconds || 120);
        return {
          ok: false,
          status: 429,
          blocked: true,
          reason: "http_429",
          retryAfterSeconds,
          body,
        };
      }

      if (isChallengeResponse({ status: response.status, headers: response.headers, body })) {
        blockProvider(response.status === 403 ? "http_403" : "challenge_page_detected", retryAfterSeconds);
        return {
          ok: false,
          status: response.status,
          blocked: true,
          reason: response.status === 403 ? "http_403" : "challenge_page_detected",
          body: String(body || "").slice(0, 200),
        };
      }

      if (response.status >= 400) {
        lastErrorSafe = `http_${response.status}`;
        return {
          ok: false,
          status: response.status,
          blocked: false,
          reason: lastErrorSafe,
          body: String(body || "").slice(0, 200),
        };
      }

      backoffMs = 0;
      const entry = {
        storedAt: Date.now(),
        headers: response.headers,
        body,
        etag: response.headers?.etag || null,
        lastModified: response.headers?.["last-modified"] || null,
      };
      cache.set(cacheKey, entry);

      return {
        ok: true,
        status: response.status,
        fromCache: false,
        cacheHit: false,
        headers: response.headers,
        body,
        etag: entry.etag,
        lastModified: entry.lastModified,
      };
    } catch (error) {
      lastErrorSafe = error.code === "ECONNABORTED" ? "timeout" : "network_error";
      blockProvider(lastErrorSafe, 60);
      return {
        ok: false,
        blocked: true,
        reason: lastErrorSafe,
        lastErrorSafe,
      };
    }
  }

  return {
    fetchUrl,
    getState,
    blockProvider,
    DEFAULT_USER_AGENT,
  };
}

module.exports = {
  createConservativeHttpClient,
  isChallengeResponse,
  DEFAULT_USER_AGENT,
};
