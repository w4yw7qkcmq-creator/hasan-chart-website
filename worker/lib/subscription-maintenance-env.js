const crypto = require("crypto");

const PRODUCTION_API_HOST = "subscription-maintenance-api-production.up.railway.app";
const MAINTENANCE_ACCOUNT_ID = "subscription-maintenance-worker";
const WEAK_PEPPERS = new Set([
  "iam-service-pepper-dev-only",
  "unconfigured",
  "changeme",
  "placeholder",
  "iam-service-pepper",
]);
const WEAK_SECRETS = new Set(["changeme", "placeholder", "test", "secret"]);

function envValue(key) {
  return String(process.env[key] ?? "").trim();
}

function isProductionLike() {
  const nodeEnv = envValue("NODE_ENV").toLowerCase();
  const railwayEnv = envValue("RAILWAY_ENVIRONMENT").toLowerCase();
  return nodeEnv === "production" || railwayEnv === "production";
}

function parseBooleanEnv(key, { required = false, expected = null } = {}) {
  const raw = envValue(key);
  if (!raw) {
    if (required) return { ok: false, error: "missing" };
    return { ok: true, value: false, present: false };
  }
  const normalized = raw.toLowerCase();
  if (!["true", "false", "1", "0", "yes", "no"].includes(normalized)) {
    return { ok: false, error: "invalid_boolean" };
  }
  const value = normalized === "true" || normalized === "1" || normalized === "yes";
  if (expected !== null && value !== expected) {
    return { ok: false, error: "unexpected_boolean" };
  }
  return { ok: true, value, present: true };
}

function parseHttpsUrl(key, { required = false, allowedHost = null } = {}) {
  const raw = envValue(key);
  if (!raw) {
    if (required) return { ok: false, error: "missing" };
    return { ok: true, present: false, value: "" };
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  if (isProductionLike() && parsed.protocol !== "https:") {
    return { ok: false, error: "https_required" };
  }
  if (allowedHost && parsed.host !== allowedHost) {
    return { ok: false, error: "host_mismatch" };
  }
  return { ok: true, present: true, value: raw.replace(/\/+$/, ""), host: parsed.host };
}

function parseSecret(key, { minLength = 32, required = false } = {}) {
  const raw = envValue(key);
  if (!raw) {
    if (required) return { ok: false, error: "missing" };
    return { ok: true, present: false, value: "" };
  }
  if (raw.length < minLength || WEAK_SECRETS.has(raw.toLowerCase())) {
    return { ok: false, error: "weak_or_short" };
  }
  return { ok: true, present: true, value: raw, length: raw.length };
}

function parsePepper(key, { required = false } = {}) {
  const raw = envValue(key);
  if (!raw) {
    if (required) return { ok: false, error: "missing" };
    return { ok: true, present: false, value: "" };
  }
  if (raw.length < 32 || WEAK_PEPPERS.has(raw) || /^0+$/.test(raw)) {
    return { ok: false, error: "weak_or_short" };
  }
  return { ok: true, present: true, value: raw, length: raw.length };
}

function parseTimeoutMs(key, { defaultMs = 90_000, minMs = 10_000, maxMs = 120_000 } = {}) {
  const raw = envValue(key);
  if (!raw) return { ok: true, present: false, value: defaultMs };
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minMs || value > maxMs) {
    return { ok: false, error: "out_of_bounds" };
  }
  return { ok: true, present: true, value };
}

function parseAccountId(key, { required = false } = {}) {
  const raw = envValue(key);
  if (!raw) {
    if (required) return { ok: false, error: "missing" };
    return { ok: true, present: false, value: MAINTENANCE_ACCOUNT_ID };
  }
  if (raw !== MAINTENANCE_ACCOUNT_ID) {
    return { ok: false, error: "account_mismatch" };
  }
  return { ok: true, present: true, value: raw };
}

