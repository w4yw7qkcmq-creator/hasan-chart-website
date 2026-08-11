#!/usr/bin/env node
/**
 * Production READ-ONLY audit for user classification inventory.
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { resolveUserClassificationSignals } from "../lib/user-classification.js";

const ROOT = resolve(process.cwd());
const ARTIFACT = join(ROOT, "scripts/.artifacts/admin-users-classification-production-audit.json");

function runSql(sql) {
  const tmp = join(ROOT, ".tmp-classification-audit.sql");
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

function main() {
  const linked = JSON.parse(readFileSync(join(ROOT, "supabase/.temp/linked-project.json"), "utf8"));
  if (linked.ref !== "lzgsxdsumnteuwtjfqlm") {
    throw new Error(`Expected production ref lzgsxdsumnteuwtjfqlm, got ${linked.ref}`);
  }

  const profiles = runSql(`
SELECT id, email, username, role, created_at, last_sign_in_at
FROM public.profiles
ORDER BY created_at ASC;
`);

  const counts = {
    real: 0,
    test: 0,
    e2e: 0,
    internal: 0,
    suspected: 0,
    unknown: 0,
  };

  const examples = {
    test_local: [],
    e2e_patterns: [],
    prod_fixture: [],
    admin_internal: [],
  };

  for (const profile of profiles) {
    const resolved = resolveUserClassificationSignals(profile);
    counts[resolved.classification] = (counts[resolved.classification] || 0) + 1;

    const email = String(profile.email || "").toLowerCase();
    const username = String(profile.username || "");

    if (email.endsWith("@test.local") && examples.test_local.length < 8) {
      examples.test_local.push({ email, username, classification: resolved.classification, signals: resolved.signals });
    }
    if ((email.includes("e2e") || email.includes("smoke-e2e")) && examples.e2e_patterns.length < 8) {
      examples.e2e_patterns.push({ email, username, classification: resolved.classification, signals: resolved.signals });
    }
    if (/^ProdA|^PayE2E/i.test(username) && examples.prod_fixture.length < 8) {
      examples.prod_fixture.push({ email, username, classification: resolved.classification, signals: resolved.signals });
    }
    if (profile.role === "admin" && examples.admin_internal.length < 8) {
      examples.admin_internal.push({ email, username, classification: resolved.classification, signals: resolved.signals });
    }
  }

  let columnExists = true;
  try {
    runSql("SELECT user_classification FROM public.profiles LIMIT 1;");
  } catch {
    columnExists = false;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    environment: "production",
    projectRef: linked.ref,
    profilesTotal: profiles.length,
    columnExists,
    computedCounts: counts,
    examples,
    notes: [
      "Computed classification only — no DB writes.",
      "REAL requires multiple positive non-test signals; ambiguous accounts stay UNKNOWN/SUSPECTED.",
    ],
  };

  mkdirSync(join(ROOT, "scripts/.artifacts"), { recursive: true });
  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main();
