const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const DEFAULT_SERVICE_ACCOUNT_ID = "instant-analysis-worker";
const WORKER_HTTP_PERMISSION = "analysis.manage";
const DEV_TEST_PEPPER = "iam-service-pepper-dev-only";
const KNOWN_WEAK_PEPPERS = new Set([
  DEV_TEST_PEPPER,
  "unconfigured",
  "changeme",
  "placeholder",
  "iam-service-pepper",
]);

const authMetrics = {
  machine: 0,
  legacy: 0,
  denied: 0,
  machineHeaderRejected: 0,
  humanSessionRejected: 0,
  originRejected: 0,
};

const securityEvents = {
  machine_invalid: 0,
  machine_disabled: 0,
  machine_revoked: 0,
  machine_permission_denied: 0,
  machine_header_conflict: 0,
  legacy_invalid: 0,
  origin_without_credentials: 0,
  cookie_without_machine_auth: 0,
  pepper_missing: 0,
};

let supabaseClient = null;

function isProductionLikeEnvironment() {
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  const railwayEnv = String(process.env.RAILWAY_ENVIRONMENT || "").trim().toLowerCase();
  if (nodeEnv === "production") return true;
  if (railwayEnv === "production" || railwayEnv === "staging") return true;
  if (process.env.IAM_REQUIRE_PRODUCTION_PEPPER === "true") return true;
  return false;
}

function isValidPepperValue(value) {
  const pepper = String(value || "").trim();
  if (pepper.length < 32) return false;
  if (KNOWN_WEAK_PEPPERS.has(pepper)) return false;
  if (/^0+$/.test(pepper)) return false;
  return true;
}

function requireServiceSecretPepper() {
  const configured = String(process.env.IAM_SERVICE_SECRET_PEPPER || "").trim();

  if (isValidPepperValue(configured)) {
    return { ok: true, pepper: configured, configured: true };
  }

  if (!isProductionLikeEnvironment()) {
    return { ok: true, pepper: DEV_TEST_PEPPER, configured: false, testFallback: true };
  }

  return { ok: false, configured: false, misconfigured: true };
}

function pepper() {
  const result = requireServiceSecretPepper();
  if (!result.ok) {
    throw new Error("SERVICE_SECRET_PEPPER_MISCONFIGURED");
  }
  return result.pepper;
}

function isMachineAuthConfigured() {
  return requireServiceSecretPepper().ok;
}

