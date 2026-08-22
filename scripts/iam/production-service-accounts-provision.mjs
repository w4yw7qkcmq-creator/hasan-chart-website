#!/usr/bin/env node
/**
 * Production IAM service account provisioning — dry-run by default.
 *
 * Usage:
 *   node scripts/iam/production-service-accounts-provision.mjs           # dry-run (default)
 *   node scripts/iam/production-service-accounts-provision.mjs --execute # mutates Production DB
 *
 * Requires: .env.local (Production Supabase) — never loads Staging env files.
 * Never prints plaintext secrets or secret hashes.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  maskProjectRef,
  extractSupabaseProjectRef,
  assertProductionSupabaseConfig,
} from "../../lib/production-env-guard.js";
import { IAM_PERMISSIONS } from "../../lib/iam/constants.js";
import {
  CRON_SERVICE_PERMISSIONS,
  permissionsForServiceAccount,
} from "../../lib/iam/service-account-permissions.js";
import { generateServiceSecret } from "../../lib/iam/service-accounts.js";

const ROOT = process.cwd();
const PROD_ENV = resolve(ROOT, ".env.local");
const ARTIFACT_DIR = join(ROOT, "scripts/iam/.artifacts");
const EXECUTE = process.argv.includes("--execute");

/** Route-backed least-privilege plan (Production web app machine auth only). */
const PRODUCTION_SERVICE_PLAN = Object.freeze([
  {
    id: "subscription-maintenance-worker",
    label: "Subscription Maintenance Worker",
    provision: true,
    railwayService: "hasan-chart-subscription-maintenance-worker",
    routes: [{ method: "POST", path: "/run", permission: IAM_PERMISSIONS.SUBSCRIPTIONS_MANAGE }],
    permissions: permissionsForServiceAccount("subscription-maintenance-worker"),
    railwayEnv: {
      accountIdVar: "IAM_SUBSCRIPTION_MAINTENANCE_SERVICE_ACCOUNT_ID",
      accountIdValue: "subscription-maintenance-worker",
      secretVar: "IAM_SUBSCRIPTION_MAINTENANCE_SECRET",
      legacySecretVar: "CRON_SECRET",
      pepperVar: "IAM_SERVICE_SECRET_PEPPER",
    },
    requiredHeaders: ["x-service-account-id", "x-service-account-secret"],
    legacyHeaders: ["Authorization: Bearer <CRON_SECRET>", "x-cron-secret"],
  },
  {
    id: "cron",
    label: "Cron Jobs",
    provision: true,
    railwayService: "hasan-chart-web",
    routes: [
      { method: "GET", path: "/api/check-subscription-expiry", permission: IAM_PERMISSIONS.SYSTEM_CRON_READ },
      { method: "GET", path: "/api/check-price-alerts", permission: IAM_PERMISSIONS.SYSTEM_CRON_READ, note: "410 by design; auth gate still enforced" },
    ],
    permissions: [...CRON_SERVICE_PERMISSIONS],
    railwayEnv: {
      accountIdVar: "IAM_CRON_SERVICE_ACCOUNT_ID",
      accountIdValue: "cron",
      secretVar: "IAM_CRON_SERVICE_SECRET",
      legacySecretVar: "CRON_SECRET",
      pepperVar: "IAM_SERVICE_SECRET_PEPPER",
    },
    requiredHeaders: ["x-service-account-id", "x-service-account-secret"],
    legacyHeaders: ["Authorization: Bearer <CRON_SECRET>", "x-cron-secret"],
  },
  {
    id: "news-worker",
    label: "News Worker",
    provision: false,
    skipReason: "Worker uses Supabase + Telegram API directly; no HTTP calls to protected web routes (/api/send-news is human-admin only).",
    routes: [],
    permissions: [],
  },
  {
    id: "price-alert-worker",
    label: "Price Alert Worker",
    provision: false,
    skipReason: "Price alerts run on Railway worker only; website /api/check-price-alerts returns 410. Worker uses own CRON_SECRET/WORKER_API_SECRET.",
    routes: [],
    permissions: [],
  },
  {
    id: "instant-analysis-worker",
    label: "Instant Analysis Worker",
    provision: false,
    skipReason: "Retired Aug 2026 — instant analysis removed from production; IAM account kept for historical audit.",
    routes: [],
    permissions: [],
  },
  {
    id: "telegram-bot",
    label: "Telegram Bot",
    provision: false,
    skipReason: "Telegram delivery via worker TELEGRAM_BOT_TOKEN; no standalone protected web route for telegram-bot identity.",
    routes: [],
    permissions: [],
  },
]);

