const WEAK_SECRETS = new Set(["changeme", "placeholder", "test", "secret", "guest:guest"]);
const DEFAULT_SERVICE_ACCOUNT_ID = "instant-analysis-worker";
const DEFAULT_MAX_CONCURRENCY = 3;
const DEFAULT_JOB_TIMEOUT_MS = 120_000;

function envValue(key) {
  return String(process.env[key] ?? "").trim();
}

function isProductionLike() {
  const nodeEnv = envValue("NODE_ENV").toLowerCase();
  const railwayEnv = envValue("RAILWAY_ENVIRONMENT").toLowerCase();
  return nodeEnv === "production" || railwayEnv === "production";
}

function parseBooleanEnv(key, { defaultValue = true } = {}) {
  const raw = envValue(key);
  if (!raw) return { ok: true, value: defaultValue, present: false };
  const normalized = raw.toLowerCase();
  if (!["true", "false", "1", "0", "yes", "no"].includes(normalized)) {
    return { ok: false, error: "invalid_boolean" };
  }
  return {
    ok: true,
    value: normalized === "true" || normalized === "1" || normalized === "yes",
    present: true,
  };
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

function parseBoundedInt(key, { defaultValue, min, max }) {
  const raw = envValue(key);
  if (!raw) return { ok: true, present: false, value: defaultValue };
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    return { ok: false, error: "out_of_bounds" };
  }
  return { ok: true, present: true, value };
}

function resolveSupabaseUrlFromEnv() {
  return envValue("SUPABASE_URL") || envValue("NEXT_PUBLIC_SUPABASE_URL");
}

function isAiWorkerPrimaryMode() {
  const explicit = parseBooleanEnv("AI_WORKER_ENABLED", { defaultValue: false });
  if (explicit.present) return explicit.value;
  const priceAlerts = parseBooleanEnv("PRICE_ALERT_WORKER_ENABLED", { defaultValue: true });
  return priceAlerts.present && priceAlerts.value === false;
}

const VARIABLE_CLASSIFICATION = Object.freeze({
  AI_WORKER_ENABLED: "OPTIONAL",
  PRICE_ALERT_WORKER_ENABLED: "OPTIONAL",
  NEXT_PUBLIC_SUPABASE_URL: "REQUIRED",
  SUPABASE_URL: "OPTIONAL",
  SUPABASE_SERVICE_ROLE_KEY: "REQUIRED",
  OPENAI_API_KEY: "REQUIRED",
  IAM_WORKER_AUTH: "OPTIONAL",
  IAM_WORKER_LEGACY_FALLBACK: "OPTIONAL",
  IAM_SERVICE_SECRET_PEPPER: "REQUIRED",
  IAM_INSTANT_ANALYSIS_WORKER_SERVICE_ACCOUNT_ID: "OPTIONAL",
  PORT: "OPTIONAL",
  NODE_ENV: "OPTIONAL",
  RAILWAY_ENVIRONMENT: "OPTIONAL",
  RAILWAY_GIT_COMMIT_SHA: "OPTIONAL",
  RAILWAY_DEPLOYMENT_ID: "OPTIONAL",
  AI_WORKER_MAX_CONCURRENCY: "OPTIONAL",
  AI_WORKER_JOB_TIMEOUT_MS: "OPTIONAL",
  WORKER_API_SECRET: "ROLLBACK-ONLY",
  CRON_SECRET: "ROLLBACK-ONLY",
  RESEND_API_KEY: "REMOVE",
  VAPID_PUBLIC_KEY: "REMOVE",
  VAPID_PRIVATE_KEY: "REMOVE",
  VAPID_SUBJECT: "REMOVE",
  EMAIL_FROM: "REMOVE",
  TELEGRAM_BOT_TOKEN: "REMOVE",
});

function classifyAiWorkerVariable(key) {
  return VARIABLE_CLASSIFICATION[key] || "UNKNOWN";
}

