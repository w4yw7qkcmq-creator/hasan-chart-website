#!/usr/bin/env node
/**
 * Production subscription-maintenance-worker provisioning (B2).
 *
 * Usage:
 *   node scripts/iam/production-subscription-maintenance-provision.mjs           # dry-run
 *   node scripts/iam/production-subscription-maintenance-provision.mjs --execute
 *
 * Requires .env.local + .env.production.worker-auth.local (pepper).
 * Generates secret on --execute; writes to worker-auth local file only.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  maskProjectRef,
  extractSupabaseProjectRef,
  assertProductionSupabaseConfig,
} from "../../lib/production-env-guard.js";
import { permissionsForServiceAccount } from "../../lib/iam/service-account-permissions.js";
import { hashServiceSecret, verifyServiceSecret } from "../../lib/iam/service-accounts.js";

const ROOT = process.cwd();
const PROD_ENV = resolve(ROOT, ".env.local");
const WORKER_AUTH_ENV = resolve(ROOT, ".env.production.worker-auth.local");
const ARTIFACT_DIR = join(ROOT, "scripts/iam/.artifacts");
const EXECUTE = process.argv.includes("--execute");
const ACCOUNT_ID = "subscription-maintenance-worker";

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

function generateSecret() {
  return randomBytes(32).toString("base64url");
}

function upsertEnvKey(path, key, value) {
  const content = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = content.split(/\r?\n/).filter((line) => !line.startsWith(`${key}=`));
  if (lines.length && lines[lines.length - 1] !== "") lines.push("");
  lines.push(`${key}=${value}`);
  writeFileSync(path, `${lines.join("\n")}\n`);
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
  if (urlRef === STAGING_SUPABASE_PROJECT_REF) throw new Error("Staging ref rejected");
  assertProductionSupabaseConfig({ projectRef: urlRef, url: env.NEXT_PUBLIC_SUPABASE_URL });

  const pepper = String(env.IAM_SERVICE_SECRET_PEPPER || "").trim();
  if (pepper.length < 32) throw new Error("IAM_SERVICE_SECRET_PEPPER missing/short");
  process.env.IAM_SERVICE_SECRET_PEPPER = pepper;

  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const before = await fetchAccount(sb);
  const requiredPermissions = permissionsForServiceAccount(ACCOUNT_ID);

  const report = {
    phase: "production-subscription-maintenance-provision",
    mode: EXECUTE ? "execute" : "dry-run",
    timestamp: new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14),
    productionRefMasked: maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF),
    accountId: ACCOUNT_ID,
    before: {
      exists: Boolean(before.account),
      enabled: before.account?.enabled ?? null,
      hashConfigured: Boolean(before.account?.secret_hash),
      permissions: before.permissions,
    },
    requiredPermissions,
    ok: true,
    verdict: EXECUTE ? "EXECUTE_PENDING" : "DRY_RUN_ONLY",
  };

  if (EXECUTE) {
    const secret = generateSecret();
    const secretHash = hashServiceSecret(secret, ACCOUNT_ID);
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

    for (const permission_id of requiredPermissions) {
      const { error } = await sb.from("iam_service_account_permissions").upsert(
        { service_account_id: ACCOUNT_ID, permission_id, effect: "allow" },
        { onConflict: "service_account_id,permission_id" }
      );
      if (error) throw error;
    }

    upsertEnvKey(WORKER_AUTH_ENV, "IAM_SUBSCRIPTION_MAINTENANCE_SECRET", secret);
    upsertEnvKey(WORKER_AUTH_ENV, "IAM_SUBSCRIPTION_MAINTENANCE_SERVICE_ACCOUNT_ID", ACCOUNT_ID);

    const after = await fetchAccount(sb);
    const hashMatch = verifyServiceSecret(secret, after.account?.secret_hash, ACCOUNT_ID);

    report.after = {
      enabled: after.account?.enabled === true,
      hashConfigured: Boolean(after.account?.secret_hash),
      hashMatch,
      permissions: after.permissions,
    };
    report.verdict =
      after.account?.enabled && hashMatch && requiredPermissions.every((p) => after.permissions.includes(p))
        ? "PROVISION_COMPLETE"
        : "PROVISION_MISMATCH";
    report.ok = report.verdict === "PROVISION_COMPLETE";
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const artifactPath = join(
    ARTIFACT_DIR,
    `production-subscription-maintenance-${report.mode}-${report.timestamp}.json`
  );
  writeFileSync(artifactPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify({ verdict: report.verdict, ok: report.ok, artifact: artifactPath }, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
});
