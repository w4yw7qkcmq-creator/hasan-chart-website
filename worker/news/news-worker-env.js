const WEAK_SECRETS = new Set(["changeme", "placeholder", "test", "secret", "guest:guest"]);

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

function parseTelegramChannelId(key, { required = false } = {}) {
  const raw = envValue(key);
  if (!raw) {
    if (required) return { ok: false, error: "missing" };
    return { ok: true, present: false };
  }
  if (!/^-?\d+$/.test(raw) && !/^@[A-Za-z0-9_]{3,}$/.test(raw)) {
    return { ok: false, error: "invalid_channel_id" };
  }
  return { ok: true, present: true };
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

function validateNewsWorkerEnvironment(options = {}) {
  const production = options.production ?? isProductionLike();
  const supabaseUrl = resolveSupabaseUrlFromEnv();

  const checks = [
    {
      key: "SUPABASE_URL",
      run: () => {
        if (!supabaseUrl) return { ok: false, error: "missing" };
        try {
          const parsed = new URL(supabaseUrl);
          if (production && parsed.protocol !== "https:") return { ok: false, error: "https_required" };
          return { ok: true, present: true, host: parsed.host };
        } catch {
          return { ok: false, error: "invalid_url" };
        }
      },
    },
    { key: "SUPABASE_SERVICE_ROLE_KEY", run: () => parseSecret("SUPABASE_SERVICE_ROLE_KEY", { required: true, minLength: 20 }) },
    { key: "TELEGRAM_BOT_TOKEN", run: () => parseSecret("TELEGRAM_BOT_TOKEN", { required: true, minLength: 20 }) },
    { key: "TELEGRAM_CHANNEL_ID", run: () => parseTelegramChannelId("TELEGRAM_CHANNEL_ID", { required: true }) },
    { key: "OPENAI_API_KEY", run: () => parseSecret("OPENAI_API_KEY", { required: true, minLength: 20 }) },
    { key: "NEWS_WORKER_ENABLED", run: () => parseBooleanEnv("NEWS_WORKER_ENABLED", { required: false }) },
    { key: "TELEGRAM_NEWS_PUBLISH_ENABLED", run: () => parseBooleanEnv("TELEGRAM_NEWS_PUBLISH_ENABLED", { required: false }) },
    { key: "NEWS_DRY_RUN", run: () => parseBooleanEnv("NEWS_DRY_RUN", { required: false }) },
    {
      key: "NEWS_POLL_INTERVAL_MS",
      run: () => parseBoundedInt("NEWS_POLL_INTERVAL_MS", { defaultValue: 60_000, min: 15_000, max: 300_000 }),
    },
    {
      key: "NEWS_MAX_POSTS_PER_HOUR",
      run: () => parseBoundedInt("NEWS_MAX_POSTS_PER_HOUR", { defaultValue: 5, min: 1, max: 20 }),
    },
  ];

  if (production && !envValue("PORT")) {
    checks.push({ key: "PORT", run: () => ({ ok: false, error: "missing" }) });
  } else if (envValue("PORT")) {
    const port = Number(envValue("PORT"));
    checks.push({
      key: "PORT",
      run: () => (Number.isFinite(port) && port > 0 ? { ok: true, present: true } : { ok: false, error: "invalid" }),
    });
  }

  return collectValidation(checks);
}

function assertNewsWorkerEnvironmentOrThrow(options = {}) {
  const result = validateNewsWorkerEnvironment(options);
  if (!result.ok) {
    const detail = [...result.missingRequired, ...result.invalidRequired.map((row) => row.key)].join(", ");
    throw new Error(`News worker environment invalid: ${detail}`);
  }
  return result;
}

function isNewsWorkerEnabled() {
  return parseBooleanEnv("NEWS_WORKER_ENABLED").value !== false;
}

function isNewsDryRun() {
  return parseBooleanEnv("NEWS_DRY_RUN").value === true;
}

function getPollIntervalMs() {
  return parseBoundedInt("NEWS_POLL_INTERVAL_MS", { defaultValue: 60_000, min: 15_000, max: 300_000 }).value;
}

function classifyNewsWorkerVariable(key) {
  const required = new Set([
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHANNEL_ID",
    "OPENAI_API_KEY",
    "PORT",
  ]);
  const optional = new Set([
    "NEWS_WORKER_ENABLED",
    "TELEGRAM_NEWS_PUBLISH_ENABLED",
    "NEWS_DRY_RUN",
    "DISABLE_GENERAL_RSS",
    "NEWS_POLL_INTERVAL_MS",
    "NEWS_MAX_POSTS_PER_HOUR",
    "NEWS_PREMIUM_IMAGES_ENABLED",
    "NEWS_IMAGE_PROVIDER",
    "NEWS_IMAGE_OPENAI_MODEL",
    "NEWS_IMAGE_OPENAI_SIZE",
    "NEWS_IMAGE_OPENAI_QUALITY",
    "TRADING_ECONOMICS_CLIENT",
    "TRADING_ECONOMICS_API_KEY",
    "TRADING_ECONOMICS_PUBLIC_CALENDAR_URL",
    "TELEGRAM_GENERAL_MERGE_WINDOW_MS",
    "TELEGRAM_ECONOMIC_MERGE_WINDOW_MS",
    "TELEGRAM_MERGE_BUFFER_MAX",
    "NEWS_WORKER_NO_BOOT",
  ]);
  const remove = new Set([
    "CRON_SECRET",
    "IAM_",
    "VAPID_",
    "RESEND_",
    "UPSTASH_",
    "FMP_API_KEY",
    "ACCOUNT_DATA_ENCRYPTION_KEY",
    "NIXPACKS_START_CMD",
    "SUBSCRIPTION_",
    "IAM_SUBSCRIPTION_",
  ]);

  if (required.has(key)) return "REQUIRED";
  if (optional.has(key)) return "OPTIONAL";
  if (key.startsWith("RAILWAY_")) return "KEEP";
  for (const prefix of remove) {
    if (key === prefix || key.startsWith(prefix)) return "REMOVE";
  }
  return "REVIEW";
}

module.exports = {
  validateNewsWorkerEnvironment,
  assertNewsWorkerEnvironmentOrThrow,
  isNewsWorkerEnabled,
  isNewsDryRun,
  getPollIntervalMs,
  resolveSupabaseUrlFromEnv,
  isProductionLike,
  classifyNewsWorkerVariable,
  envValue,
};
