#!/usr/bin/env node
/**
 * Staging-only: enable IAM service accounts with hashed secrets from .env.staging.local
 * Never prints plaintext secrets after setup.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { hashServiceSecret } from "../../lib/iam/service-accounts.js";
import { SERVICE_ACCOUNT_PERMISSION_MATRIX } from "../../lib/iam/service-account-permissions.js";
import { assertStagingSupabaseConfig, extractSupabaseProjectRef } from "../../lib/staging-env-guard.js";

const ROOT = process.cwd();
const STAGING_ENV = resolve(ROOT, ".env.staging.local");
const BOOTSTRAP_ENV = resolve(ROOT, ".env.staging.bootstrap.local");

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

async function main() {
  const staging = parseEnvFile(STAGING_ENV);
  const bootstrap = parseEnvFile(BOOTSTRAP_ENV);
  const env = { ...staging, ...bootstrap };
  assertStagingSupabaseConfig({
    projectRef: env.STAGING_SUPABASE_PROJECT_REF,
    url: env.STAGING_SUPABASE_URL,
  });

  const sb = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const accounts = [
    { id: "subscription-maintenance-worker", secretKey: "STAGING_IAM_SUBSCRIPTION_MAINTENANCE_SECRET" },
    { id: "cron", secretKey: "STAGING_IAM_CRON_SECRET" },
    { id: "news-worker", secretKey: "STAGING_IAM_NEWS_WORKER_SECRET" },
    { id: "price-alert-worker", secretKey: "STAGING_IAM_PRICE_ALERT_WORKER_SECRET", legacyKey: "STAGING_IAM_PRICE_ALERT_SECRET" },
    { id: "instant-analysis-worker", secretKey: "STAGING_IAM_INSTANT_ANALYSIS_WORKER_SECRET", legacyKey: "STAGING_IAM_ANALYSIS_WORKER_SECRET" },
    { id: "telegram-bot", secretKey: "STAGING_IAM_TELEGRAM_BOT_SECRET", legacyKey: "STAGING_IAM_TELEGRAM_SECRET" },
  ];

  const report = { configured: [], skipped: [], permissions: [] };

  for (const acct of accounts) {
    const plaintext = env[acct.secretKey] || (acct.legacyKey ? env[acct.legacyKey] : "");
    if (!plaintext) {
      report.skipped.push({ id: acct.id, reason: "secret_missing_in_env" });
      continue;
    }

    const secretHash = hashServiceSecret(plaintext, acct.id);
    const now = new Date().toISOString();

    await sb
      .from("iam_service_accounts")
      .update({
        enabled: true,
        secret_hash: secretHash,
        revoked_at: null,
        rotated_at: now,
        updated_at: now,
      })
      .eq("id", acct.id);

    await sb.from("iam_service_account_permissions").delete().eq("service_account_id", acct.id);

    const perms = SERVICE_ACCOUNT_PERMISSION_MATRIX[acct.id] || [];
    for (const permission_id of perms) {
      await sb.from("iam_service_account_permissions").upsert(
        { service_account_id: acct.id, permission_id, effect: "allow" },
        { onConflict: "service_account_id,permission_id" }
      );
    }

    report.configured.push({ id: acct.id, permissionCount: perms.length });
    report.permissions.push({ id: acct.id, permissions: perms });
  }

  console.log(
    JSON.stringify(
      {
        verdict: report.configured.length ? "STAGING_SERVICE_ACCOUNTS_READY" : "NO_SECRETS_CONFIGURED",
        projectRefMasked: extractSupabaseProjectRef(env.STAGING_SUPABASE_URL)?.slice(0, 4) + "***",
        report,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
});
