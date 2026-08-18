/**
 * Guard helpers for isolated Supabase validation (dedicated test project only).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  maskProjectRef,
  assertStagingSupabaseConfig,
} from "./staging-env-guard.js";

const HARNESS_SECRET_KEYS = [
  "SECURITY_SIGNAL_HMAC_SECRET",
  "STAGING_SECURITY_SIGNAL_HMAC_SECRET",
  "STAGING_IAM_TEST_PASSWORD",
  "STAGING_IAM_CRON_SECRET",
  "STAGING_IAM_NEWS_WORKER_SECRET",
  "STAGING_IAM_PRICE_ALERT_WORKER_SECRET",
  "STAGING_IAM_ANALYSIS_WORKER_SECRET",
  "STAGING_IAM_TELEGRAM_SECRET",
  "STAGING_IAM_INSTANT_ANALYSIS_WORKER_SECRET",
  "STAGING_IAM_TELEGRAM_BOT_SECRET",
  "STAGING_IAM_SERVICE_SECRET_PEPPER",
  "STAGING_IAM_SUBSCRIPTION_MAINTENANCE_SECRET",
  "IAM_OWNER_EMAIL",
  "STAGING_OWNER_PASSWORD",
];

function parseEnvFile(content = "") {
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    values[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return values;
}

export function isIsolatedValidationTarget() {
  return process.env.HV_VALIDATION_TARGET === "isolated";
}

export function loadIsolatedEnvFile(cwd = process.cwd()) {
  const filePath = resolve(cwd, ".env.isolated.local");
  if (!existsSync(filePath)) {
    const error = new Error("Missing .env.isolated.local");
    error.code = "ISOLATED_ENV_FILE_MISSING";
    throw error;
  }
  const parsed = parseEnvFile(readFileSync(filePath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] == null || process.env[key] === "") process.env[key] = value;
  }
  return assertIsolatedSupabaseConfig({
    projectRef: parsed.ISOLATED_SUPABASE_PROJECT_REF || process.env.ISOLATED_SUPABASE_PROJECT_REF,
    url: parsed.ISOLATED_SUPABASE_URL || process.env.ISOLATED_SUPABASE_URL,
  });
}

export function assertIsolatedSupabaseConfig(config = {}) {
  const projectRef = String(config.projectRef || process.env.ISOLATED_SUPABASE_PROJECT_REF || "").trim();
  const url = String(config.url || process.env.ISOLATED_SUPABASE_URL || "").trim();

  if (!projectRef) {
    const error = new Error("Missing ISOLATED_SUPABASE_PROJECT_REF");
    error.code = "ISOLATED_CONFIG_MISSING";
    throw error;
  }
  if (projectRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    const error = new Error(`Isolated ref matches Production (${maskProjectRef(projectRef)}). Aborting.`);
    error.code = "ISOLATED_MATCHES_PRODUCTION_REF";
    throw error;
  }
  if (projectRef === STAGING_SUPABASE_PROJECT_REF) {
    const error = new Error(`Isolated ref matches shared staging (${maskProjectRef(projectRef)}). Aborting.`);
    error.code = "ISOLATED_MATCHES_STAGING_REF";
    throw error;
  }

  return {
    projectRef,
    url: url || `https://${projectRef}.supabase.co`,
    maskedProjectRef: maskProjectRef(projectRef),
    productionNotLinked: projectRef !== PRODUCTION_SUPABASE_PROJECT_REF,
    notSharedStaging: projectRef !== STAGING_SUPABASE_PROJECT_REF,
  };
}

export function linkValidationProject(projectRef, cwd = process.cwd()) {
  const linkedRefPath = resolve(cwd, "supabase/.temp/project-ref");
  if (existsSync(linkedRefPath)) {
    const linkedRef = readFileSync(linkedRefPath, "utf8").trim();
    if (linkedRef === projectRef) {
      return { skipped: true, reason: "already_linked", projectRef: linkedRef };
    }
  }
  const args = ["supabase", "link", "--project-ref", projectRef];
  const password = process.env.ISOLATED_SUPABASE_DB_PASSWORD;
  if (password) args.push("--password", password);
  args.push("--yes");
  const result = spawnSync("npx", args, { cwd, stdio: "pipe", encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Failed to link validation project: ${(result.stderr || result.stdout || "").slice(0, 400)}`);
  }
  return { skipped: false, projectRef };
}

export function mergeStagingHarnessSecrets(cwd = process.cwd()) {
  const stagingPath = resolve(cwd, ".env.staging.local");
  if (!existsSync(stagingPath)) return;
  const parsed = parseEnvFile(readFileSync(stagingPath, "utf8"));
  for (const key of HARNESS_SECRET_KEYS) {
    if (parsed[key] && (process.env[key] == null || process.env[key] === "")) {
      process.env[key] = parsed[key];
    }
  }
}

export function loadIsolatedHarnessEnv(cwd = process.cwd()) {
  const isolated = loadIsolatedEnvFile(cwd);
  process.env.STAGING_SUPABASE_PROJECT_REF = isolated.projectRef;
  process.env.STAGING_SUPABASE_URL = isolated.url;
  process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY = process.env.ISOLATED_SUPABASE_SERVICE_ROLE_KEY;
  process.env.STAGING_SUPABASE_ANON_KEY = process.env.ISOLATED_SUPABASE_ANON_KEY;
  process.env.HV_ISOLATED_VALIDATION = "1";
  mergeStagingHarnessSecrets(cwd);
  linkValidationProject(isolated.projectRef, cwd);
  return {
    ...isolated,
    isolatedTargetConfirmed: true,
    sharedStagingNotTargetedForWrites: true,
  };
}

/** Override dev-server Supabase env so isolated JWTs verify against isolated project (not .env.staging.local). */
export function applyIsolatedDevServerSupabaseEnv(env = {}) {
  if (!isIsolatedValidationTarget()) return { ...env };
  const url = process.env.STAGING_SUPABASE_URL || process.env.ISOLATED_SUPABASE_URL;
  const anon = process.env.STAGING_SUPABASE_ANON_KEY || process.env.ISOLATED_SUPABASE_ANON_KEY;
  const service = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || process.env.ISOLATED_SUPABASE_SERVICE_ROLE_KEY;
  const ref = process.env.STAGING_SUPABASE_PROJECT_REF || process.env.ISOLATED_SUPABASE_PROJECT_REF;
  const merged = { ...env };
  if (url) {
    merged.NEXT_PUBLIC_SUPABASE_URL = url;
    merged.STAGING_SUPABASE_URL = url;
  }
  if (anon) {
    merged.NEXT_PUBLIC_SUPABASE_ANON_KEY = anon;
    merged.STAGING_SUPABASE_ANON_KEY = anon;
  }
  if (service) {
    merged.SUPABASE_SERVICE_ROLE_KEY = service;
    merged.STAGING_SUPABASE_SERVICE_ROLE_KEY = service;
  }
  if (ref) merged.STAGING_SUPABASE_PROJECT_REF = ref;
  return merged;
}

export function decodeJwtMeta(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    );
    return {
      iss: payload.iss || null,
      aud: payload.aud || null,
      sub: payload.sub || null,
      ref: String(payload.iss || "").match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || null,
    };
  } catch {
    return null;
  }
}

export function getValidationRestoreProjectRef() {
  return isIsolatedValidationTarget()
    ? process.env.ISOLATED_SUPABASE_PROJECT_REF
    : STAGING_SUPABASE_PROJECT_REF;
}

export function resolveValidationSupabaseTarget(mode = process.env.HV_VALIDATION_TARGET) {
  if (mode === "isolated") return loadIsolatedHarnessEnv();
  return assertStagingSupabaseConfig({
    projectRef: process.env.STAGING_SUPABASE_PROJECT_REF,
    url: process.env.STAGING_SUPABASE_URL,
  });
}
