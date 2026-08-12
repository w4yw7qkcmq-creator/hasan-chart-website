#!/usr/bin/env node
/**
 * Production READ-ONLY audit for user classification inventory.
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { resolveEffectiveUserClassification, USER_CLASSIFICATION } from "../lib/user-classification.js";
import { profileMatchesEffectiveClassification } from "../lib/user-classification-list-filter.js";

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
SELECT id, email, username, role, created_at, last_sign_in_at,
       user_classification, user_classification_source
FROM public.profiles
ORDER BY created_at ASC;
`);

  const storedCounts = Object.fromEntries(Object.values(USER_CLASSIFICATION).map((key) => [key, 0]));
  const effectiveCounts = Object.fromEntries(Object.values(USER_CLASSIFICATION).map((key) => [key, 0]));
  let storedRealFilterCount = 0;
  let effectiveRealFilterCount = 0;

  const examples = {
    test_local: [],
    e2e_patterns: [],
    prod_fixture: [],
    admin_internal: [],
    effective_real_sample: [],
  };

  for (const profile of profiles) {
    const stored = String(profile.user_classification || "unknown").trim().toLowerCase();
    if (storedCounts[stored] !== undefined) {
      storedCounts[stored] += 1;
    } else {
      storedCounts.unknown += 1;
    }
    if (stored === "real") storedRealFilterCount += 1;

    const resolved = resolveEffectiveUserClassification(profile);
    effectiveCounts[resolved.classification] = (effectiveCounts[resolved.classification] || 0) + 1;
    if (profileMatchesEffectiveClassification(profile, "real")) {
      effectiveRealFilterCount += 1;
    }

    const email = String(profile.email || "").toLowerCase();
    const username = String(profile.username || "");

    if (
      resolved.classification === "real" &&
      examples.effective_real_sample.length < 6
    ) {
      examples.effective_real_sample.push({
        email: email.replace(/(^.).*(@.*$)/, "$1***$2"),
        username: username ? `${username.slice(0, 2)}***` : "",
        stored,
        storedSource: profile.user_classification_source || null,
        effective: resolved.classification,
        source: resolved.source,
      });
    }

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

  const effectiveSum = Object.values(effectiveCounts).reduce((sum, value) => sum + value, 0);

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
    storedCounts,
    effectiveCounts,
    effectiveSumMatchesTotal: effectiveSum === profiles.length,
    filterRepro: {
      storedRealSqlFilterWouldReturn: storedRealFilterCount,
      effectiveRealFilterWouldReturn: effectiveRealFilterCount,
      bugPresentBeforeFix: storedRealFilterCount === 0 && effectiveRealFilterCount > 0,
    },
    examples,
    notes: [
      "READ-ONLY audit — no DB writes.",
      "storedCounts reflect profiles.user_classification column only.",
      "effectiveCounts use resolveEffectiveUserClassification authority chain.",
    ],
  };

  mkdirSync(join(ROOT, "scripts/.artifacts"), { recursive: true });
  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main();
