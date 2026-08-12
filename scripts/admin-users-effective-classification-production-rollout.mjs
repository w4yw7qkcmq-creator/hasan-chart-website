#!/usr/bin/env node
/**
 * Production ONLY — effective classification read-model migration + hard gates.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { execSync, spawnSync } from "node:child_process";
import {
  resolveEffectiveUserClassification,
  USER_CLASSIFICATION,
} from "../lib/user-classification.js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  maskProjectRef,
} from "../lib/staging-env-guard.js";

const ROOT = resolve(process.cwd());
const PRODUCTION_REF = PRODUCTION_SUPABASE_PROJECT_REF;
const MIGRATION = "20260812103000_profiles_effective_user_classification_read_model.sql";
const EXPECTED_SHA256 =
  "30abb130e3e6bef6aedc31630190332f2fc46dfbd6e2988871eb470f01f9b132";
const ARTIFACT = join(ROOT, ".artifacts/effective-classification-production-rollout.json");

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function getLinkedRef() {
  const paths = [
    join(ROOT, "supabase/.temp/project-ref"),
    join(ROOT, "supabase/.temp/linked-project.json"),
  ];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, "utf8").trim();
    if (p.endsWith(".json")) {
      try {
        return JSON.parse(raw).ref || null;
      } catch {
        /* ignore */
      }
    }
    return raw;
  }
  return null;
}

function assertProductionLinked() {
  let linked = getLinkedRef();
  if (linked !== PRODUCTION_REF) {
    if (linked === STAGING_SUPABASE_PROJECT_REF) {
      console.log(
        `Relinking staging ${maskProjectRef(linked)} → production ${maskProjectRef(PRODUCTION_REF)}`
      );
    } else {
      console.log(`Linking to production ${maskProjectRef(PRODUCTION_REF)} (was ${maskProjectRef(linked || "none")})`);
    }
    execSync(`npx supabase link --project-ref ${PRODUCTION_REF} --yes`, {
      cwd: ROOT,
      stdio: "inherit",
    });
    linked = getLinkedRef();
  }
  if (linked === STAGING_SUPABASE_PROJECT_REF) {
    throw new Error("ABORT: still linked to staging");
  }
  if (linked !== PRODUCTION_REF) {
    throw new Error(
      `ABORT: expected production ref ${maskProjectRef(PRODUCTION_REF)}, got ${maskProjectRef(linked || "none")}`
    );
  }
  console.log(`Production target confirmed: ${maskProjectRef(linked)}`);
  return linked;
}

function runSql(sql) {
  const tmp = join(ROOT, ".tmp-effective-classification-production.sql");
  writeFileSync(tmp, sql);
  const result = spawnSync("supabase", ["db", "query", "--linked", "-f", tmp, "-o", "json"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "SQL failed");
  }
  return JSON.parse(result.stdout).rows || [];
}

