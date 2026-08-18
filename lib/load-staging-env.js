import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { assertStagingSupabaseConfig } from "./staging-env-guard.js";
import { isIsolatedValidationTarget, loadIsolatedHarnessEnv } from "./isolated-env-guard.js";

function parseEnvFile(content = "") {
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function loadStagingEnvFile(cwd = process.cwd()) {
  if (isIsolatedValidationTarget()) {
    return loadIsolatedHarnessEnv(cwd);
  }
  const filePath = resolve(cwd, ".env.staging.local");
  if (!existsSync(filePath)) {
    const error = new Error("Missing .env.staging.local");
    error.code = "STAGING_ENV_FILE_MISSING";
    throw error;
  }
  const parsed = parseEnvFile(readFileSync(filePath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = value;
    }
  }
  return assertStagingSupabaseConfig({
    projectRef: parsed.STAGING_SUPABASE_PROJECT_REF || process.env.STAGING_SUPABASE_PROJECT_REF,
    url: parsed.STAGING_SUPABASE_URL || process.env.STAGING_SUPABASE_URL,
  });
}

export function getStagingSupabaseClientOptions() {
  loadStagingEnvFile();
  return {
    url: process.env.STAGING_SUPABASE_URL,
    serviceRoleKey: process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
    anonKey: process.env.STAGING_SUPABASE_ANON_KEY,
    projectRef: process.env.STAGING_SUPABASE_PROJECT_REF,
  };
}
