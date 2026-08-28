const PII_KEY_PATTERN =
  /(email|password|token|session|uuid|user_?id|telegram|phone|proof|secret|authorization|cookie|refresh|access)/i;

const BLOCKED_QUERY_KEYS = new Set([
  "token",
  "code",
  "access_token",
  "refresh_token",
  "returnUrl",
  "redirect",
  "next",
  "password",
  "email",
]);

const UTM_QUERY_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

function isLocalHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function getAnalyticsMeasurementId() {
  const id = String(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "").trim();
  return /^G-[A-Z0-9]+$/i.test(id) ? id : "";
}

export function isAnalyticsEnabled() {
  const measurementId = getAnalyticsMeasurementId();
  if (!measurementId) return false;

  if (typeof window === "undefined") return false;

  if (process.env.NEXT_PUBLIC_GA_ALLOW_DEV === "1") return true;

  if (isLocalHost(window.location.hostname)) return false;

  return true;
}

export function isAnalyticsRouteAllowed(pathname = "") {
  const path = String(pathname || "");
  if (!path || path.startsWith("/admin")) return false;
  return true;
}

export function sanitizeAnalyticsProperties(properties = {}) {
  const sanitized = {};

  for (const [key, value] of Object.entries(properties || {})) {
    if (!key || PII_KEY_PATTERN.test(key)) continue;
    if (value == null || value === "") continue;

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed || trimmed.length > 120) continue;
      if (PII_KEY_PATTERN.test(trimmed)) continue;
      sanitized[key] = trimmed;
      continue;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export function buildAnalyticsPagePath(pathname = "/", searchParams) {
  const path = String(pathname || "/");
  if (!searchParams) return path;

  const params = new URLSearchParams();
  for (const key of UTM_QUERY_KEYS) {
    const value = searchParams.get?.(key) ?? searchParams[key];
    if (value) params.set(key, String(value));
  }

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function sanitizePageLocation(pathname = "/", searchParams) {
  return buildAnalyticsPagePath(pathname, searchParams);
}

function getGtag() {
  if (typeof window === "undefined") return null;
  return typeof window.gtag === "function" ? window.gtag : null;
}

export function initAnalytics(measurementId) {
  if (!measurementId || !isAnalyticsEnabled()) return false;

  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== "function") {
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
  }

  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    send_page_view: false,
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  return true;
}

export function trackPageView(pagePath, { pathname, searchParams } = {}) {
  if (!isAnalyticsEnabled()) return;
  if (pathname && !isAnalyticsRouteAllowed(pathname)) return;

  const gtag = getGtag();
  const measurementId = getAnalyticsMeasurementId();
  if (!gtag || !measurementId) return;

  const page_path = String(pagePath || pathname || "/");
  const page_location =
    typeof window !== "undefined"
      ? `${window.location.origin}${sanitizePageLocation(pathname || page_path.split("?")[0], searchParams)}`
      : undefined;

  gtag("event", "page_view", sanitizeAnalyticsProperties({
    page_path,
    page_location,
  }));
}

export function trackEvent(eventName, properties = {}, options = {}) {
  if (!isAnalyticsEnabled()) return;
  if (options.pathname && !isAnalyticsRouteAllowed(options.pathname)) return;

  const gtag = getGtag();
  if (!gtag) return;

  const name = String(eventName || "").trim();
  if (!name) return;

  gtag("event", name, sanitizeAnalyticsProperties(properties));
}