function runMigrationFile() {
  const migrationPath = join(ROOT, "supabase/migrations", MIGRATION);
  const result = spawnSync("supabase", ["db", "query", "--linked", "-f", migrationPath], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Migration failed: ${MIGRATION}`);
  }
  return { file: MIGRATION, exitCode: result.status ?? 0, ok: true };
}

function countRows(table) {
  try {
    return Number(runSql(`SELECT count(*)::bigint AS count FROM public.${table};`)[0]?.count ?? 0);
  } catch {
    return null;
  }
}

function businessBaseline() {
  return {
    profiles: countRows("profiles"),
    authUsers: Number(runSql(`SELECT count(*)::bigint AS count FROM auth.users;`)[0]?.count ?? 0),
    subscription_requests: countRows("subscription_requests"),
    partners: countRows("partners"),
    partner_commissions: countRows("partner_commissions"),
    partner_financial_ledger_entries: countRows("partner_financial_ledger_entries"),
    partner_withdrawals: countRows("partner_withdrawals"),
    partner_wallet_ledger: countRows("partner_wallet_ledger"),
  };
}

function storedClassificationCounts() {
  return runSql(`
SELECT user_classification, count(*)::int AS count
FROM public.profiles
GROUP BY user_classification
ORDER BY user_classification;
`);
}

function effectiveColumnCounts() {
  return runSql(`
SELECT effective_user_classification AS classification, count(*)::int AS count
FROM public.profiles
GROUP BY effective_user_classification
ORDER BY effective_user_classification;
`);
}

function jsEffectiveCounts(profiles) {
  const counts = Object.fromEntries(Object.values(USER_CLASSIFICATION).map((k) => [k, 0]));
  for (const profile of profiles) {
    const resolved = resolveEffectiveUserClassification(profile);
    counts[resolved.classification] = (counts[resolved.classification] || 0) + 1;
  }
  return counts;
}

function maskEmail(email) {
  const e = String(email || "");
  return e.replace(/(^.).*(@.*$)/, "$1***$2");
}

function migrationSafetyReview(migrationText) {
  const lower = migrationText.toLowerCase();
  const destructive = [
    /\bdrop\s+column\b/i,
    /\bdrop\s+table\b/i,
    /\bdelete\s+from\b/i,
    /\btruncate\b/i,
    /\balter\s+table\s+auth\.users\b/i,
  ];
  const hits = destructive.filter((re) => re.test(migrationText));
  return {
    additive: migrationText.includes("ADD COLUMN IF NOT EXISTS"),
    noDestructiveHits: hits.length === 0,
    destructiveHits: hits.map(String),
    hasTrigger: migrationText.includes("profiles_sync_effective_user_classification"),
    hasIndexes: migrationText.includes("profiles_effective_user_classification_idx"),
    serviceRoleGrants: lower.includes("service_role"),
    noFinancialTables: !/\bpartner_(commissions|withdrawals|wallet)/i.test(migrationText),
  };
}

function catalogProof() {
  const columns = runSql(`
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
  AND column_name IN (
    'effective_user_classification',
    'effective_user_classification_source',
    'effective_user_classification_at'
  )
ORDER BY column_name;
`).map((r) => r.column_name);

  const functions = runSql(`
SELECT p.proname AS name
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'compute_profile_classification_heuristic',
    'resolve_profile_effective_classification',
    'admin_profiles_effective_classification_counts'
  )
ORDER BY p.proname;
`).map((r) => r.name);

  const trigger = runSql(`
SELECT tgname
FROM pg_trigger
WHERE tgname = 'profiles_sync_effective_user_classification'
  AND NOT tgisinternal;
`).map((r) => r.tgname);

  const indexes = runSql(`
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'profiles'
  AND indexname IN (
    'profiles_effective_user_classification_idx',
    'profiles_effective_user_classification_created_at_idx',
    'profiles_effective_user_classification_last_sign_in_idx'
  )
ORDER BY indexname;
`).map((r) => r.indexname);

  const acl = runSql(`
SELECT
  p.proname,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'compute_profile_classification_heuristic',
    'resolve_profile_effective_classification',
    'admin_profiles_effective_classification_counts'
  )
ORDER BY p.proname;
`);

  return { columns, functions, trigger, indexes, acl };
}

function jsDbParity(profiles) {
  let mismatches = 0;
  const samples = [];
  for (const profile of profiles) {
    const js = resolveEffectiveUserClassification(profile).classification;
    const db = String(profile.effective_user_classification || "").trim().toLowerCase();
    if (js !== db) {
      mismatches += 1;
      if (samples.length < 6) {
        samples.push({
          email: maskEmail(profile.email),
          js,
          db,
          stored: profile.user_classification,
          storedSource: profile.user_classification_source,
        });
      }
    }
  }
  return { mismatches, samples };
}

function dbInternalParity() {
  return Number(
    runSql(`
