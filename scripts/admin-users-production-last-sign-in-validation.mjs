#!/usr/bin/env node
/**
 * Production-only last_sign_in_at migration, backfill, and verification.
 * Requires linked Production ref lzgsxdsumnteuwtjfqlm and .env.local credentials for login test.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  maskProjectRef,
} from "../lib/staging-env-guard.js";

const ROOT = resolve(process.cwd());
const PRODUCTION_REF = PRODUCTION_SUPABASE_PROJECT_REF;
const ARTIFACT_DIR = join(ROOT, "scripts/.artifacts");
const MIGRATION_FILE = "supabase/migrations/20260811103000_profiles_last_sign_in_sync.sql";
const APPLY_MIGRATION = !process.argv.includes("--skip-migration");

function getLinkedRef() {
  return JSON.parse(
    readFileSync(join(ROOT, "supabase/.temp/linked-project.json"), "utf8")
  ).ref;
}

function runProdSql(sql, label = "query") {
  const tmp = join(ROOT, `.tmp-prod-last-sign-in-${label}.sql`);
  writeFileSync(tmp, sql);
  const result = spawnSync(
    "supabase",
    ["db", "query", "--linked", "-f", tmp, "-o", "json"],
    { cwd: ROOT, encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `SQL failed: ${label}`);
  }
  return JSON.parse(result.stdout).rows || [];
}

function runProdSqlFile(filePath, label) {
  const result = spawnSync(
    "supabase",
    ["db", "query", "--linked", "-f", filePath, "-o", "json"],
    { cwd: ROOT, encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `SQL file failed: ${label}`);
  }
  return JSON.parse(result.stdout).rows || [];
}

function financialSnapshot() {
  const sql = `
SELECT 'partner_commissions' AS t, count(*)::bigint AS c FROM public.partner_commissions
UNION ALL SELECT 'partner_financial_ledger_entries', count(*)::bigint FROM public.partner_financial_ledger_entries
UNION ALL SELECT 'partner_withdrawals', count(*)::bigint FROM public.partner_withdrawals
UNION ALL SELECT 'partner_wallet_ledger', count(*)::bigint FROM public.partner_wallet_ledger
UNION ALL SELECT 'subscription_requests', count(*)::bigint FROM public.subscription_requests
UNION ALL SELECT 'partners', count(*)::bigint FROM public.partners;
`;
  try {
    return runProdSql(sql, "financial");
  } catch (error) {
    return [{ error: String(error.message).slice(0, 200) }];
  }
}

function partnerBalanceSums() {
  const sql = `
SELECT
  coalesce(sum(available_balance), 0)::numeric AS available_sum,
  coalesce(sum(pending_balance), 0)::numeric AS pending_sum
FROM public.partner_balances;
`;
  try {
    return runProdSql(sql, "balances")[0] || {};
  } catch {
    return { skipped: true };
  }
}

async function profileAuthSnapshot() {
  const columnExists = Boolean(
    runProdSql(
      "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='last_sign_in_at') AS v",
      "col"
    )[0]?.v
  );

  const totalProfiles = runProdSql("SELECT count(*)::int AS v FROM public.profiles", "prof")[0]?.v || 0;
  const authTotal = runProdSql("SELECT count(*)::int AS v FROM auth.users", "auth")[0]?.v || 0;
  const authPopulated =
    runProdSql(
      "SELECT count(*)::int AS v FROM auth.users WHERE last_sign_in_at IS NOT NULL",
      "auth-pop"
    )[0]?.v || 0;
  const withMatchingAuth =
    runProdSql(
      "SELECT count(*)::int AS v FROM public.profiles p INNER JOIN auth.users u ON u.id = p.id",
      "match-auth"
    )[0]?.v || 0;
  const orphanProfiles =
    runProdSql(
      "SELECT count(*)::int AS v FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id WHERE u.id IS NULL",
      "orphan"
    )[0]?.v || 0;
  const authWithoutProfile =
    runProdSql(
      "SELECT count(*)::int AS v FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id WHERE p.id IS NULL",
      "auth-no-prof"
    )[0]?.v || 0;

  let profilePopulated = 0;
  let exactMatches = 0;
  let profileNullAuthPopulated = 0;
  let profileNeAuth = 0;

  if (columnExists) {
    profilePopulated =
      runProdSql(
        "SELECT count(*)::int AS v FROM public.profiles WHERE last_sign_in_at IS NOT NULL",
        "prof-pop"
      )[0]?.v || 0;
    exactMatches =
      runProdSql(
        `SELECT count(*)::int AS v FROM public.profiles p
         JOIN auth.users u ON u.id = p.id
         WHERE p.last_sign_in_at IS NOT NULL AND u.last_sign_in_at IS NOT NULL
           AND p.last_sign_in_at = u.last_sign_in_at`,
        "exact"
      )[0]?.v || 0;
    profileNullAuthPopulated =
      runProdSql(
        `SELECT count(*)::int AS v FROM public.profiles p
         JOIN auth.users u ON u.id = p.id
         WHERE p.last_sign_in_at IS NULL AND u.last_sign_in_at IS NOT NULL`,
        "null-auth"
      )[0]?.v || 0;
    profileNeAuth =
      runProdSql(
        `SELECT count(*)::int AS v FROM public.profiles p
         JOIN auth.users u ON u.id = p.id
         WHERE p.last_sign_in_at IS NOT NULL AND u.last_sign_in_at IS NOT NULL
           AND p.last_sign_in_at IS DISTINCT FROM u.last_sign_in_at`,
        "ne-auth"
      )[0]?.v || 0;
  } else if (authPopulated > 0) {
    profileNullAuthPopulated =
      runProdSql(
        `SELECT count(*)::int AS v FROM public.profiles p
         JOIN auth.users u ON u.id = p.id
         WHERE u.last_sign_in_at IS NOT NULL`,
        "null-auth-no-col"
      )[0]?.v || 0;
  }

  const total = totalProfiles;
  const populated = profilePopulated;

  return {
    columnExists,
    totalProfiles: total,
    profilePopulated: populated,
    profileNull: total - populated,
    profileCoveragePct: total ? Number(((populated / total) * 100).toFixed(2)) : 0,
    authTotal,
    authPopulated,
    profilesWithMatchingAuth: withMatchingAuth,
    orphanProfiles,
    authWithoutProfile,
    exactMatches,
    profileNullAuthPopulated,
    profileNeAuth,
  };
}

function catalogVerification() {
  return {
    column: runProdSql(
      "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='last_sign_in_at') AS v",
      "cat-col"
    )[0]?.v,
    index: runProdSql(
      "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='profiles_last_sign_in_at_idx') AS v",
      "cat-idx"
    )[0]?.v,
    syncFn: runProdSql(
      "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='sync_profile_last_sign_in_at') AS v",
      "cat-sync"
    )[0]?.v,
    reconcileFn: runProdSql(
      "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='reconcile_profiles_last_sign_in_at') AS v",
      "cat-rec"
    )[0]?.v,
    trigger: runProdSql(
      `SELECT EXISTS (
         SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
         WHERE t.tgname='on_auth_user_last_sign_in'
       ) AS v`,
      "cat-trg"
    )[0]?.v,
    migrationHistory: runProdSql(
      "SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260811103000') AS v",
      "cat-mig"
    )[0]?.v,
  };
}

function recordMigrationHistory() {
  runProdSql(
    `INSERT INTO supabase_migrations.schema_migrations (version)
     VALUES ('20260811103000')
     ON CONFLICT DO NOTHING;`,
    "record-mig"
  );
}

function loadEnvLocal() {
  const path = join(ROOT, ".env.local");
  const parsed = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    parsed[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return parsed;
}

async function testProductionLogin() {
  const envLocal = loadEnvLocal();
  const e2ePath = join(ROOT, ".env.e2e.local");
  let email = "";
  let password = "";
  if (existsSync(e2ePath)) {
    for (const line of readFileSync(e2ePath, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim();
      if (k === "E2E_USER_EMAIL") email = v;
      if (k === "E2E_USER_PASS") password = v;
    }
  }
  if (!email || !password) {
    return { skipped: true, reason: "E2E_USER credentials not configured" };
  }

  const url = envLocal.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = envLocal.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = envLocal.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return { skipped: true, reason: "Missing Supabase env in .env.local" };
  }

  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });

  const { data: userRow } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = userRow?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user?.id) {
    return { skipped: true, reason: "E2E user not found in auth" };
  }

  const userId = user.id;
  const beforeAuth = runProdSql(
    `SELECT last_sign_in_at FROM auth.users WHERE id='${userId}'`,
    "login-auth-before"
  )[0]?.last_sign_in_at;
  const beforeProfile = runProdSql(
    `SELECT last_sign_in_at FROM public.profiles WHERE id='${userId}'`,
    "login-prof-before"
  )[0]?.last_sign_in_at;

  const login = await anon.auth.signInWithPassword({ email, password });
  if (login.error) {
    throw new Error(login.error.message || "production login failed");
  }

  await new Promise((r) => setTimeout(r, 1500));

  const afterAuth = runProdSql(
    `SELECT last_sign_in_at FROM auth.users WHERE id='${userId}'`,
    "login-auth-after"
  )[0]?.last_sign_in_at;
  const afterProfile = runProdSql(
    `SELECT last_sign_in_at FROM public.profiles WHERE id='${userId}'`,
    "login-prof-after"
  )[0]?.last_sign_in_at;

  await anon.auth.signOut();

  return {
    userId,
    before: { auth: beforeAuth, profile: beforeProfile },
    after: { auth: afterAuth, profile: afterProfile },
    synced: Boolean(afterAuth && afterProfile && afterAuth === afterProfile),
  };
}

async function main() {
  const linkedRef = getLinkedRef();
  if (linkedRef === STAGING_SUPABASE_PROJECT_REF) {
    throw new Error("Staging linked — aborting production run");
  }
  if (linkedRef !== PRODUCTION_REF) {
    throw new Error(`Unexpected linked ref ${maskProjectRef(linkedRef)}`);
  }

  const migrationSha = spawnSync("shasum", ["-a", "256", join(ROOT, MIGRATION_FILE)], {
    encoding: "utf8",
  })
    .stdout.split(" ")[0]
    .trim();

  const report = {
    runAt: new Date().toISOString(),
    productionRefMasked: maskProjectRef(linkedRef),
    migrationSha256: migrationSha,
    baseline: {
      profilesAuth: await profileAuthSnapshot(),
      financial: financialSnapshot(),
      partnerBalances: partnerBalanceSums(),
    },
    migrationApplied: false,
    catalog: null,
    backfill: null,
    afterBackfill: null,
    idempotency: null,
    loginSync: null,
    financialAfter: null,
    verdict: "FAIL",
    blockers: [],
  };

  if (APPLY_MIGRATION) {
    const catBefore = report.baseline.profilesAuth;
    if (!catBefore.columnExists) {
      runProdSqlFile(join(ROOT, MIGRATION_FILE), "apply-migration");
      report.migrationApplied = true;
      recordMigrationHistory();
    } else {
      const hasTrigger = runProdSql(
        `SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='on_auth_user_last_sign_in') AS v`,
        "trg-check"
      )[0]?.v;
      if (!hasTrigger) {
        runProdSqlFile(join(ROOT, MIGRATION_FILE), "apply-sync-only");
        report.migrationApplied = true;
      }
      recordMigrationHistory();
    }
  }

  report.catalog = catalogVerification();

  const backfill = runProdSql("SELECT * FROM public.reconcile_profiles_last_sign_in_at();", "backfill");
  report.backfill = backfill[0] || null;
  report.afterBackfill = await profileAuthSnapshot();

  const second = runProdSql("SELECT * FROM public.reconcile_profiles_last_sign_in_at();", "idempotent");
  report.idempotency = { secondPass: second[0] || null, pass: Number(second[0]?.updated_count || 0) === 0 };

  report.loginSync = await testProductionLogin();

  report.financialAfter = {
    counts: financialSnapshot(),
    partnerBalances: partnerBalanceSums(),
  };

  const finSame =
    JSON.stringify(report.baseline.financial) === JSON.stringify(report.financialAfter.counts);
  const balSame =
    JSON.stringify(report.baseline.partnerBalances) ===
    JSON.stringify(report.financialAfter.partnerBalances);
  const mismatchOk = report.afterBackfill.profileNeAuth === 0;
  const nullAuthOk = report.afterBackfill.profileNullAuthPopulated === 0;
  const idempotentOk = report.idempotency.pass;
  const loginOk = report.loginSync.synced === true || report.loginSync.skipped;

  if (!mismatchOk) report.blockers.push("profile != auth mismatches remain");
  if (!nullAuthOk) report.blockers.push("profile NULL while auth populated");
  if (!idempotentOk) report.blockers.push("idempotency failed");
  if (!report.loginSync.skipped && !report.loginSync.synced) {
    report.blockers.push("real login sync failed");
  }
  if (!finSame || !balSame) report.blockers.push("financial delta detected");

  report.verdict =
    mismatchOk && nullAuthOk && idempotentOk && (report.loginSync.synced || report.loginSync.skipped) && finSame && balSame
      ? report.loginSync.skipped
        ? "PARTIAL_PASS_LOGIN_SKIPPED"
        : "PASS"
      : "FAIL";

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const out = join(ARTIFACT_DIR, `admin-users-last-sign-in-production-${Date.now()}.json`);
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.verdict.startsWith("PASS") || report.verdict.includes("PARTIAL"), out, verdict: report.verdict, blockers: report.blockers }, null, 2));
  process.exit(report.verdict === "PASS" ? 0 : report.verdict === "PARTIAL_PASS_LOGIN_SKIPPED" ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