function collectValidation(checks) {
  const missing = [];
  const invalid = [];
  const validated = {};

  for (const check of checks) {
    const result = check.run();
    if (!result.ok) {
      if (result.error === "missing") missing.push(check.key);
      else invalid.push({ key: check.key, reason: result.error });
      continue;
    }
    validated[check.key] = {
      present: result.present !== false,
      ...(result.host ? { host: result.host } : {}),
      ...(typeof result.length === "number" ? { length: result.length } : {}),
      ...(typeof result.value === "boolean" ? { value: result.value } : {}),
    };
  }

  return {
    ok: missing.length === 0 && invalid.length === 0,
    missingRequired: missing,
    invalidRequired: invalid,
    validated,
    missingRequiredCount: missing.length,
    invalidRequiredCount: invalid.length,
  };
}

function validateApiEnvironment(options = {}) {
  const production = options.production ?? isProductionLike();
  const checks = [
    {
      key: "NEXT_PUBLIC_SUPABASE_URL",
      run: () => parseHttpsUrl("NEXT_PUBLIC_SUPABASE_URL", { required: !envValue("SUPABASE_URL") }),
    },
    {
      key: "SUPABASE_URL",
      run: () => {
        if (envValue("NEXT_PUBLIC_SUPABASE_URL")) return { ok: true, present: false };
        return parseHttpsUrl("SUPABASE_URL", { required: true });
      },
    },
    { key: "SUPABASE_SERVICE_ROLE_KEY", run: () => parseSecret("SUPABASE_SERVICE_ROLE_KEY", { required: true, minLength: 20 }) },
    { key: "IAM_WORKER_AUTH", run: () => parseBooleanEnv("IAM_WORKER_AUTH", { required: true, expected: true }) },
    { key: "IAM_SERVICE_SECRET_PEPPER", run: () => parsePepper("IAM_SERVICE_SECRET_PEPPER", { required: true }) },
    { key: "IAM_SUBSCRIPTION_MAINTENANCE_SECRET", run: () => parseSecret("IAM_SUBSCRIPTION_MAINTENANCE_SECRET", { required: true }) },
    { key: "IAM_SUBSCRIPTION_MAINTENANCE_SERVICE_ACCOUNT_ID", run: () => parseAccountId("IAM_SUBSCRIPTION_MAINTENANCE_SERVICE_ACCOUNT_ID", { required: true }) },
    { key: "SUBSCRIPTION_MAINTENANCE_WORKER_ENABLED", run: () => parseBooleanEnv("SUBSCRIPTION_MAINTENANCE_WORKER_ENABLED", { required: true, expected: true }) },
    { key: "RESEND_API_KEY", run: () => parseSecret("RESEND_API_KEY", { required: true, minLength: 10 }) },
    { key: "EMAIL_FROM", run: () => (envValue("EMAIL_FROM") ? { ok: true, present: true } : { ok: false, error: "missing" }) },
    { key: "EMAIL_REPLY_TO", run: () => (envValue("EMAIL_REPLY_TO") ? { ok: true, present: true } : { ok: false, error: "missing" }) },
    { key: "NEXT_PUBLIC_SITE_URL", run: () => (envValue("NEXT_PUBLIC_SITE_URL") ? { ok: true, present: true } : { ok: false, error: "missing" }) },
    { key: "IAM_WORKER_LEGACY_FALLBACK", run: () => parseBooleanEnv("IAM_WORKER_LEGACY_FALLBACK", { required: false }) },
  ];

  if (production && !envValue("PORT")) {
    checks.push({
      key: "PORT",
      run: () => ({ ok: false, error: "missing" }),
    });
  } else if (envValue("PORT")) {
    const port = Number(envValue("PORT"));
    checks.push({
      key: "PORT",
      run: () => (Number.isFinite(port) && port > 0 ? { ok: true, present: true, value: port } : { ok: false, error: "invalid" }),
    });
  }

  return collectValidation(checks);
}