SELECT count(*)::int AS mismatches
FROM public.profiles p
CROSS JOIN LATERAL public.resolve_profile_effective_classification(
  p.email, p.username, p.role, p.created_at, p.last_sign_in_at,
  p.user_classification, p.user_classification_source
) eff
WHERE p.effective_user_classification IS DISTINCT FROM eff.effective_classification;
`)[0]?.mismatches ?? 0
  );
}

function manualOverrideProof() {
  const rows = runSql(`
SELECT id, email, user_classification, user_classification_source,
       effective_user_classification, effective_user_classification_source
FROM public.profiles
WHERE user_classification_source = 'admin_manual'
ORDER BY created_at ASC;
`);
  const violations = rows.filter(
    (r) =>
      String(r.effective_user_classification || "").trim().toLowerCase() !==
      String(r.user_classification || "").trim().toLowerCase()
  );
  return {
    adminManualCount: rows.length,
    violations: violations.length,
    samples: rows.slice(0, 3).map((r) => ({
      email: maskEmail(r.email),
      stored: r.user_classification,
      effective: r.effective_user_classification,
      effectiveSource: r.effective_user_classification_source,
    })),
  };
}

function explainPlan() {
  const plan = runSql(`
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id
FROM public.profiles
WHERE effective_user_classification = 'real'
ORDER BY created_at DESC
LIMIT 25;
`);
  return plan.map((r) => r["QUERY PLAN"] || Object.values(r)[0]).join("\n");
}

function kpiRpc() {
  const rows = runSql(`SELECT * FROM public.admin_profiles_effective_classification_counts();`);
  const byClass = Object.fromEntries(rows.map((r) => [r.classification, Number(r.total)]));
  return { rows, byClass, total: rows.reduce((s, r) => s + Number(r.total), 0) };
}

function migrationHistory() {
  try {
    return runSql(`
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version = '20260812103000';
`);
  } catch {
    return [];
  }
}

function registerMigrationHistoryIfMissing(catalog) {
  const history = migrationHistory();
  if (history.length > 0) {
    return { alreadyRegistered: true, history };
  }
  const ok =
    catalog.columns.length === 3 &&
    catalog.functions.length === 3 &&
    catalog.trigger.length === 1 &&
    catalog.indexes.length === 3;
  if (!ok) {
    return { alreadyRegistered: false, registered: false, reason: "catalog_incomplete" };
  }
  runSql(`
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260812103000', 'profiles_effective_user_classification_read_model')
ON CONFLICT (version) DO NOTHING;
`);
  return { alreadyRegistered: false, registered: true, history: migrationHistory() };
}

function fetchHealth() {
  try {
    const raw = execSync("curl -sS https://www.hasanchartworld.com/api/health", {
      encoding: "utf8",
    });
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function gitPreflight() {
  const status = execSync("git status --short", { cwd: ROOT, encoding: "utf8" });
  const forbidden = [
    ".env",
    ".env.local",
    ".env.production",
    "supabase/.temp/",
    ".artifacts/",
    "scripts/.artifacts/",
  ];
  const lines = status.split("\n").filter(Boolean);
  const flagged = lines.filter((line) => forbidden.some((f) => line.includes(f)));
  return { head: execSync("git log -1 --oneline", { cwd: ROOT, encoding: "utf8" }).trim(), statusLines: lines.length, flaggedForbidden: flagged };
}

function main() {
  const migrationPath = join(ROOT, "supabase/migrations", MIGRATION);
  const migrationText = readFileSync(migrationPath, "utf8");
  const checksum = sha256(migrationPath);

  const report = {
    generatedAt: new Date().toISOString(),
    environment: "production",
    projectRef: PRODUCTION_REF,
    projectRefMasked: maskProjectRef(PRODUCTION_REF),
    migration: MIGRATION,
    migrationChecksum: checksum,
    migrationChecksumMatchesStaging: checksum === EXPECTED_SHA256,
    gitPreflight: gitPreflight(),
    healthBaseline: fetchHealth(),
  };

  if (!report.migrationChecksumMatchesStaging) {
    throw new Error(`ABORT: migration checksum mismatch expected ${EXPECTED_SHA256} got ${checksum}`);
  }

  report.migrationSafety = migrationSafetyReview(migrationText);
  if (!report.migrationSafety.additive || !report.migrationSafety.noDestructiveHits) {
    throw new Error("ABORT: migration safety review failed");
  }

  report.linkedRef = assertProductionLinked();

  report.businessBaseline = businessBaseline();
  report.storedPreMigration = storedClassificationCounts();

  const profilesPre = runSql(`
