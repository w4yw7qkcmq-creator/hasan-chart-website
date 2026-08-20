#!/usr/bin/env node
/**
 * Production instant-analysis-worker provisioning for B2.3 dual-mode rollout.
 *
 * Usage:
 *   node scripts/iam/production-worker-auth-provision.mjs           # dry-run
 *   node scripts/iam/production-worker-auth-provision.mjs --execute # one-shot mutate
 *
 * Requires:
 *   .env.local (Production Supabase URL + service role)
 *   .env.production.worker-auth.local (IAM_SERVICE_SECRET_PEPPER + IAM_INSTANT_ANALYSIS_WORKER_SECRET)
 *
 * Never prints plaintext secrets or hashes.
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
import { hashServiceSecret } from "../../lib/iam/service-accounts.js";

const ROOT = process.cwd();
const PROD_ENV = resolve(ROOT, ".env.local");
const WORKER_AUTH_ENV = resolve(ROOT, ".env.production.worker-auth.local");
const ARTIFACT_DIR = join(ROOT, "scripts/iam/.artifacts");
const EXECUTE = process.argv.includes("--execute");
const ACCOUNT_ID = "instant-analysis-worker";
const REQUIRED_PERMISSION = IAM_PERMISSIONS.ANALYSIS_MANAGE;

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

function scanReportForSecrets(report) {
  const blob = JSON.stringify(report);
  const hits = [];
  if (/eyJ[A-Za-z0-9_-]{20,}/.test(blob)) hits.push("jwt_like");
  if (/Bearer\s+[A-Za-z0-9._-]{20,}/.test(blob)) hits.push("bearer_token");
  if (/sk-[A-Za-z0-9]{20,}/.test(blob)) hits.push("api_key");
  return hits;
}

function isValidPepper(value) {
  const pepper = String(value || "").trim();
  if (pepper.length < 32) return false;
  const weak = new Set(["iam-service-pepper-dev-only", "unconfigured", "changeme", "placeholder"]);
  return !weak.has(pepper);
}

async function fetchAccount(sb) {
  const { data: account, error } = await sb
    .from("iam_service_accounts")
    .select("id, enabled, secret_hash, revoked_at")
    .eq("id", ACCOUNT_ID)
    .maybeSingle();
  if (error) throw error;

  const { data: perms, error: permErr } = await sb
    .from("iam_service_account_permissions")
    .select("permission_id, effect")
    .eq("service_account_id", ACCOUNT_ID);
  if (permErr) throw permErr;

  return {
    account,
    permissions: (perms || []).map((p) => p.permission_id),
  };
}

async function main() {
  const local = parseEnvFile(PROD_ENV);
  const workerAuth = parseEnvFile(WORKER_AUTH_ENV);
  const env = { ...process.env, ...local, ...workerAuth };

  const urlRef = extractSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL || "");
  if (urlRef === STAGING_SUPABASE_PROJECT_REF) {
    throw new Error("Staging Supabase ref rejected");
  }
  assertProductionSupabaseConfig({ projectRef: urlRef, url: env.NEXT_PUBLIC_SUPABASE_URL });

  const pepper = String(env.IAM_SERVICE_SECRET_PEPPER || "").trim();
  const machineSecret = String(env.IAM_INSTANT_ANALYSIS_WORKER_SECRET || "").trim();

  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }
  if (!isValidPepper(pepper)) {
    throw new Error("IAM_SERVICE_SECRET_PEPPER invalid or missing in .env.production.worker-auth.local");
  }
  if (machineSecret.length < 48) {
    throw new Error("IAM_INSTANT_ANALYSIS_WORKER_SECRET must be 48+ chars in .env.production.worker-auth.local");
  }

  process.env.IAM_SERVICE_SECRET_PEPPER = pepper;

  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const before = await fetchAccount(sb);
  const secretHash = hashServiceSecret(machineSecret, ACCOUNT_ID);
  const hashConfigured = Boolean(secretHash && secretHash.length === 64);

  const proposedPermissions = [REQUIRED_PERMISSION];
  const permissionsToRemove = before.permissions.filter((p) => !proposedPermissions.includes(p));
  const permissionsToAdd = proposedPermissions.filter((p) => !before.permissions.includes(p));

  const report = {
    phase: "production-worker-auth-provision",
    mode: EXECUTE ? "execute" : "dry-run",
    timestamp: new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14),
    productionRefMasked: maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF),
    accountId: ACCOUNT_ID,
    before: {
      enabled: before.account?.enabled ?? null,
      hashConfigured: Boolean(before.account?.secret_hash),
      revoked: Boolean(before.account?.revoked_at),
      permissions: before.permissions,
    },
    after: {
      enabled: true,
      hashConfigured: true,
      revoked: false,
      permissions: proposedPermissions,
    },
    mutations: {
      enableAccount: before.account?.enabled !== true,
      setSecretHash: !before.account?.secret_hash,
      clearRevoked: Boolean(before.account?.revoked_at),
      permissionDelta: { add: permissionsToAdd, remove: permissionsToRemove },
    },
    guards: {
      stagingRefRejected: true,
      pepperValid: true,
      machineSecretPresent: true,
      plaintextLogged: false,
    },
    ok: true,
    verdict: EXECUTE ? "EXECUTE_PENDING" : "DRY_RUN_ONLY",
  };

  if (EXECUTE) {
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
      .eq("id", ACCOUNT_ID);
    if (updErr) throw updErr;

    if (permissionsToRemove.length) {
      for (const permission_id of permissionsToRemove) {
        const { error } = await sb
          .from("iam_service_account_permissions")
          .delete()
          .eq("service_account_id", ACCOUNT_ID)
          .eq("permission_id", permission_id);
        if (error) throw error;
      }
    }

    for (const permission_id of permissionsToAdd) {
      const { error } = await sb.from("iam_service_account_permissions").upsert(
        { service_account_id: ACCOUNT_ID, permission_id, effect: "allow" },
        { onConflict: "service_account_id,permission_id" }
      );
      if (error) throw error;
    }

    const after = await fetchAccount(sb);
    report.after = {
      enabled: after.account?.enabled === true,
      hashConfigured: Boolean(after.account?.secret_hash),
      revoked: Boolean(after.account?.revoked_at),
      permissions: after.permissions,
    };
    report.verdict =
      after.account?.enabled === true &&
      after.account?.secret_hash &&
      after.permissions.join(",") === REQUIRED_PERMISSION
        ? "PROVISION_COMPLETE"
        : "PROVISION_MISMATCH";
    report.ok = report.verdict === "PROVISION_COMPLETE";
  }

  const secretHits = scanReportForSecrets(report);
  report.secretScan = { clean: secretHits.length === 0, hits: secretHits };
  if (secretHits.length) {
    report.ok = false;
    report.verdict = "BLOCKED_SECRET_LEAK";
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const artifactPath = join(
    ARTIFACT_DIR,
    `production-worker-auth-${report.mode}-${report.timestamp}.json`
  );
  writeFileSync(artifactPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        ok: report.ok,
        mode: report.mode,
        artifact: artifactPath,
        hashConfigured,
      },
      null,
      2
    )
  );

  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
});
