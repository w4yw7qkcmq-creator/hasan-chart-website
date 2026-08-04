/**
 * IAM health signals for Operations platform (reads local artifacts / env only).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { getAllRoutePermissions } from "../../lib/iam/route-permissions.js";
import { getIamFeatureFlags, validateIamFlagCombination } from "../../lib/iam/feature-flags.js";
import { getAllAdminPagePermissions } from "../../lib/iam/page-permissions.js";

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function loadStagingIamFlags() {
  const stagingPath = resolve(process.cwd(), ".env.staging.local");
  const bootstrapPath = resolve(process.cwd(), ".env.staging.bootstrap.local");
  const staging = existsSync(stagingPath) ? parseEnvFile(stagingPath) : {};
  const bootstrap = existsSync(bootstrapPath) ? parseEnvFile(bootstrapPath) : {};
  const merged = { ...process.env, ...staging, ...bootstrap };
  const isStagingContext = Boolean(merged.STAGING_SUPABASE_URL || existsSync(stagingPath));

  const parseBool = (value, fallback = false) => {
    if (value === undefined || value === null || value === "") return fallback;
    return String(value).toLowerCase() === "true";
  };

  const flags = {
    IAM_DB: parseBool(merged.IAM_DB, isStagingContext),
    IAM_API: parseBool(merged.IAM_API, isStagingContext),
    IAM_UI: parseBool(merged.IAM_UI, isStagingContext),
    IAM_RLS: parseBool(merged.IAM_RLS, false),
  };

  return {
    flags,
    source: existsSync(stagingPath) ? ".env.staging.local" : "process.env",
    validation: validateIamFlagCombination(flags),
  };
}

export function collectIamOpsSignals() {
  const staging = loadStagingIamFlags();
  const routePermissions = getAllRoutePermissions();
  const pagePermissions = getAllAdminPagePermissions();
  const routeCount = Object.keys(routePermissions).length;
  const pageCount = Object.keys(pagePermissions).length;

  return {
    iam: {
      featureFlags: staging.flags,
      flagSource: staging.source,
      flagValidation: staging.validation,
      routePermissionCount: routeCount,
      pagePermissionCount: pageCount,
      bootstrapEnvConfigured: Boolean(
        process.env.IAM_BOOTSTRAP_SECRET?.trim() ||
          parseEnvFile(resolve(process.cwd(), ".env.staging.bootstrap.local")).IAM_BOOTSTRAP_SECRET
      ),
      phases: {
        db: staging.flags.IAM_DB,
        api: staging.flags.IAM_API,
        ui: staging.flags.IAM_UI,
        rls: staging.flags.IAM_RLS,
      },
      health: {
        routeMatrixComplete: routeCount >= 40,
        pageMatrixComplete: pageCount >= 10,
        dualReadActive: staging.flags.IAM_API && staging.flags.IAM_DB,
        uiReadiness: staging.flags.IAM_UI && staging.validation.ok,
        apiEnforcing: staging.flags.IAM_API,
        rlsPending: !staging.flags.IAM_RLS,
      },
    },
  };
}
