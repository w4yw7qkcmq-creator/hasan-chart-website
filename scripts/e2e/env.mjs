import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function resolveEnvironment(merged) {
  const explicit = String(merged.E2E_ENVIRONMENT || "").toLowerCase();
  if (explicit === "local" || explicit === "staging" || explicit === "production") {
    return explicit;
  }
  return "custom";
}

function resolveBaseUrl(merged, environment) {
  if (environment === "local") {
    return String(merged.LOCAL_URL || "http://localhost:3000").replace(/\/$/, "");
  }
  if (environment === "staging") {
    const url = merged.STAGING_URL || merged.E2E_BASE_URL;
    if (!url) {
      throw new Error("STAGING_URL or E2E_BASE_URL required for smoke:staging");
    }
    return String(url).replace(/\/$/, "");
  }
  if (environment === "production") {
    const url = merged.PROD_URL || merged.E2E_BASE_URL;
    if (!url) {
      throw new Error("PROD_URL or E2E_BASE_URL required for smoke:production");
    }
    return String(url).replace(/\/$/, "");
  }
  return String(merged.E2E_BASE_URL || merged.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );
}

/** Load .env.local then .env.e2e.local (e2e overrides). */
export function loadE2eEnv() {
  const merged = {
    ...parseEnvFile(path.join(ROOT, ".env.local")),
    ...parseEnvFile(path.join(ROOT, ".env.e2e.local")),
    ...process.env,
  };

  const environment = resolveEnvironment(merged);
  const baseUrl = resolveBaseUrl(merged, environment);

  return {
    root: ROOT,
    environment,
    baseUrl,
    userEmail: merged.E2E_USER_EMAIL?.trim() || "",
    userPass: merged.E2E_USER_PASS || "",
    adminEmail: merged.E2E_ADMIN_EMAIL?.trim() || "",
    adminPass: merged.E2E_ADMIN_PASS || "",
    supabaseUrl: merged.NEXT_PUBLIC_SUPABASE_URL || merged.SUPABASE_URL || "",
    supabaseAnonKey: merged.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    supabaseServiceKey: merged.SUPABASE_SERVICE_ROLE_KEY || "",
    instantAnalysisAllowPost: merged.E2E_INSTANT_ANALYSIS_ALLOW_POST === "1",
    hasUserCredentials: Boolean(merged.E2E_USER_EMAIL && merged.E2E_USER_PASS),
    hasAdminCredentials: Boolean(merged.E2E_ADMIN_EMAIL && merged.E2E_ADMIN_PASS),
    hasSupabaseAdmin: Boolean(
      (merged.NEXT_PUBLIC_SUPABASE_URL || merged.SUPABASE_URL) && merged.SUPABASE_SERVICE_ROLE_KEY
    ),
    stagingUrl: merged.STAGING_URL || "",
    prodUrl: merged.PROD_URL || "",
  };
}