function validateCronCallerEnvironment(options = {}) {
  const production = options.production ?? isProductionLike();
  const checks = [
    {
      key: "SUBSCRIPTION_MAINTENANCE_API_URL",
      run: () =>
        parseHttpsUrl("SUBSCRIPTION_MAINTENANCE_API_URL", {
          required: true,
          allowedHost: production ? PRODUCTION_API_HOST : null,
        }),
    },
    { key: "IAM_SUBSCRIPTION_MAINTENANCE_SECRET", run: () => parseSecret("IAM_SUBSCRIPTION_MAINTENANCE_SECRET", { required: true }) },
    { key: "IAM_SUBSCRIPTION_MAINTENANCE_SERVICE_ACCOUNT_ID", run: () => parseAccountId("IAM_SUBSCRIPTION_MAINTENANCE_SERVICE_ACCOUNT_ID", { required: true }) },
    { key: "SUBSCRIPTION_MAINTENANCE_DRY_RUN", run: () => parseBooleanEnv("SUBSCRIPTION_MAINTENANCE_DRY_RUN", { required: true }) },
    {
      key: "SUBSCRIPTION_MAINTENANCE_TIMEOUT_MS",
      run: () => {
        if (envValue("SUBSCRIPTION_MAINTENANCE_TIMEOUT_MS")) {
          return parseTimeoutMs("SUBSCRIPTION_MAINTENANCE_TIMEOUT_MS");
        }
        if (envValue("SUBSCRIPTION_MAINTENANCE_CALL_TIMEOUT_MS")) {
          return parseTimeoutMs("SUBSCRIPTION_MAINTENANCE_CALL_TIMEOUT_MS");
        }
        return { ok: true, present: false, value: 90_000 };
      },
    },
  ];

  return collectValidation(checks);
}

function assertApiEnvironmentOrThrow(options = {}) {
  const result = validateApiEnvironment(options);
  if (!result.ok) {
    const detail = [...result.missingRequired, ...result.invalidRequired.map((row) => row.key)].join(", ");
    throw new Error(`Subscription maintenance API environment invalid: ${detail}`);
  }
  return result;
}

function assertCronCallerEnvironmentOrThrow(options = {}) {
  const result = validateCronCallerEnvironment(options);
  if (!result.ok) {
    const detail = [...result.missingRequired, ...result.invalidRequired.map((row) => row.key)].join(", ");
    throw new Error(`Subscription maintenance cron caller environment invalid: ${detail}`);
  }
  return result;
}

function hashMaintenanceSecret(secret, accountId = MAINTENANCE_ACCOUNT_ID) {
  const pepper = envValue("IAM_SERVICE_SECRET_PEPPER");
  if (!pepper || !secret) return null;
  return crypto.createHmac("sha256", pepper).update(`${accountId}:`).update(secret).digest("hex");
}

function getResolvedApiUrl() {
  return envValue("NEXT_PUBLIC_SUPABASE_URL") || envValue("SUPABASE_URL");
}

function getCronApiUrl() {
  return envValue("SUBSCRIPTION_MAINTENANCE_API_URL").replace(/\/+$/, "");
}

function getMaintenanceAccountId() {
  return envValue("IAM_SUBSCRIPTION_MAINTENANCE_SERVICE_ACCOUNT_ID") || MAINTENANCE_ACCOUNT_ID;
}

function isDryRunEnabled() {
  return parseBooleanEnv("SUBSCRIPTION_MAINTENANCE_DRY_RUN").value === true;
}

function getCallerTimeoutMs() {
  const parsed =
    parseTimeoutMs("SUBSCRIPTION_MAINTENANCE_TIMEOUT_MS").value ??
    parseTimeoutMs("SUBSCRIPTION_MAINTENANCE_CALL_TIMEOUT_MS").value ??
    90_000;
  return parsed;
}

module.exports = {
  PRODUCTION_API_HOST,
  MAINTENANCE_ACCOUNT_ID,
  validateApiEnvironment,
  validateCronCallerEnvironment,
  assertApiEnvironmentOrThrow,
  assertCronCallerEnvironmentOrThrow,
  hashMaintenanceSecret,
  getResolvedApiUrl,
  getCronApiUrl,
  getMaintenanceAccountId,
  isDryRunEnabled,
  getCallerTimeoutMs,
  isProductionLike,
  envValue,
};