SELECT id, email, username, role, created_at, last_sign_in_at,
       user_classification, user_classification_source
FROM public.profiles
ORDER BY created_at ASC;
`);
  report.jsEffectivePreMigration = jsEffectiveCounts(profilesPre);
  report.profilesTotalPre = profilesPre.length;

  let readModelExists = false;
  try {
    runSql(`SELECT effective_user_classification FROM public.profiles LIMIT 1;`);
    readModelExists = true;
  } catch {
    readModelExists = false;
  }

  if (!readModelExists) {
    report.migrationApply = runMigrationFile();
  } else {
    report.migrationApply = { file: MIGRATION, skipped: true, reason: "read_model_already_present" };
  }

  report.catalog = catalogProof();
  const requiredColumns = [
    "effective_user_classification",
    "effective_user_classification_source",
    "effective_user_classification_at",
  ];
  const requiredFunctions = [
    "compute_profile_classification_heuristic",
    "resolve_profile_effective_classification",
    "admin_profiles_effective_classification_counts",
  ];
  const requiredIndexes = [
    "profiles_effective_user_classification_idx",
    "profiles_effective_user_classification_created_at_idx",
    "profiles_effective_user_classification_last_sign_in_idx",
  ];
  report.catalogPass =
    requiredColumns.every((c) => report.catalog.columns.includes(c)) &&
    requiredFunctions.every((f) => report.catalog.functions.includes(f)) &&
    report.catalog.trigger.includes("profiles_sync_effective_user_classification") &&
    requiredIndexes.every((i) => report.catalog.indexes.includes(i)) &&
    report.catalog.acl.every((row) => row.service_role_execute === true);

  if (!report.catalogPass) {
    throw new Error("ABORT: catalog verification failed");
  }

  const profilesPost = runSql(`
SELECT id, email, username, role, created_at, last_sign_in_at,
       user_classification, user_classification_source,
       effective_user_classification, effective_user_classification_source
FROM public.profiles
ORDER BY created_at ASC;
`);

  report.jsDbParity = jsDbParity(profilesPost);
  report.dbInternalParityMismatches = dbInternalParity();
  report.effectiveCountsPost = effectiveColumnCounts();
  report.jsEffectivePostMigration = jsEffectiveCounts(profilesPost);
  report.effectiveSum = report.effectiveCountsPost.reduce((s, r) => s + Number(r.count), 0);

  report.idempotency = {
    dbInternalParityAfterReconcile: dbInternalParity(),
  };

  report.manualOverride = manualOverrideProof();
  report.explainPlan = explainPlan();
  report.kpiRpc = kpiRpc();
  report.kpiSum = report.kpiRpc.total;

  report.businessPost = businessBaseline();
  report.businessDelta = Object.fromEntries(
    Object.keys(report.businessBaseline).map((key) => [
      key,
      report.businessPost[key] - report.businessBaseline[key],
    ])
  );

  report.migrationHistory = migrationHistory();
  if (report.migrationHistory.length === 0) {
    report.migrationHistoryFix = registerMigrationHistoryIfMissing(report.catalog);
    report.migrationHistory = migrationHistory();
  }

  report.pass =
    report.catalogPass &&
    report.jsDbParity.mismatches === 0 &&
    report.dbInternalParityMismatches === 0 &&
    report.effectiveSum === report.profilesTotalPre &&
    report.manualOverride.violations === 0 &&
    Object.values(report.businessDelta).every((d) => d === 0) &&
    report.migrationHistory.length > 0;

  mkdirSync(join(ROOT, ".artifacts"), { recursive: true });
  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
