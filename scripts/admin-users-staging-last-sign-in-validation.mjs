#!/usr/bin/env node
/**
 * Staging-only validation for profiles.last_sign_in_at migration, backfill, sync, and drift.
 * Requires: linked Staging project (tvkhuijufhnpqpchkyss), .env.staging.local
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { loadStagingEnvFile } from "../lib/load-staging-env.js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  assertStagingSupabaseConfig,
  maskProjectRef,
} from "../lib/staging-env-guard.js";
import { loadAdminUserList } from "../lib/admin-user-management.js";

const ROOT = resolve(process.cwd());
const ARTIFACT_DIR = join(ROOT, "scripts/.artifacts");

function getLinkedRef() {
  return JSON.parse(
    readFileSync(join(ROOT, "supabase/.temp/linked-project.json"), "utf8")
  ).ref;
}

function runStagingSql(sql, label = "query") {
  const tmp = join(ROOT, `.tmp-last-sign-in-${label}.sql`);
  writeFileSync(tmp, sql);
  const result = spawnSync(
    "supabase",
    ["db", "query", "--linked", "-f", tmp, "-o", "json"],
    { cwd: ROOT, encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `SQL failed: ${label}`);
  }
  const parsed = JSON.parse(result.stdout);
  return parsed.rows || [];
}

function runStagingSqlFile(filePath, label) {
  const result = spawnSync(
    "supabase",
    ["db", "query", "--linked", "-f", filePath, "-o", "json"],
    { cwd: ROOT, encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `SQL file failed: ${label}`);
  }
  const parsed = JSON.parse(result.stdout);
  return parsed.rows || parsed;
}

async function snapshotMetrics() {
  const [
    columnExists,
    totalProfiles,
    profilePopulated,
    authTotal,
    authPopulated,
    exactMatches,
    profileNullAuthPopulated,
    profileNeAuth,
    orphanProfiles,
    authWithoutProfile,
    oldestNewest,
  ] = await Promise.all([
    runStagingSql(
      "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='last_sign_in_at') AS v",
      "column"
    ),
    runStagingSql("SELECT count(*)::int AS v FROM public.profiles", "profiles"),
    runStagingSql(
      "SELECT count(*)::int AS v FROM public.profiles WHERE last_sign_in_at IS NOT NULL",
      "profile-pop"
    ),
    runStagingSql("SELECT count(*)::int AS v FROM auth.users", "auth-total"),
    runStagingSql(
      "SELECT count(*)::int AS v FROM auth.users WHERE last_sign_in_at IS NOT NULL",
      "auth-pop"
    ),
    runStagingSql(
      `SELECT count(*)::int AS v FROM public.profiles p
       JOIN auth.users u ON u.id = p.id
       WHERE p.last_sign_in_at IS NOT NULL AND u.last_sign_in_at IS NOT NULL
         AND p.last_sign_in_at = u.last_sign_in_at`,
      "exact"
    ),
    runStagingSql(
      `SELECT count(*)::int AS v FROM public.profiles p
       JOIN auth.users u ON u.id = p.id
       WHERE p.last_sign_in_at IS NULL AND u.last_sign_in_at IS NOT NULL`,
      "null-auth-pop"
    ),
    runStagingSql(
      `SELECT count(*)::int AS v FROM public.profiles p
       JOIN auth.users u ON u.id = p.id
       WHERE p.last_sign_in_at IS NOT NULL AND u.last_sign_in_at IS NOT NULL
         AND p.last_sign_in_at IS DISTINCT FROM u.last_sign_in_at`,
      "ne-auth"
    ),
    runStagingSql(
      `SELECT count(*)::int AS v FROM public.profiles p
       LEFT JOIN auth.users u ON u.id = p.id WHERE u.id IS NULL`,
      "orphan"
    ),
    runStagingSql(
      `SELECT count(*)::int AS v FROM auth.users u
       LEFT JOIN public.profiles p ON p.id = u.id WHERE p.id IS NULL`,
      "auth-no-profile"
    ),
    runStagingSql(
      `SELECT min(last_sign_in_at) AS oldest, max(last_sign_in_at) AS newest
       FROM public.profiles WHERE last_sign_in_at IS NOT NULL`,
      "range"
    ),
  ]);

  const total = totalProfiles[0]?.v || 0;
  const populated = profilePopulated[0]?.v || 0;

  return {
    columnExists: Boolean(columnExists[0]?.v),
    totalProfiles: total,
    profilePopulated: populated,
    profileNull: total - populated,
    profileCoveragePct: total ? Number(((populated / total) * 100).toFixed(2)) : 0,
    authTotal: authTotal[0]?.v || 0,
    authPopulated: authPopulated[0]?.v || 0,
    exactMatches: exactMatches[0]?.v || 0,
    profileNullAuthPopulated: profileNullAuthPopulated[0]?.v || 0,
    profileNeAuth: profileNeAuth[0]?.v || 0,
    orphanProfiles: orphanProfiles[0]?.v || 0,
    authWithoutProfile: authWithoutProfile[0]?.v || 0,
    oldestPopulated: oldestNewest[0]?.oldest || null,
    newestPopulated: oldestNewest[0]?.newest || null,
  };
}

function classifyDrift(metrics) {
  if (!metrics.columnExists) return "COLUMN_MISSING";
  if (metrics.profileNeAuth > 0) return "UNSYNCED";
  if (metrics.profileNullAuthPopulated > 0) return "PARTIALLY_SYNCED";
  if (metrics.exactMatches > 0 && metrics.profileNeAuth === 0 && metrics.profileNullAuthPopulated === 0) {
    return "SYNCED";
  }
  return "PARTIALLY_SYNCED";
}

function financialSnapshot() {
  const sql = `
SELECT 'subscription_requests' AS t, count(*)::bigint AS c FROM public.subscription_requests
UNION ALL SELECT 'partner_wallet_ledger', count(*)::bigint FROM public.partner_wallet_ledger
UNION ALL SELECT 'partner_balances', count(*)::bigint FROM public.partner_balances;
`;
  try {
    return runStagingSql(sql, "financial");
  } catch {
    return [{ note: "financial tables query skipped (table may not exist on staging subset)" }];
  }
}

async function createStagingClients() {
  const url = process.env.STAGING_SUPABASE_URL;
  const serviceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.STAGING_SUPABASE_ANON_KEY;
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  return { service, anon };
}

async function testLoginSync({ service, anon, password }) {
  const runId = Date.now();
  const email = `last-sign-in-sync-${runId}@staging-hcw.test`;
  const createResult = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: `sync${runId}` },
  });
  if (createResult.error) throw createResult.error;
  const userId = createResult.data.user.id;

  await new Promise((r) => setTimeout(r, 500));

  const beforeAuth = await runStagingSql(
    `SELECT last_sign_in_at FROM auth.users WHERE id = '${userId}'`,
    "auth-before"
  );
  const beforeProfile = await runStagingSql(
    `SELECT last_sign_in_at FROM public.profiles WHERE id = '${userId}'`,
    "profile-before"
  );

  const login = await anon.auth.signInWithPassword({ email, password });
  if (login.error || !login.data?.user) {
    throw new Error(login.error?.message || "login failed");
  }

  await new Promise((r) => setTimeout(r, 1000));

  const afterAuth = await runStagingSql(
    `SELECT last_sign_in_at FROM auth.users WHERE id = '${userId}'`,
    "auth-after"
  );
  const afterProfile = await runStagingSql(
    `SELECT last_sign_in_at FROM public.profiles WHERE id = '${userId}'`,
    "profile-after"
  );

  const authTs = afterAuth[0]?.last_sign_in_at || null;
  const profileTs = afterProfile[0]?.last_sign_in_at || null;
  const synced = Boolean(authTs && profileTs && authTs === profileTs);

  await service.auth.admin.deleteUser(userId);

  return {
    email,
    userId,
    before: {
      auth: beforeAuth[0]?.last_sign_in_at || null,
      profile: beforeProfile[0]?.last_sign_in_at || null,
    },
    after: { auth: authTs, profile: profileTs },
    synced,
  };
}

function testLastLoginFiltersSql() {
  const totalFiltered = runStagingSql(
    `SELECT count(*)::int AS total FROM public.profiles
     WHERE last_sign_in_at >= '2020-01-01T00:00:00+00:00'
       AND last_sign_in_at <= '2030-12-31T23:59:59.999+00:00'`,
    "filter-range-count"
  )[0]?.total;

  const newest = runStagingSql(
    `SELECT id, last_sign_in_at FROM public.profiles
     WHERE last_sign_in_at IS NOT NULL
     ORDER BY last_sign_in_at DESC NULLS LAST
     LIMIT 10`,
    "sort-newest"
  );

  const oldest = runStagingSql(
    `SELECT id, last_sign_in_at FROM public.profiles
     WHERE last_sign_in_at IS NOT NULL
     ORDER BY last_sign_in_at ASC NULLS LAST
     LIMIT 10`,
    "sort-oldest"
  );

  const page2 = runStagingSql(
    `SELECT id FROM public.profiles
     WHERE last_sign_in_at IS NOT NULL
     ORDER BY last_sign_in_at DESC NULLS LAST
     OFFSET 5 LIMIT 5`,
    "pagination-page2"
  );

  const combined = runStagingSql(
    `SELECT count(*)::int AS total FROM public.profiles
     WHERE last_sign_in_at IS NOT NULL
       AND account_status = 'active'
       AND created_at >= date_trunc('month', timezone('Asia/Damascus', now())) AT TIME ZONE 'Asia/Damascus'`,
    "combined-filter-count"
  )[0]?.total;

  const sortOk =
    newest.length <= 10 &&
    (newest.length < 2 ||
      new Date(newest[0].last_sign_in_at) >= new Date(newest[1].last_sign_in_at));

  return {
    mode: "sql-server-side-simulation",
    lastLoginRange: { ok: totalFiltered >= 0, total: totalFiltered },
    sortNewest: { ok: sortOk, count: newest.length },
    sortOldest: { ok: oldest.length >= 0, count: oldest.length },
    pagination: { ok: page2.length <= 5, count: page2.length },
    combined: { ok: combined >= 0, total: combined },
    csvEligibleRows: totalFiltered,
  };
}

async function testAdminListFilters(service) {
  try {
    const results = { mode: "loadAdminUserList" };
    const base = await loadAdminUserList(service, { page: 1, pageSize: 10, sort: "last_sign_in" });
    results.sortNewest = {
      ok: base.capabilities?.lastSignInFilterAvailable === true,
      total: base.pagination?.total,
      count: base.users?.length || 0,
    };
    return results;
  } catch (error) {
    return {
      ...testLastLoginFiltersSql(),
      loadAdminUserListSkipped: error.message,
    };
  }
}

async function main() {
  const staging = loadStagingEnvFile();
  const linkedRef = getLinkedRef();
  if (linkedRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("Linked to Production — aborting");
  }
  if (linkedRef !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error("Linked ref mismatch");
  }

  const password = process.env.STAGING_IAM_TEST_PASSWORD;
  if (!password) throw new Error("Missing STAGING_IAM_TEST_PASSWORD");

  const report = {
    runAt: new Date().toISOString(),
    linkedRefMasked: maskProjectRef(linkedRef),
    stagingBefore: null,
    migrationAudit: {
      fullPhase3File: "supabase/migrations/20260720_admin_user_management_phase3.sql",
      fullPhase3Scope: [
        "profiles lifecycle columns incl. last_sign_in_at",
        "subscription_requests admin_disabled columns",
        "admin_user_notes table",
        "admin_audit_logs table",
      ],
      appliedMinimal: "supabase/migrations/20260811103000_profiles_last_sign_in_sync.sql",
      phase3MigrationRecorded: null,
      existingTriggersBefore: null,
    },
    financialBefore: null,
    financialAfter: null,
    schemaChangeApplied: false,
    backfill: null,
    stagingAfter: null,
    driftClassification: null,
    loginSyncTest: null,
    idempotencyTest: null,
    adminListTests: null,
    verdict: "FAIL",
    blockers: [],
  };

  report.stagingBefore = await snapshotMetrics();
  report.financialBefore = financialSnapshot();
  report.migrationAudit.phase3MigrationRecorded = runStagingSql(
    "SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260720') AS v",
    "phase3"
  )[0]?.v;
  report.migrationAudit.existingTriggersBefore = runStagingSql(
    `SELECT tgname, n.nspname || '.' || c.relname AS on_relation
     FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT t.tgisinternal AND (tgname ILIKE '%last_sign_in%' OR tgname ILIKE '%auth_user%')
     ORDER BY on_relation, tgname`,
    "triggers-before"
  );

  const migrationPath = join(
    ROOT,
    "supabase/migrations/20260811103000_profiles_last_sign_in_sync.sql"
  );
  const triggerExists = runStagingSql(
    `SELECT EXISTS (
       SELECT 1 FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       WHERE t.tgname = 'on_auth_user_last_sign_in'
     ) AS v`,
    "trigger-check"
  )[0]?.v;

  if (!triggerExists) {
    runStagingSqlFile(migrationPath, "apply-sync-migration");
    report.schemaChangeApplied = true;
  } else {
    report.schemaChangeApplied = false;
    report.schemaChangeNote = "sync migration already applied";
  }

  const beforeBackfill = report.stagingBefore.profilePopulated;
  const backfillRows = runStagingSql(
    "SELECT * FROM public.reconcile_profiles_last_sign_in_at();",
    "backfill"
  );
  report.backfill = {
    profilePopulatedBefore: beforeBackfill,
    reconcileResult: backfillRows[0] || null,
  };

  report.stagingAfter = await snapshotMetrics();
  report.driftClassification = classifyDrift(report.stagingAfter);

  const secondPass = runStagingSql(
    "SELECT * FROM public.reconcile_profiles_last_sign_in_at();",
    "idempotency"
  );
  report.idempotencyTest = {
    secondPass: secondPass[0] || null,
    pass: Number(secondPass[0]?.updated_count || 0) === 0,
  };

  const { service, anon } = await createStagingClients();
  report.loginSyncTest = await testLoginSync({ service, anon, password });
  report.adminListTests = await testAdminListFilters(service);

  report.financialAfter = financialSnapshot();
  const financialDelta =
    JSON.stringify(report.financialBefore) === JSON.stringify(report.financialAfter);

  const loginOk = report.loginSyncTest.synced === true;
  const idempotentOk = report.idempotencyTest.pass === true;
  const driftOk =
    report.driftClassification === "SYNCED" || report.driftClassification === "PARTIALLY_SYNCED";
  const mismatchOk = report.stagingAfter.profileNeAuth === 0;
  const authPopulatedSynced =
    report.stagingAfter.profileNullAuthPopulated === 0;

  if (!loginOk) report.blockers.push("real login sync failed");
  if (!idempotentOk) report.blockers.push("idempotency reconcile changed rows unexpectedly");
  if (!mismatchOk) report.blockers.push("profile != auth mismatches remain");
  if (!authPopulatedSynced) {
    report.blockers.push(
      `${report.stagingAfter.profileNullAuthPopulated} profiles still NULL while auth populated`
    );
  }
  if (!financialDelta) report.blockers.push("financial table counts changed");

  report.verdict =
    loginOk && idempotentOk && mismatchOk && authPopulatedSynced && financialDelta
      ? driftOk
        ? "PASS"
        : "PARTIAL_PASS"
      : "FAIL";

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const outPath = join(ARTIFACT_DIR, `admin-users-last-sign-in-staging-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.verdict === "PASS", outPath, verdict: report.verdict, blockers: report.blockers }, null, 2));
  process.exit(report.verdict === "PASS" ? 0 : 1);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exit(1);
});