const FORBIDDEN_PERMISSIONS = new Set([
  IAM_PERMISSIONS.IAM_MANAGE,
  IAM_PERMISSIONS.IAM_READ,
  IAM_PERMISSIONS.USERS_MANAGE,
  IAM_PERMISSIONS.USERS_READ,
  IAM_PERMISSIONS.SUBSCRIPTIONS_MANAGE,
  IAM_PERMISSIONS.SUBSCRIPTIONS_READ,
  IAM_PERMISSIONS.DASHBOARD_MUTATIONS,
  IAM_PERMISSIONS.DASHBOARD_READ,
  IAM_PERMISSIONS.FINANCE_READ,
  IAM_PERMISSIONS.FINANCE_PROOFS_READ,
  IAM_PERMISSIONS.FINANCE_EXPORT,
  IAM_PERMISSIONS.NEWS_PUBLISH,
  IAM_PERMISSIONS.PARTNERS_JOBS_RUN,
]);

const SKIPPED_ACCOUNT_IDS = [
  "news-worker",
  "price-alert-worker",
  "instant-analysis-worker",
  "telegram-bot",
];

function assertCanonicalCronMatrix() {
  const cronPerms = permissionsForServiceAccount("cron");
  if (cronPerms.length !== 1 || cronPerms[0] !== IAM_PERMISSIONS.SYSTEM_CRON_READ) {
    throw new Error("Canonical cron matrix must contain system.cron.read only");
  }
  if (JSON.stringify(cronPerms) !== JSON.stringify([...CRON_SERVICE_PERMISSIONS])) {
    throw new Error("CRON_SERVICE_PERMISSIONS drift from permissionsForServiceAccount(cron)");
  }
}

function resolveProductionPlan() {
  assertCanonicalCronMatrix();
  const cronPerms = [...permissionsForServiceAccount("cron")];
  return PRODUCTION_SERVICE_PLAN.map((entry) =>
    entry.id === "cron" ? { ...entry, permissions: cronPerms } : { ...entry }
  );
}

function validateSkippedAccounts(accounts) {
  return SKIPPED_ACCOUNT_IDS.map((id) => {
    const account = accounts.find((a) => a.id === id);
    const pass = Boolean(account && account.enabled === false && account.has_secret_hash === false);
    return {
      id,
      enabled: account?.enabled ?? null,
      has_secret_hash: account?.has_secret_hash ?? null,
      proposedMutation: false,
      pass,
    };
  });
}

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = val;
  }
  return out;
}

function loadProductionEnv() {
  const local = parseEnvFile(PROD_ENV);
  const env = {
    ...process.env,
    NODE_ENV: "production",
    IAM_DB: "true",
    IAM_API: "false",
    IAM_UI: "false",
    IAM_RLS: "false",
  };
  for (const [k, v] of Object.entries(local)) {
    if (k.startsWith("STAGING_")) continue;
    env[k] = v;
  }
  return env;
}

function rejectStagingSecrets(env) {
  const urlRef = extractSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "");
  if (urlRef === STAGING_SUPABASE_PROJECT_REF) {
    throw new Error("Staging Supabase ref detected — aborting Production provisioning");
  }
  for (const key of Object.keys(env)) {
    if (/^STAGING_IAM_/i.test(key) && env[key]) {
      throw new Error(`Staging IAM secret env key present (${key}) — remove from Production context`);
    }
  }
}

