#!/usr/bin/env node
/**
 * Production ONLY — controlled classification migration + backfill + reconciliation.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { resolveUserClassificationSignals } from "../lib/user-classification.js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  maskProjectRef,
} from "../lib/staging-env-guard.js";

const ROOT = resolve(process.cwd());
const PRODUCTION_REF = PRODUCTION_SUPABASE_PROJECT_REF;
const MIGRATIONS = [
  "20260811120000_profiles_user_classification.sql",
  "20260811153000_profiles_user_classification_backfill_v2.sql",
  "20260811160000_profiles_user_classification_e2e_promote.sql",
];
const ARTIFACT = join(ROOT, ".artifacts/admin-users-classification-production-rollout.json");

function sha256(filePath) {
  const buf = readFileSync(filePath);
  return createHash("sha256").update(buf).digest("hex");
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
  if (linked === STAGING_SUPABASE_PROJECT_REF) {
    console.log(`Relinking staging ${maskProjectRef(linked)} → production ${maskProjectRef(PRODUCTION_REF)}`);
    execSync(`npx supabase link --project-ref ${PRODUCTION_REF} --yes`, {
      cwd: ROOT,
      stdio: "inherit",
    });
    linked = getLinkedRef();
  }
  if (linked !== PRODUCTION_REF) {
    throw new Error(`ABORT: expected production ref ${maskProjectRef(PRODUCTION_REF)}, got ${maskProjectRef(linked || "none")}`);
  }
  console.log(`Production target confirmed: ${maskProjectRef(linked)}`);
  return linked;
}

function runSql(sql) {
  const tmp = join(ROOT, ".tmp-production-classification.sql");
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

function runMigrationFile(file) {
  const migrationPath = join(ROOT, "supabase/migrations", file);
  const result = spawnSync("supabase", ["db", "query", "--linked", "-f", migrationPath], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Migration failed: ${file}`);
  }
  return { file, exitCode: result.status ?? 0, ok: true };
}

function countRows(table) {
  try {
    return runSql(`SELECT count(*)::bigint AS count FROM public.${table};`)[0]?.count ?? null;
  } catch {
    return null;
  }
}

function storedClassificationCounts() {
  try {
    return runSql(`
SELECT user_classification, count(*)::int AS count
FROM public.profiles
GROUP BY user_classification
ORDER BY user_classification;
`);
  } catch {
    return [];
  }
}

function columnExists() {
  try {
    runSql(`SELECT user_classification FROM public.profiles LIMIT 1;`);
    return true;
  } catch {
    return false;
  }
}

function computedClassificationCounts(includeStoredColumns = true) {
  const select =
    includeStoredColumns && columnExists()
      ? `id, email, username, role, user_classification, user_classification_source, created_at, last_sign_in_at`
      : `id, email, username, role, created_at, last_sign_in_at`;
  const profiles = runSql(`
SELECT ${select}
FROM public.profiles
ORDER BY created_at ASC;
`);
  const counts = { real: 0, test: 0, e2e: 0, internal: 0, suspected: 0, unknown: 0 };
  for (const profile of profiles) {
    const resolved = resolveUserClassificationSignals(profile);
    counts[resolved.classification] = (counts[resolved.classification] || 0) + 1;
  }
  return { total: profiles.length, counts };
}

function migrationHistory() {
  try {
    return runSql(`
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version LIKE '202608111%'
ORDER BY version;
`);
  } catch {
    return [];
  }
}

function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    environment: "production",
    projectRef: PRODUCTION_REF,
    projectRefMasked: maskProjectRef(PRODUCTION_REF),
    migrationChecksums: Object.fromEntries(
      MIGRATIONS.map((f) => [f, sha256(join(ROOT, "supabase/migrations", f))])
    ),
  };

  report.linkedRef = assertProductionLinked();

  report.baseline = {
    profiles: countRows("profiles"),
    authUsers: runSql(`SELECT count(*)::bigint AS count FROM auth.users;`)[0]?.count ?? null,
    columnExists: columnExists(),
    accountStatus: runSql(`
SELECT coalesce(account_status, 'null') AS status, count(*)::int AS count
FROM public.profiles GROUP BY 1 ORDER BY 1;
`),
    partner_commissions: countRows("partner_commissions"),
    partner_financial_ledger_entries: countRows("partner_financial_ledger_entries"),
    partner_withdrawals: countRows("partner_withdrawals"),
    partner_wallet_ledger: countRows("partner_wallet_ledger"),
    subscription_requests: countRows("subscription_requests"),
    partners: countRows("partners"),
    computedPreMigration: computedClassificationCounts(false),
    storedPreMigration: storedClassificationCounts(),
  };

  report.migrationApply = [];
  for (const file of MIGRATIONS) {
    const result = runMigrationFile(file);
    report.migrationApply.push({
      ...result,
      columnExistsAfter: columnExists(),
      storedCountsAfter: storedClassificationCounts(),
    });
  }

  report.backfillFirst = runSql(`SELECT * FROM public.backfill_profiles_user_classification_high_confidence();`)[0];
  report.storedAfterBackfill = storedClassificationCounts();
  report.computedAfterBackfill = computedClassificationCounts(true);

  report.backfillSecond = runSql(`SELECT * FROM public.backfill_profiles_user_classification_high_confidence();`)[0];
  report.storedAfterIdempotency = storedClassificationCounts();

  report.reconciliation = {
    profiles: countRows("profiles"),
    partner_commissions: countRows("partner_commissions"),
    partner_financial_ledger_entries: countRows("partner_financial_ledger_entries"),
    partner_withdrawals: countRows("partner_withdrawals"),
    partner_wallet_ledger: countRows("partner_wallet_ledger"),
    subscription_requests: countRows("subscription_requests"),
    partners: countRows("partners"),
    accountStatus: runSql(`
SELECT coalesce(account_status, 'null') AS status, count(*)::int AS count
FROM public.profiles GROUP BY 1 ORDER BY 1;
`),
  };

  report.migrationHistory = migrationHistory();
  report.pass =
    columnExists() &&
    Number(report.backfillSecond?.updated_count ?? 0) === 0 &&
    report.baseline.profiles === report.reconciliation.profiles &&
    report.baseline.partner_commissions === report.reconciliation.partner_commissions &&
    report.baseline.subscription_requests === report.reconciliation.subscription_requests &&
    report.baseline.partners === report.reconciliation.partners;

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
