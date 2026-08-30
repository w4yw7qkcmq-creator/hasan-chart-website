import { getStaticInlineScriptHashSources } from "./csp-inline-script-hashes.js";

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

export function buildContentSecurityPolicy(options = {}) {
  const includeUnsafeInline = options.includeUnsafeInline !== false;
  // Enforced production CSP must not combine static hashes with unsafe-inline:
  // browsers ignore unsafe-inline when any hash is present, which blocks Next.js
  // flight/bootstrap inline scripts. Next 15 emits route-specific RSC payloads that
  // are not viable for a fixed hash allowlist — keep hashes for strict/report-only.
  const includeStaticHashes = options.includeStaticHashes === true;
  const staticScriptHashes = includeStaticHashes
    ? getStaticInlineScriptHashSources()
    : [];
  const siteOrigins = getSiteOriginList().join(" ");
  const supabaseConnect = getSupabaseConnectSources();

  const scriptSrc = [
    "script-src 'self'",
    ...staticScriptHashes,
    ...(includeUnsafeInline ? ["'unsafe-inline'"] : []),
    "https://challenges.cloudflare.com",
    "https://s3.tradingview.com",
    "https://s.tradingview.com",
    "https://www.tradingview.com",
    "https://www.googletagmanager.com",
  ];

  const directives = [
    "default-src 'self'",
    scriptSrc.join(" "),
    ["style-src 'self' 'unsafe-inline'", "https://s3.tradingview.com"].join(" "),
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    [
      "connect-src 'self'",
      siteOrigins,
      supabaseConnect,
      "https://challenges.cloudflare.com",
      "wss://ws.okx.com:8443",
      "https://www.okx.com",
      "https://www.google-analytics.com",
      "https://analytics.google.com",
      "https://region1.google-analytics.com",
      "https://*.ingest.sentry.io",
      "https://*.ingest.us.sentry.io",
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

/** Candidate policy without unsafe-inline — for report-only monitoring only. */
export function buildStrictContentSecurityPolicy() {
  return buildContentSecurityPolicy({
    includeUnsafeInline: false,
    includeStaticHashes: true,
  });
}

function getContentSecurityPolicyHeader() {
  const policy = buildContentSecurityPolicy();
  const headers = [];

  if (process.env.CSP_STRICT_REPORT_ONLY === "1") {
    headers.push({
      key: "Content-Security-Policy-Report-Only",
      value: buildStrictContentSecurityPolicy(),
    });
  }

  if (process.env.CSP_REPORT_ONLY === "1") {
    headers.push({
      key: "Content-Security-Policy-Report-Only",
      value: policy,
    });
    return headers;
  }

  headers.push({
    key: "Content-Security-Policy",
    value: policy,
  });

  return headers;
}

export function getSecurityHeaders() {
  const headers = [...BASE_SECURITY_HEADERS];

  if (process.env.NODE_ENV === "production") {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
    headers.push(...getContentSecurityPolicyHeader());
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
  "Production enforced CSP uses unsafe-inline for Next.js 15 flight/bootstrap scripts (route-specific RSC payloads are not hash-allowlist viable). Static theme boot SHA-256 hashes are included only in the strict report-only policy. Set CSP_STRICT_REPORT_ONLY=1 to monitor hash-only theme boot compliance. Set CSP_REPORT_ONLY=1 to test the enforced policy in report-only mode.";