function assertIamFlags(env) {
  if (env.IAM_API === "true" || env.IAM_API === true) {
    throw new Error("IAM_API must remain false during provisioning phase");
  }
  if (env.IAM_UI === "true" || env.IAM_RLS === "true") {
    throw new Error("IAM_UI and IAM_RLS must remain false during provisioning phase");
  }
}

function scanReportForSecrets(report) {
  const blob = JSON.stringify(report);
  const hits = [];
  if (/eyJ[A-Za-z0-9_-]{20,}/.test(blob)) hits.push("jwt_like");
  if (/Bearer\s+[A-Za-z0-9._-]{20,}/.test(blob)) hits.push("bearer_token");
  if (/sk-[A-Za-z0-9]{20,}/.test(blob)) hits.push("api_key");
  if (/service_role/.test(blob)) hits.push("service_role_literal");
  return hits;
}

async function fetchProductionServiceAccounts(sb) {
  const { data: accounts, error } = await sb
    .from("iam_service_accounts")
    .select("id, label, enabled, secret_hash, revoked_at, rotated_at, updated_at")
    .order("id");
  if (error) throw error;

  const { data: perms, error: permErr } = await sb
    .from("iam_service_account_permissions")
    .select("service_account_id, permission_id, effect")
    .order("service_account_id")
    .order("permission_id");
  if (permErr) throw permErr;

  return {
    accounts: (accounts || []).map((a) => ({
      ...a,
      has_secret_hash: Boolean(a.secret_hash),
      secret_hash: a.secret_hash ? "[REDACTED]" : null,
    })),
    permissions: perms || [],
  };
}

function buildMutationPlan(current, planEntry) {
  const account = current.accounts.find((a) => a.id === planEntry.id);
  const currentPerms = current.permissions
    .filter((p) => p.service_account_id === planEntry.id && p.effect === "allow")
    .map((p) => p.permission_id);

  const proposedPerms = planEntry.permissions;
  const permsToAdd = proposedPerms.filter((p) => !currentPerms.includes(p));
  const permsToRemove = currentPerms.filter((p) => !proposedPerms.includes(p));

  const forbiddenPresent = proposedPerms.filter((p) => FORBIDDEN_PERMISSIONS.has(p));

  return {
    accountId: planEntry.id,
    current: {
      enabled: account?.enabled ?? null,
      has_secret_hash: account?.has_secret_hash ?? false,
      revoked_at: account?.revoked_at ?? null,
      permissions: currentPerms,
    },
    proposed: {
      enabled: true,
      secret_hash: "[GENERATED_AT_EXECUTE — never logged]",
      permissions: proposedPerms,
    },
    sqlEquivalent: {
      updateAccount:
        "UPDATE iam_service_accounts SET enabled=true, secret_hash=<generated>, rotated_at=now(), updated_at=now(), revoked_at=null WHERE id=$id",
      deletePermissions: permsToRemove.length
        ? `DELETE FROM iam_service_account_permissions WHERE service_account_id='${planEntry.id}' AND permission_id IN (${permsToRemove.map((p) => `'${p}'`).join(", ")})`
        : null,
      upsertPermissions: proposedPerms.map(
        (p) =>
          `UPSERT iam_service_account_permissions(service_account_id='${planEntry.id}', permission_id='${p}', effect='allow')`
      ),
    },
    permissionDelta: { add: permsToAdd, remove: permsToRemove },
    forbiddenInProposal: forbiddenPresent,
    blocked: forbiddenPresent.length > 0,
  };
}

