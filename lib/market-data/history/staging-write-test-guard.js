import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  extractSupabaseProjectRef,
  maskProjectRef,
} from "../../staging-env-guard.js";

export const STAGING_WRITE_TEST_MARKER = "staging-test";

export const STAGING_WRITE_TEST_ENV = {
  allowFlag: "MARKET_HISTORY_TEST_ALLOW_STAGING",
  url: "STAGING_SUPABASE_URL",
  serviceKey: "STAGING_SUPABASE_SERVICE_ROLE_KEY",
};

/**
 * @param {string} url
 */
export function maskSupabaseHostname(url = "") {
  const ref = extractSupabaseProjectRef(url);
  if (!ref) return "invalid-host";
  return `${maskProjectRef(ref)}.supabase.co`;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function assertStagingWriteTestAllowed(env = process.env) {
  if (env[STAGING_WRITE_TEST_ENV.allowFlag] !== "true") {
    const error = new Error(
      `${STAGING_WRITE_TEST_ENV.allowFlag}=true is required to run the staging write test`,
    );
    error.code = "STAGING_WRITE_TEST_NOT_ALLOWED";
    throw error;
  }

  const url = String(env[STAGING_WRITE_TEST_ENV.url] ?? "").trim().replace(/\/+$/, "");
  const serviceKey = String(env[STAGING_WRITE_TEST_ENV.serviceKey] ?? "").trim();

  if (!url || !serviceKey) {
    const error = new Error(
      `${STAGING_WRITE_TEST_ENV.url} and ${STAGING_WRITE_TEST_ENV.serviceKey} are required`,
    );
    error.code = "STAGING_WRITE_TEST_MISSING_CONFIG";
    throw error;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    const error = new Error("STAGING_SUPABASE_URL must be a valid URL");
    error.code = "STAGING_WRITE_TEST_INVALID_URL";
    throw error;
  }

  if (parsed.protocol !== "https:") {
    const error = new Error("STAGING_SUPABASE_URL must use https");
    error.code = "STAGING_WRITE_TEST_INVALID_URL";
    throw error;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname.endsWith(".supabase.co")) {
    const error = new Error("STAGING_SUPABASE_URL must point to a Supabase host");
    error.code = "STAGING_WRITE_TEST_INVALID_HOST";
    throw error;
  }

  const projectRef = extractSupabaseProjectRef(url);
  if (!projectRef) {
    const error = new Error("STAGING_SUPABASE_URL must include a Supabase project ref");
    error.code = "STAGING_WRITE_TEST_INVALID_HOST";
    throw error;
  }

  if (
    projectRef === PRODUCTION_SUPABASE_PROJECT_REF ||
    hostname.includes(PRODUCTION_SUPABASE_PROJECT_REF)
  ) {
    const error = new Error(
      `Refusing to run against Production host (${maskProjectRef(projectRef)})`,
    );
    error.code = "STAGING_WRITE_TEST_PRODUCTION_HOST";
    throw error;
  }

  return {
    url,
    serviceKey,
    projectRef,
    maskedHostname: maskSupabaseHostname(url),
  };
}

/**
 * @param {string} exchange
 * @param {number} minuteOffset
 * @param {number} seq
 */
export function buildStagingTestTradeId(exchange, minuteOffset, seq) {
  return `${STAGING_WRITE_TEST_MARKER}-${exchange}-${minuteOffset}-${seq}`;
}