function validateAiWorkerEnvironment(options = {}) {
  const production = options.production ?? isProductionLike();
  const missing = [];
  const invalid = [];

  const supabaseUrl = resolveSupabaseUrlFromEnv();
  if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  else {
    try {
      const parsed = new URL(supabaseUrl);
      if (production && parsed.protocol !== "https:") {
        invalid.push({ key: "NEXT_PUBLIC_SUPABASE_URL", reason: "https_required" });
      }
    } catch {
      invalid.push({ key: "NEXT_PUBLIC_SUPABASE_URL", reason: "invalid_url" });
    }
  }

  const serviceKey = parseSecret("SUPABASE_SERVICE_ROLE_KEY", { minLength: 20, required: true });
  if (!serviceKey.ok) {
    if (serviceKey.error === "missing") missing.push("SUPABASE_SERVICE_ROLE_KEY");
    else invalid.push({ key: "SUPABASE_SERVICE_ROLE_KEY", reason: serviceKey.error });
  }

  const openai = parseSecret("OPENAI_API_KEY", { minLength: 20, required: true });
  if (!openai.ok) {
    if (openai.error === "missing") missing.push("OPENAI_API_KEY");
    else invalid.push({ key: "OPENAI_API_KEY", reason: openai.error });
  }

  const pepper = parseSecret("IAM_SERVICE_SECRET_PEPPER", { minLength: 32, required: true });
  if (!pepper.ok) {
    if (pepper.error === "missing") missing.push("IAM_SERVICE_SECRET_PEPPER");
    else invalid.push({ key: "IAM_SERVICE_SECRET_PEPPER", reason: pepper.error });
  }

  const accountId = envValue("IAM_INSTANT_ANALYSIS_WORKER_SERVICE_ACCOUNT_ID") || DEFAULT_SERVICE_ACCOUNT_ID;
  if (accountId !== DEFAULT_SERVICE_ACCOUNT_ID) {
    invalid.push({
      key: "IAM_INSTANT_ANALYSIS_WORKER_SERVICE_ACCOUNT_ID",
      reason: "unexpected_account_id",
    });
  }

  const maxConcurrency = parseBoundedInt("AI_WORKER_MAX_CONCURRENCY", {
    defaultValue: DEFAULT_MAX_CONCURRENCY,
    min: 1,
    max: 10,
  });
  if (!maxConcurrency.ok) {
    invalid.push({ key: "AI_WORKER_MAX_CONCURRENCY", reason: maxConcurrency.error });
  }

  const jobTimeout = parseBoundedInt("AI_WORKER_JOB_TIMEOUT_MS", {
    defaultValue: DEFAULT_JOB_TIMEOUT_MS,
    min: 10_000,
    max: 300_000,
  });
  if (!jobTimeout.ok) {
    invalid.push({ key: "AI_WORKER_JOB_TIMEOUT_MS", reason: jobTimeout.error });
  }

  const workerAuth = parseBooleanEnv("IAM_WORKER_AUTH", { defaultValue: true });
  const legacyFallback = parseBooleanEnv("IAM_WORKER_LEGACY_FALLBACK", { defaultValue: true });

  return {
    ok: missing.length === 0 && invalid.length === 0,
    missingRequired: missing,
    invalidRequired: invalid,
    missingRequiredCount: missing.length,
    invalidRequiredCount: invalid.length,
    production,
    machineAuth: {
      enabled: workerAuth.value !== false,
      legacyFallbackEnabled: legacyFallback.value !== false,
      serviceAccountId: DEFAULT_SERVICE_ACCOUNT_ID,
    },
    runtime: {
      maxConcurrency: maxConcurrency.value || DEFAULT_MAX_CONCURRENCY,
      jobTimeoutMs: jobTimeout.value || DEFAULT_JOB_TIMEOUT_MS,
    },
    dependencies: {
      database: Boolean(supabaseUrl && serviceKey.ok),
      aiConfigured: Boolean(openai.ok),
      marketDataConfigured: true,
      jobStoreConfigured: Boolean(supabaseUrl && serviceKey.ok),
      machineAuthConfigured: Boolean(pepper.ok),
    },
  };
}

function listKnownVariables() {
  return Object.entries(VARIABLE_CLASSIFICATION).map(([variable, decision]) => ({
    variable,
    decision,
  }));
}

module.exports = {
  DEFAULT_SERVICE_ACCOUNT_ID,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_JOB_TIMEOUT_MS,
  isAiWorkerPrimaryMode,
  validateAiWorkerEnvironment,
  classifyAiWorkerVariable,
  listKnownVariables,
  isProductionLike,
};