async function executeProvision(sb, planEntry, env) {
  if (!env.IAM_SERVICE_SECRET_PEPPER?.trim()) {
    throw new Error("IAM_SERVICE_SECRET_PEPPER must be set before --execute");
  }

  const plaintext = generateServiceSecret(32);
  const { hashServiceSecret } = await import("../../lib/iam/service-accounts.js");
  const secretHash = hashServiceSecret(plaintext, planEntry.id);
  const now = new Date().toISOString();

  const { error: updErr } = await sb
    .from("iam_service_accounts")
    .update({
      enabled: true,
      secret_hash: secretHash,
      revoked_at: null,
      rotated_at: now,
      updated_at: now,
    })
    .eq("id", planEntry.id);
  if (updErr) throw updErr;

  await sb.from("iam_service_account_permissions").delete().eq("service_account_id", planEntry.id);
  for (const permission_id of planEntry.permissions) {
    const { error } = await sb.from("iam_service_account_permissions").upsert(
      { service_account_id: planEntry.id, permission_id, effect: "allow" },
      { onConflict: "service_account_id,permission_id" }
    );
    if (error) throw error;
  }

  return {
    accountId: planEntry.id,
    secretPlaintextOnce: plaintext,
    rotatedAt: now,
  };
}

async function main() {
  const env = loadProductionEnv();
  rejectStagingSecrets(env);
  assertIamFlags(env);

  const projectRef =
    env.PRODUCTION_SUPABASE_PROJECT_REF ||
    extractSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL || "");
  assertProductionSupabaseConfig({ projectRef, url: env.NEXT_PUBLIC_SUPABASE_URL });

  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }

  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const current = await fetchProductionServiceAccounts(sb);
  const unexpectedSecrets = current.accounts.filter((a) => a.has_secret_hash);
  const enabledAccounts = current.accounts.filter((a) => a.enabled);

  const plan = resolveProductionPlan();
  const toProvision = plan.filter((p) => p.provision);
  const skipped = plan.filter((p) => !p.provision);
  const mutations = toProvision.map((p) => buildMutationPlan(current, p));
  const skippedAccounts = validateSkippedAccounts(current.accounts);

  const report = {
    phase: "production-service-accounts-provision",
    mode: EXECUTE ? "execute" : "dry-run",
    timestamp: new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14),
    productionRefMasked: maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF),
    iamFlags: {
      IAM_DB: env.IAM_DB ?? "true",
      IAM_API: env.IAM_API ?? "false",
      IAM_UI: env.IAM_UI ?? "false",
      IAM_RLS: env.IAM_RLS ?? "false",
    },
    guards: {
      stagingRefRejected: true,
      stagingSecretsRejected: true,
      iamApiRemainsFalse: env.IAM_API !== "true",
      productionMutations: EXECUTE,
    },
    currentState: {
      accounts: current.accounts,
      permissions: current.permissions,
      enabledCount: enabledAccounts.length,
      unexpectedSecretHashCount: unexpectedSecrets.length,
      allDisabled: enabledAccounts.length === 0,
    },
    routeMatrix: plan.map((p) => ({
      service: p.id,
      provision: p.provision,
      skipReason: p.skipReason || null,
      routes: p.routes,
      permissions: p.permissions,
      railwayService: p.railwayService || null,
      railwayEnv: p.railwayEnv
        ? {
            accountIdVar: p.railwayEnv.accountIdVar,
            accountIdValue: p.railwayEnv.accountIdValue,
            secretVar: p.railwayEnv.secretVar,
            legacySecretVar: p.railwayEnv.legacySecretVar,
            pepperVar: p.railwayEnv.pepperVar,
          }
        : null,
      requiredHeaders: p.requiredHeaders || [],
      legacyHeaders: p.legacyHeaders || [],
    })),
    proposedMutations: mutations,
    skippedServices: skipped.map((s) => ({ id: s.id, reason: s.skipReason })),
    skippedAccountsValidation: skippedAccounts,
    canonicalCronMatrix: [...permissionsForServiceAccount("cron")],
    railwayNotes: {
      webService: "hasan-chart-web",
      workerService: "hasan-chart-worker",
      newsWorkerService: "hasan-chart-worker (start:news) — no IAM web routes",
      existingCronAuth: "CRON_SECRET on Web service (unchanged until IAM_API=true)",
      pepperRequired: "IAM_SERVICE_SECRET_PEPPER must be set on Web before --execute and before IAM_API=true",
      noRailwayChangesInDryRun: true,
    },
    validationPlan: [
      "Legacy: curl -sS -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer $CRON_SECRET' https://www.hasanchartworld.com/api/check-subscription-expiry → expect 200 (IAM_API=false)",
      "Post-provision DB: enabled=true for cron only; secret_hash IS NOT NULL; permissions=[system.cron.read]",
      "Post-Railway secret: store IAM_CRON_SERVICE_SECRET in Railway Variables (Web) via dashboard — never commit",
      "Future IAM_API=true: curl with x-service-account-id=cron + x-service-account-secret → 200 on subscription-expiry",
      "Negative: wrong secret → 401; legacy CRON_SECRET only when IAM_API=true → 403",
    ],
    rollbackPlan: [
      "UPDATE iam_service_accounts SET enabled=false, secret_hash=NULL, revoked_at=now() WHERE id='cron'",
      "Remove IAM_CRON_SERVICE_SECRET from Railway Web variables",
      "Keep IAM_API=false; CRON_SECRET continues to work via legacy path",
    ],
    executeResults: null,
    ok: true,
    verdict: EXECUTE ? "EXECUTE_COMPLETE" : "DRY_RUN_ONLY — ZERO PRODUCTION MUTATIONS",
  };

  if (mutations.some((m) => m.blocked)) {
    report.ok = false;
    report.verdict = "BLOCKED — forbidden permissions in proposal";
  }

  if (skippedAccounts.some((s) => !s.pass)) {
    report.ok = false;
    report.verdict = "BLOCKED — skipped accounts must remain disabled with null secret_hash";
  }

  if (unexpectedSecrets.length && !EXECUTE) {
    report.warnings = report.warnings || [];
    report.warnings.push("unexpected_existing_secret_hash");
  }

  if (EXECUTE) {
    if (env.IAM_API === "true") throw new Error("Refusing --execute while IAM_API=true");
    report.executeResults = [];
    for (const entry of toProvision) {
      const mutation = mutations.find((m) => m.accountId === entry.id);
      if (mutation?.blocked) throw new Error(`Blocked proposal for ${entry.id}`);
      const result = await executeProvision(sb, entry, env);
      report.executeResults.push({
        accountId: result.accountId,
        rotatedAt: result.rotatedAt,
        secretDeliveredOnce: true,
        secretValue: "[PRINTED_ONCE_TO_STDERR]",
      });
      console.error(
        JSON.stringify({
          deliverOnce: true,
          accountId: result.accountId,
          secretVar: entry.railwayEnv.secretVar,
          instruction: "Copy secret to Railway Variables now. It will not be shown again.",
          secret: result.secretPlaintextOnce,
        })
      );
    }
    report.verdict = "EXECUTE_COMPLETE";
  }

  const secretHits = scanReportForSecrets(report);
  report.secretScan = { leaks: secretHits, clean: secretHits.length === 0 };
  if (secretHits.length) {
    report.ok = false;
    report.verdict = "BLOCKED — secret leak in report artifact";
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const artifactPath = join(
    ARTIFACT_DIR,
    `production-service-accounts-${report.mode}-${report.timestamp}.json`
  );
  writeFileSync(artifactPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        ok: report.ok,
        mode: report.mode,
        provisionCount: toProvision.length,
        skipCount: skipped.length,
        artifact: artifactPath,
        confirmation: EXECUTE ? null : "DRY RUN ONLY — ZERO PRODUCTION MUTATIONS",
      },
      null,
      2
    )
  );

  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e.message, code: e.code || "FATAL" }));
  process.exit(1);
});
