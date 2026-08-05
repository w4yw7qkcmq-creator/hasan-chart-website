const WEAK_SECRETS = new Set(["changeme", "placeholder", "test", "secret", "guest:guest"]);

const MIN_CHECK_INTERVAL_MS = 30_000;
const MAX_CHECK_INTERVAL_MS = 60_000;
const DEFAULT_CHECK_INTERVAL_MS = 30_000;
const DEFAULT_MAX_ALERTS_PER_RUN = 20;

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
    return { ok: true, value: true, present: false };
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

function parseSecret(key, { minLength = 10, required = false } = {}) {
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

function parseHttpsUrl(key, { required = false } = {}) {
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
  return { ok: true, present: true, value: raw.replace(/\/+$/, ""), host: parsed.host };
}

function parseBoundedInt(key, { defaultValue, min, max, required = false } = {}) {
  const raw = envValue(key);
  if (!raw) {
    if (required) return { ok: false, error: "missing" };
    return { ok: true, present: false, value: defaultValue };
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    return { ok: false, error: "out_of_bounds" };
  }
  return { ok: true, present: true, value };
}

function resolveSupabaseUrlFromEnv() {
  return envValue("SUPABASE_URL") || envValue("NEXT_PUBLIC_SUPABASE_URL");
}

function resolveCheckIntervalMs() {
  const raw = envValue("PRICE_ALERT_CHECK_INTERVAL_MS");
  let intervalMs = raw ? Number(raw) : DEFAULT_CHECK_INTERVAL_MS;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    intervalMs = DEFAULT_CHECK_INTERVAL_MS;
  }
  if (intervalMs > MAX_CHECK_INTERVAL_MS) {
    intervalMs = DEFAULT_CHECK_INTERVAL_MS;
  }
  return Math.max(intervalMs, MIN_CHECK_INTERVAL_MS);
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
      ...(typeof result.value === "boolean" ? { value: result.value } : {}),
      ...(typeof result.value === "number" ? { value: result.value } : {}),
      ...(typeof result.length === "number" ? { length: result.length } : {}),
      ...(result.host ? { host: result.host } : {}),
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

const VARIABLE_CLASSIFICATION = Object.freeze({
  NEXT_PUBLIC_SUPABASE_URL: "REQUIRED",
  SUPABASE_URL: "OPTIONAL",
  SUPABASE_SERVICE_ROLE_KEY: "REQUIRED",
  RESEND_API_KEY: "OPTIONAL",
  VAPID_PUBLIC_KEY: "OPTIONAL",
  VAPID_PRIVATE_KEY: "OPTIONAL",
  VAPID_SUBJECT: "OPTIONAL",
  NEXT_PUBLIC_SITE_URL: "OPTIONAL",
  PRICE_ALERT_WORKER_ENABLED: "OPTIONAL",
  PRICE_ALERT_CHECK_INTERVAL_MS: "OPTIONAL",
  PRICE_ALERT_MAX_ALERTS_PER_RUN: "OPTIONAL",
  OPENAI_API_KEY: "OPTIONAL",
  NODE_ENV: "OPTIONAL",
  RAILWAY_ENVIRONMENT: "OPTIONAL",
  RAILWAY_GIT_COMMIT_SHA: "OPTIONAL",
  RAILWAY_REPLICA_ID: "OPTIONAL",
  RAILWAY_DEPLOYMENT_ID: "OPTIONAL",
  HOSTNAME: "OPTIONAL",
  PORT: "OPTIONAL",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "OPTIONAL",
  VAPID_PUBLIC_KEY: "OPTIONAL",
  WORKER_HTTP_AUTH_SECRET: "OPTIONAL",
  IAM_API: "OPTIONAL",
  TELEGRAM_BOT_TOKEN: "REMOVE",
  NEWS_WORKER_ENABLED: "REMOVE",
  CRON_SECRET: "REMOVE",
});

function classifyPriceAlertVariable(key) {
  return VARIABLE_CLASSIFICATION[key] || "UNKNOWN";
}

function validatePriceAlertsEnvironment(options = {}) {
  const production = options.production ?? isProductionLike();
  const checks = [
    {
      key: "NEXT_PUBLIC_SUPABASE_URL",
      run: () => {
        const url = resolveSupabaseUrlFromEnv();
        if (!url) return { ok: false, error: "missing" };
        try {
          const parsed = new URL(url);
          if (production && parsed.protocol !== "https:") {
            return { ok: false, error: "https_required" };
          }
        } catch {
          return { ok: false, error: "invalid_url" };
        }
        return { ok: true, present: true };
      },
    },
    {
      key: "SUPABASE_SERVICE_ROLE_KEY",
      run: () => parseSecret("SUPABASE_SERVICE_ROLE_KEY", { minLength: 20, required: true }),
    },
    {
      key: "PRICE_ALERT_WORKER_ENABLED",
      run: () => parseBooleanEnv("PRICE_ALERT_WORKER_ENABLED", { required: false }),
    },
    {
      key: "PRICE_ALERT_CHECK_INTERVAL_MS",
      run: () => {
        const intervalMs = resolveCheckIntervalMs();
        if (production && intervalMs !== DEFAULT_CHECK_INTERVAL_MS) {
          return { ok: false, error: "production_interval_locked" };
        }
        return { ok: true, present: Boolean(envValue("PRICE_ALERT_CHECK_INTERVAL_MS")), value: intervalMs };
      },
    },
    {
      key: "PRICE_ALERT_MAX_ALERTS_PER_RUN",
      run: () =>
        parseBoundedInt("PRICE_ALERT_MAX_ALERTS_PER_RUN", {
          defaultValue: DEFAULT_MAX_ALERTS_PER_RUN,
          min: 1,
          max: 100,
        }),
    },
    {
      key: "NEXT_PUBLIC_SITE_URL",
      run: () => parseHttpsUrl("NEXT_PUBLIC_SITE_URL", { required: false }),
    },
  ];

  const result = collectValidation(checks);
  const vapidPublic = envValue("VAPID_PUBLIC_KEY");
  const vapidPrivate = envValue("VAPID_PRIVATE_KEY");
  const vapidSubject = envValue("VAPID_SUBJECT");
  const vapidParts = [vapidPublic, vapidPrivate, vapidSubject].filter(Boolean);
  if (vapidParts.length > 0 && vapidParts.length < 3) {
    result.ok = false;
    result.invalidRequired.push({ key: "VAPID_*", reason: "incomplete_vapid_config" });
    result.invalidRequiredCount += 1;
  }

  const resendKey = envValue("RESEND_API_KEY");
  if (resendKey && resendKey.length < 10) {
    result.ok = false;
    result.invalidRequired.push({ key: "RESEND_API_KEY", reason: "weak_or_short" });
    result.invalidRequiredCount += 1;
  }

  return {
    ...result,
    checkIntervalMs: resolveCheckIntervalMs(),
    maxAlertsPerRun:
      parseBoundedInt("PRICE_ALERT_MAX_ALERTS_PER_RUN", {
        defaultValue: DEFAULT_MAX_ALERTS_PER_RUN,
        min: 1,
        max: 100,
      }).value || DEFAULT_MAX_ALERTS_PER_RUN,
    production,
    dependencies: {
      database: result.missingRequired.includes("SUPABASE_SERVICE_ROLE_KEY") ? false : true,
      priceProviderConfigured: true,
      emailConfigured: Boolean(resendKey),
      pushConfigured: vapidParts.length === 3,
      siteNotificationsConfigured: true,
    },
  };
}

function isPriceAlertWorkerEnabled() {
  const parsed = parseBooleanEnv("PRICE_ALERT_WORKER_ENABLED", { required: false });
  return parsed.value !== false;
}

function listKnownVariables() {
  return Object.entries(VARIABLE_CLASSIFICATION).map(([variable, decision]) => ({
    variable,
    decision,
  }));
}

function assertNoUnknownVariables(extraKeys = []) {
  const unknown = extraKeys.filter((key) => classifyPriceAlertVariable(key) === "UNKNOWN");
  return { ok: unknown.length === 0, unknown };
}

module.exports = {
  MIN_CHECK_INTERVAL_MS,
  DEFAULT_CHECK_INTERVAL_MS,
  DEFAULT_MAX_ALERTS_PER_RUN,
  validatePriceAlertsEnvironment,
  isPriceAlertWorkerEnabled,
  classifyPriceAlertVariable,
  listKnownVariables,
  assertNoUnknownVariables,
  resolveCheckIntervalMs,
  isProductionLike,
};
