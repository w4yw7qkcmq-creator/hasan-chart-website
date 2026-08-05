#!/usr/bin/env node
/**
 * Production environment audit — subscription maintenance API + cron caller.
 * Never prints secret values or hashes.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  maskProjectRef,
  extractSupabaseProjectRef,
  assertProductionSupabaseConfig,
} from "../../lib/production-env-guard.js";
import { verifyServiceSecret } from "../../lib/iam/service-accounts.js";

const {
  validateApiEnvironment,
  validateCronCallerEnvironment,
  hashMaintenanceSecret,
  PRODUCTION_API_HOST,
  MAINTENANCE_ACCOUNT_ID,
} = require("../../worker/lib/subscription-maintenance-env.js");

const ROOT = process.cwd();
const ARTIFACT_DIR = join(ROOT, "scripts/iam/.artifacts");
const API_SERVICE = process.env.SUBSCRIPTION_MAINTENANCE_API_RAILWAY_SERVICE || "cf9d57e0-75fd-4449-8c9d-f6342072ee67";
const CRON_SERVICE = process.env.SUBSCRIPTION_CRON_RAILWAY_SERVICE || "8cee4fea-22da-4e40-ab29-7c8dd02eb8bd";

const EXPECTED_PERMISSIONS = [
  "system.cron.read",
  "subscriptions.read",
  "subscriptions.manage",
];

const API_ONLY = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "IAM_SERVICE_SECRET_PEPPER",
  "IAM_WORKER_AUTH",
  "IAM_WORKER_LEGACY_FALLBACK",
  "SUBSCRIPTION_MAINTENANCE_WORKER_ENABLED",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "EMAIL_REPLY_TO",
  "NEXT_PUBLIC_SITE_URL",
  "PORT",
]);

const CRON_ONLY = new Set([
  "SUBSCRIPTION_MAINTENANCE_API_URL",
  "SUBSCRIPTION_MAINTENANCE_DRY_RUN",
  "SUBSCRIPTION_MAINTENANCE_TIMEOUT_MS",
  "SUBSCRIPTION_MAINTENANCE_CALL_TIMEOUT_MS",
]);

const ROLLBACK_ONLY = new Set(["CRON_SECRET", "ADMIN_CRON_SECRET"]);

const UNUSED_CANDIDATES = [
  "OPENAI_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHANNEL_ID",
  "FMP_API_KEY",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "ACCOUNT_DATA_ENCRYPTION_KEY",
  "RESEND_WEBHOOK_SECRET",
  "NIXPACKS_START_CMD",
  "SUBSCRIPTION_WORKER_ONESHOT",
  "WORKER_API_SECRET",
];

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

function railwayVars(serviceName) {
  const r = spawnSync("npx", ["@railway/cli", "variables", "--json", "--service", serviceName], {
    encoding: "utf8",
  });
  if (r.status !== 0) return null;
  return JSON.parse(r.stdout);
}

function classifyVariable(key, service) {
  if (ROLLBACK_ONLY.has(key)) return "ROLLBACK-ONLY";
  if (service === "api" && CRON_ONLY.has(key)) return "REMOVE FROM API";
  if (service === "cron" && API_ONLY.has(key)) return "REMOVE FROM CRON";
  if (UNUSED_CANDIDATES.includes(key)) return service === "cron" ? "REMOVE FROM CRON" : "REMOVE FROM API";
  if (key === "IAM_SUBSCRIPTION_MAINTENANCE_SECRET" || key === "IAM_SUBSCRIPTION_MAINTENANCE_SERVICE_ACCOUNT_ID") {
    return "KEEP";
  }
  if (API_ONLY.has(key)) return service === "api" ? "KEEP" : "REMOVE FROM CRON";
  if (CRON_ONLY.has(key)) return service === "cron" ? "KEEP" : "REMOVE FROM API";
  if (key.startsWith("RAILWAY_")) return "KEEP";
  return "REVIEW";
}

function auditServiceVars(vars, service) {
  const rows = [];
  for (const key of Object.keys(vars || {}).sort()) {
    const value = String(vars[key] ?? "").trim();
    rows.push({
      variable: key,
      present: true,
      nonEmpty: value.length > 0,
      apiNeeded: service === "api" ? API_ONLY.has(key) || key.startsWith("IAM_") || key.startsWith("SUBSCRIPTION_") : CRON_ONLY.has(key) || key.startsWith("IAM_SUBSCRIPTION"),
      cronNeeded: service === "cron" ? CRON_ONLY.has(key) || key.startsWith("IAM_SUBSCRIPTION") : false,
      decision: classifyVariable(key, service),
    });
  }
  return rows;
}

async function main() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const local = parseEnvFile(resolve(ROOT, ".env.local"));
  const workerAuth = parseEnvFile(resolve(ROOT, ".env.production.worker-auth.local"));

  assertProductionSupabaseConfig({
    projectRef: extractSupabaseProjectRef(local.NEXT_PUBLIC_SUPABASE_URL || ""),
    url: local.NEXT_PUBLIC_SUPABASE_URL,
  });

  const apiVars = railwayVars(API_SERVICE);
  const cronVars = railwayVars(CRON_SERVICE);

  const apiSecret = apiVars?.IAM_SUBSCRIPTION_MAINTENANCE_SECRET || workerAuth.IAM_SUBSCRIPTION_MAINTENANCE_SECRET || "";
  const cronSecret = cronVars?.IAM_SUBSCRIPTION_MAINTENANCE_SECRET || "";
  const pepper = apiVars?.IAM_SERVICE_SECRET_PEPPER || workerAuth.IAM_SERVICE_SECRET_PEPPER || "";

  process.env.IAM_SERVICE_SECRET_PEPPER = pepper;

  const sb = createClient(local.NEXT_PUBLIC_SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: account } = await sb
    .from("iam_service_accounts")
    .select("id, enabled, secret_hash, revoked_at")
    .eq("id", MAINTENANCE_ACCOUNT_ID)
    .maybeSingle();

  const { data: perms } = await sb
    .from("iam_service_account_permissions")
    .select("permission_id")
    .eq("service_account_id", MAINTENANCE_ACCOUNT_ID);

  const apiEnvProbe = {
    NODE_ENV: "production",
    RAILWAY_ENVIRONMENT: "production",
    PORT: String(apiVars?.PORT || "8080"),
    ...(apiVars || {}),
  };
  const cronEnvProbe = {
    NODE_ENV: "production",
    RAILWAY_ENVIRONMENT: "production",
    ...(cronVars || {}),
  };

  const prevEnv = { ...process.env };
  Object.assign(process.env, apiEnvProbe);
  const apiContract = validateApiEnvironment({ production: true });
  Object.assign(process.env, cronEnvProbe);
  const cronContract = validateCronCallerEnvironment({ production: true });
  Object.assign(process.env, prevEnv);

  const secretParity = {
    apiPresent: Boolean(apiSecret),
    cronPresent: Boolean(cronSecret),
    apiNonEmpty: apiSecret.length >= 32,
    cronNonEmpty: cronSecret.length >= 32,
    lengthsValid: apiSecret.length >= 32 && cronSecret.length >= 32,
    apiHashMatch: verifyServiceSecret(apiSecret, account?.secret_hash, MAINTENANCE_ACCOUNT_ID),
    cronHashMatch: verifyServiceSecret(cronSecret, account?.secret_hash, MAINTENANCE_ACCOUNT_ID),
    sameSecretAcrossServices:
      apiSecret && cronSecret && pepper
        ? hashMaintenanceSecret(apiSecret) === hashMaintenanceSecret(cronSecret)
        : false,
  };

  const permissionIds = (perms || []).map((p) => p.permission_id).sort();
  const permissionsExact =
    permissionIds.length === EXPECTED_PERMISSIONS.length &&
    EXPECTED_PERMISSIONS.every((p) => permissionIds.includes(p));

  const { count: activeAssignments } = await sb
    .from("iam_user_assignments")
    .select("*", { count: "exact", head: true })
    .is("revoked_at", null);

  const { count: superAdminCount } = await sb
    .from("iam_user_assignments")
    .select("*", { count: "exact", head: true })
    .eq("role_id", "super_admin")
    .is("revoked_at", null);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15) + "Z";
  const report = {
    timestamp,
    phase: "subscription-maintenance-production-audit",
    productionRefMasked: maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF),
    apiService: API_SERVICE,
    cronService: CRON_SERVICE,
    expectedApiHost: PRODUCTION_API_HOST,
    iamAccount: {
      id: account?.id,
      enabled: account?.enabled === true,
      active: !account?.revoked_at,
      hasHash: Boolean(account?.secret_hash),
      permissions: permissionIds,
      permissionsExact,
    },
    humanAssignments: { active: activeAssignments, superAdminCount },
    environmentContracts: {
      api: { ok: apiContract.ok, missingRequiredCount: apiContract.missingRequiredCount, invalidRequiredCount: apiContract.invalidRequiredCount },
      cron: { ok: cronContract.ok, missingRequiredCount: cronContract.missingRequiredCount, invalidRequiredCount: cronContract.invalidRequiredCount },
    },
    secretParity,
    apiVariables: auditServiceVars(apiVars, "api"),
    cronVariables: auditServiceVars(cronVars, "cron"),
    requiredApi: [...API_ONLY, "IAM_SUBSCRIPTION_MAINTENANCE_SECRET", "IAM_SUBSCRIPTION_MAINTENANCE_SERVICE_ACCOUNT_ID"],
    requiredCron: [...CRON_ONLY, "IAM_SUBSCRIPTION_MAINTENANCE_SECRET", "IAM_SUBSCRIPTION_MAINTENANCE_SERVICE_ACCOUNT_ID"],
    alertRunbook: {
      scheduledMissingMinutes: 30,
      lastSuccessStaleMinutes: 30,
      consecutiveFailures: 2,
      authFailureInScheduler: "401/403 once → page",
      slowExecutionMs: 120_000,
      duplicateRateAbnormal: "investigate maintenanceInFlight + notice flags",
      monitorVia: "Railway cron logs + GET /health environmentValidation.ok + subscription_maintenance_cron_call_* events",
    },
  };

  writeFileSync(join(ARTIFACT_DIR, `subscription-maintenance-audit-${timestamp}.json`), JSON.stringify(report, null, 2));

  console.log(
    JSON.stringify(
      {
        apiContractOk: apiContract.ok,
        cronContractOk: cronContract.ok,
        secretParity,
        artifact: `subscription-maintenance-audit-${timestamp}.json`,
      },
      null,
      2
    )
  );

  if (
    !apiContract.ok ||
    !cronContract.ok ||
    !secretParity.apiHashMatch ||
    !secretParity.cronHashMatch ||
    !secretParity.sameSecretAcrossServices ||
    !permissionsExact
  ) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }));
  process.exit(1);
});
