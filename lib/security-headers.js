const PERMISSIONS_POLICY =
  "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), interest-cohort=()";

const BASE_SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Service-Worker-Allowed", value: "/" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

function normalizeOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/$/, "");
  }
}

function getSiteOriginList() {
  const values = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    "https://www.hasanchartworld.com",
    "https://hasanchartworld.com",
  ];

  const origins = new Set(["'self'"]);

  for (const value of values) {
    const origin = normalizeOrigin(value);
    if (origin) origins.add(origin);
  }

  return [...origins];
}

function getSupabaseConnectSources() {
  const raw = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();

  try {
    const url = new URL(raw);
    return `${url.origin} wss://${url.host}`;
  } catch {
    return "https://*.supabase.co wss://*.supabase.co";
  }
}

function buildContentSecurityPolicy() {
  const siteOrigins = getSiteOriginList().join(" ");
  const supabaseConnect = getSupabaseConnectSources();

  const directives = [
    "default-src 'self'",
    [
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "https://challenges.cloudflare.com",
      "https://s3.tradingview.com",
      "https://s.tradingview.com",
      "https://www.tradingview.com",
    ].join(" "),
    ["style-src 'self' 'unsafe-inline'", "https://s3.tradingview.com"].join(" "),
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    [
      "connect-src 'self'",
      siteOrigins,
      supabaseConnect,
      "https://challenges.cloudflare.com",
      "https://api.resend.com",
      "wss://ws.okx.com:8443",
      "https://www.okx.com",
      "https://api.openai.com",
    ].join(" "),
    [
      "frame-src 'self'",
      "https://s.tradingview.com",
      "https://www.tradingview.com",
      "https://challenges.cloudflare.com",
    ].join(" "),
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "upgrade-insecure-requests",
  ];

  return directives.join("; ");
}

function getContentSecurityPolicyHeader() {
  const policy = buildContentSecurityPolicy();

  if (process.env.CSP_REPORT_ONLY === "1") {
    return {
      key: "Content-Security-Policy-Report-Only",
      value: policy,
    };
  }

  return {
    key: "Content-Security-Policy",
    value: policy,
  };
}

export function getSecurityHeaders() {
  const headers = [...BASE_SECURITY_HEADERS];

  if (process.env.NODE_ENV === "production") {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
    headers.push(getContentSecurityPolicyHeader());
  }

  return headers;
}

export function applySecurityHeaders(response) {
  for (const { key, value } of getSecurityHeaders()) {
    response.headers.set(key, value);
  }

  response.headers.set("Vary", "Accept-Encoding");
  return response;
}

export const SECURITY_HARDENING_NOTE =
  "Production CSP is enabled with pragmatic allowlists for TradingView, Turnstile, Supabase, OKX, and external news images. Set CSP_REPORT_ONLY=1 to test without enforcing.";