function timingSafeEqual(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function hashServiceSecret(secret, accountId = "") {
  return crypto
    .createHmac("sha256", pepper())
    .update(`${String(accountId || "").trim()}:`)
    .update(String(secret || ""))
    .digest("hex");
}

function verifyServiceSecret(secret, storedHash, accountId = "") {
  if (!storedHash || !secret) return false;
  try {
    return timingSafeEqual(hashServiceSecret(secret, accountId), storedHash);
  } catch {
    return false;
  }
}

function isPlaceholderHash(hash) {
  if (!hash) return true;
  const normalized = String(hash).trim().toLowerCase();
  return /^0+$/.test(normalized) || normalized === "unconfigured";
}

function isServiceAccountConfigured(account) {
  if (!account) return false;
  if (account.enabled === false) return false;
  if (account.revoked_at) return false;
  if (!account.secret_hash || isPlaceholderHash(account.secret_hash)) return false;
  return true;
}

function isWorkerMachineAuthEnabled() {
  return process.env.IAM_WORKER_AUTH !== "false";
}

function isLegacyFallbackEnabled() {
  return process.env.IAM_WORKER_LEGACY_FALLBACK !== "false";
}

function resolveAllowedServiceAccountIds(options = {}) {
  const configured = options.allowedServiceAccountIds;
  if (Array.isArray(configured) && configured.length) {
    return new Set(configured.map((id) => String(id || "").trim()).filter(Boolean));
  }
  return allowedServiceAccountIds();
}

function allowedServiceAccountIds() {
  const configured = String(
    process.env.IAM_INSTANT_ANALYSIS_WORKER_SERVICE_ACCOUNT_ID || DEFAULT_SERVICE_ACCOUNT_ID
  ).trim();
  return new Set([configured, DEFAULT_SERVICE_ACCOUNT_ID]);
}

function getWorkerSharedSecret() {
  return String(process.env.WORKER_API_SECRET || process.env.CRON_SECRET || "").trim();
}

function getProvidedWorkerSecret(req) {
  const authHeader = String(req.headers.authorization || "");
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  return bearer || String(req.headers["x-worker-secret"] || req.headers["x-cron-secret"] || "").trim();
}

function hasLegacySecretAttempt(req) {
  return Boolean(getProvidedWorkerSecret(req));
}

function hasValidWorkerSecret(req) {
  const secret = getWorkerSharedSecret();
  if (!secret) return false;
  return timingSafeEqual(getProvidedWorkerSecret(req), secret);
}

function getMachineHeaders(req) {
  const canonicalId = String(req.headers["x-service-account-id"] || "").trim();
  const aliasId = String(req.headers["x-iam-service-id"] || "").trim();
  const canonicalSecret = String(req.headers["x-service-account-secret"] || "").trim();
  const aliasSecret = String(req.headers["x-iam-service-secret"] || "").trim();

  if (canonicalId && aliasId && canonicalId !== aliasId) {
    return { accountId: "", secret: "", present: true, conflict: true };
  }

  if (canonicalSecret && aliasSecret && canonicalSecret !== aliasSecret) {
    return { accountId: "", secret: "", present: true, conflict: true };
  }

  const accountId = canonicalId || aliasId;
  const secret = canonicalSecret || aliasSecret;

  return {
    accountId,
    secret,
    present: Boolean(accountId || secret),
    conflict: false,
  };
}

function hasHumanSessionCookie(req) {
  const cookie = String(req.headers.cookie || "");
  return /(?:^|;\s*)hc_access_token=/.test(cookie);
}

function hasOriginOrRefererSignal(req) {
  const origin = String(req.headers.origin || "").trim();
  const referer = String(req.headers.referer || "").trim();
  return Boolean(origin || referer);
}

function getSupabaseAdmin() {
  if (supabaseClient) return supabaseClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  supabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseClient;
}

function setSupabaseAdmin(client) {
  supabaseClient = client;
}

function resetSupabaseAdmin() {
  supabaseClient = null;
}

function accountHasPermission(permissions, requiredPermission) {
  const required = String(requiredPermission || WORKER_HTTP_PERMISSION).trim();
  if (!required) return true;
  return (permissions || []).some(
    (row) => row.permission_id === required && String(row.effect || "allow").toLowerCase() !== "deny"
  );
}

function recordSecurityEvent(name) {
  if (Object.prototype.hasOwnProperty.call(securityEvents, name)) {
    securityEvents[name] += 1;
  }
}

async function verifyMachineIdentityWithClient(supabase, req, options = {}) {
  const pepperState = requireServiceSecretPepper();
  if (!pepperState.ok) {
    recordSecurityEvent("pepper_missing");
    return {
      ok: false,
      hardFail: true,
      status: 503,
      error: "Worker machine identity is misconfigured.",
      misconfigured: true,
    };
  }

  const { accountId, secret, present, conflict } = getMachineHeaders(req);
  const requiredPermission = options.requiredPermission || WORKER_HTTP_PERMISSION;

  if (!present) {
    return { ok: false, skipped: true };
  }

  if (conflict) {
    recordSecurityEvent("machine_header_conflict");
    return {
      ok: false,
      hardFail: true,
      status: 401,
      error: "Conflicting service account headers.",
    };
  }

  if (!accountId || !secret) {
    recordSecurityEvent("machine_invalid");
    return {
      ok: false,
      hardFail: true,
      status: 401,
      error: "Incomplete service account headers.",
    };
  }

  const allowedIds = resolveAllowedServiceAccountIds(options);
  if (!allowedIds.has(accountId)) {
    recordSecurityEvent("machine_invalid");
    return {
      ok: false,
      hardFail: true,
      status: 403,
      error: "Service account not permitted for worker HTTP routes.",
    };
  }

  if (!supabase) {
    return {
      ok: false,
      hardFail: true,
      status: 503,
      error: "Worker machine identity backend unavailable.",
    };
  }

  const { data: account, error: accountError } = await supabase
    .from("iam_service_accounts")
    .select("id, label, secret_hash, enabled, revoked_at")
    .eq("id", accountId)
    .maybeSingle();

  if (accountError || !account) {
    recordSecurityEvent("machine_invalid");
    return {
      ok: false,
      hardFail: true,
      status: 401,
      error: "Service account not found.",
    };
  }

  if (account.revoked_at) {
    recordSecurityEvent("machine_revoked");
    return {
      ok: false,
      hardFail: true,
      status: 403,
      error: "Service account disabled or not configured.",
    };
  }

  if (!isServiceAccountConfigured(account)) {
    recordSecurityEvent(account.enabled === false ? "machine_disabled" : "machine_invalid");
    return {
      ok: false,
      hardFail: true,
      status: 403,
      error: "Service account disabled or not configured.",
    };
  }

  if (!verifyServiceSecret(secret, account.secret_hash, accountId)) {
    recordSecurityEvent("machine_invalid");
    return {
      ok: false,
      hardFail: true,
      status: 401,
      error: "Invalid service account secret.",
    };
  }

  const { data: permissions, error: permError } = await supabase
    .from("iam_service_account_permissions")
    .select("permission_id, effect")
    .eq("service_account_id", accountId);

  if (permError) {
    return {
      ok: false,
      hardFail: true,
      status: 503,
      error: "Service account permission lookup failed.",
    };
  }

  if (!accountHasPermission(permissions, requiredPermission)) {
    recordSecurityEvent("machine_permission_denied");
    return {
      ok: false,
      hardFail: true,
      status: 403,
      error: "Service account lacks worker HTTP permission.",
    };
  }

  const ip =
    String(req.headers["x-forwarded-for"] || "")
      .split(",")[0]
      .trim() ||
    req.socket?.remoteAddress ||
    null;

  try {
    await supabase
      .from("iam_service_accounts")
      .update({
        last_used_at: new Date().toISOString(),
        last_used_ip: ip,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId);
  } catch {
    // non-blocking
  }

  return {
    ok: true,
    serviceAccountId: accountId,
    permission: requiredPermission,
  };
}

async function verifyMachineIdentity(req, options = {}) {
  return verifyMachineIdentityWithClient(getSupabaseAdmin(), req, options);
}

function recordAuthMetric(mode) {
  if (Object.prototype.hasOwnProperty.call(authMetrics, mode)) {
    authMetrics[mode] += 1;
  }
}

function recordDeniedMetric(reason) {
  authMetrics.denied += 1;
  if (reason === "human_session") {
    authMetrics.humanSessionRejected += 1;
    recordSecurityEvent("cookie_without_machine_auth");
  }
  if (reason === "machine") authMetrics.machineHeaderRejected += 1;
  if (reason === "origin") {
    authMetrics.originRejected += 1;
    recordSecurityEvent("origin_without_credentials");
  }
  if (reason === "legacy") recordSecurityEvent("legacy_invalid");
}

function getWorkerAuthMetrics() {
  const pepperState = requireServiceSecretPepper();
  return {
    machine: authMetrics.machine,
    legacy: authMetrics.legacy,
    denied: authMetrics.denied,
    machineHeaderRejected: authMetrics.machineHeaderRejected,
    humanSessionRejected: authMetrics.humanSessionRejected,
    originRejected: authMetrics.originRejected,
    machineAuthConfigured: pepperState.ok && isWorkerMachineAuthEnabled(),
    legacyFallbackEnabled: isLegacyFallbackEnabled(),
    securityEvents: { ...securityEvents },
  };
}

function resetWorkerAuthMetrics() {
  for (const key of Object.keys(authMetrics)) {
    authMetrics[key] = 0;
  }
  for (const key of Object.keys(securityEvents)) {
    securityEvents[key] = 0;
  }
}

async function verifyWorkerRouteAccess(req, options = {}) {
  const machineHeaders = getMachineHeaders(req);

  if (machineHeaders.present) {
    if (isWorkerMachineAuthEnabled()) {
      const machine = await verifyMachineIdentity(req, options);
      if (machine.ok) {
        recordAuthMetric("machine");
        return { ok: true, mode: "machine", serviceAccountId: machine.serviceAccountId };
      }
      if (machine.hardFail) {
        recordDeniedMetric("machine");
        return {
          ok: false,
          status: machine.status || 401,
          error: machine.error || "Unauthorized machine request.",
        };
      }
    }

    return {
      ok: false,
      status: 401,
      error: "Unauthorized machine request.",
    };
  }

  if (hasLegacySecretAttempt(req)) {
    if (isLegacyFallbackEnabled() && hasValidWorkerSecret(req)) {
      recordAuthMetric("legacy");
      return { ok: true, mode: "legacy" };
    }
    recordDeniedMetric("legacy");
    return {
      ok: false,
      status: isLegacyFallbackEnabled() ? 401 : 403,
      error: isLegacyFallbackEnabled()
        ? "Unauthorized worker request."
        : "Legacy worker secret fallback disabled.",
    };
  }

  recordDeniedMetric("denied");
  return {
    ok: false,
    status: 401,
    error: "Unauthorized worker request.",
  };
}

module.exports = {
  DEFAULT_SERVICE_ACCOUNT_ID,
  WORKER_HTTP_PERMISSION,
  DEV_TEST_PEPPER,
  hashServiceSecret,
  verifyServiceSecret,
  isServiceAccountConfigured,
  isWorkerMachineAuthEnabled,
  isLegacyFallbackEnabled,
  isMachineAuthConfigured,
  isProductionLikeEnvironment,
  requireServiceSecretPepper,
  getMachineHeaders,
  hasHumanSessionCookie,
  hasOriginOrRefererSignal,
  accountHasPermission,
  verifyMachineIdentity,
  verifyMachineIdentityWithClient,
  verifyWorkerRouteAccess,
  getWorkerSharedSecret,
  hasLegacySecretAttempt,
  hasValidWorkerSecret,
  getSupabaseAdmin,
  setSupabaseAdmin,
  resetSupabaseAdmin,
  recordAuthMetric,
  recordDeniedMetric,
  recordSecurityEvent,
  getWorkerAuthMetrics,
  resetWorkerAuthMetrics,
};
