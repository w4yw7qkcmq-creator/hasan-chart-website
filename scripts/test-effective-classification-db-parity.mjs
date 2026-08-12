#!/usr/bin/env node
/**
 * DB parity: JS resolveEffectiveUserClassification vs profiles.effective_user_classification column.
 * Staging-only. Requires read-model migration applied.
 */
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveEffectiveUserClassification } from "../lib/user-classification.js";
import { createStagingServiceClient, loadStagingBrowserEnv } from "./iam/staging-admin-auth-resolver.mjs";
import { STAGING_SUPABASE_PROJECT_REF } from "../lib/staging-env-guard.js";

const ROOT = resolve(process.cwd());
const ARTIFACT = join(ROOT, "scripts/.artifacts/effective-classification-db-parity.json");

const EDGE_CASES = [
  {
    label: "admin_manual_real",
    profile: {
      email: "fixture@gmail.com",
      username: "ProdA991",
      user_classification: "real",
      user_classification_source: "admin_manual",
      created_at: "2025-01-01T00:00:00Z",
      last_sign_in_at: "2026-01-01T00:00:00Z",
    },
    js: "real",
  },
  {
    label: "admin_manual_test_over_real_heuristic",
    profile: {
      email: "trader@gmail.com",
      username: "ahmad_trader",
      user_classification: "test",
      user_classification_source: "admin_manual",
      created_at: "2025-01-01T00:00:00Z",
      last_sign_in_at: "2026-01-01T00:00:00Z",
    },
    js: "test",
  },
  {
    label: "stored_unknown_gmail_real",
    profile: {
      email: "trader@gmail.com",
      username: "ahmad_trader",
      user_classification: "unknown",
      created_at: "2025-01-01T00:00:00Z",
      last_sign_in_at: "2026-01-01T00:00:00Z",
    },
    js: "real",
  },
  {
    label: "test_local",
    profile: {
      email: "p-a-123@test.local",
      username: "PartnerA123",
      user_classification: "unknown",
    },
    js: "test",
  },
  {
    label: "suspected_prod_fixture",
    profile: {
      email: "someone@gmail.com",
      username: "ProdA991",
      user_classification: "unknown",
    },
    js: null,
  },
];

async function main() {
  const env = loadStagingBrowserEnv(ROOT);
  assert.equal(env.STAGING_SUPABASE_PROJECT_REF, STAGING_SUPABASE_PROJECT_REF);
  const service = createStagingServiceClient(env);

  const { data: profiles, error } = await service
    .from("profiles")
    .select(
      "id,email,username,role,created_at,last_sign_in_at,user_classification,user_classification_source,effective_user_classification,effective_user_classification_source"
    )
    .limit(5000);
  if (error) throw error;

  const mismatches = [];
  for (const profile of profiles || []) {
    const js = resolveEffectiveUserClassification(profile).classification;
    const db = String(profile.effective_user_classification || "").toLowerCase();
    if (js !== db) {
      mismatches.push({
        id: profile.id,
        email: profile.email,
        js,
        db,
        stored: profile.user_classification,
        storedSource: profile.user_classification_source,
        dbSource: profile.effective_user_classification_source,
      });
    }
  }

  for (const edge of EDGE_CASES) {
    const js = resolveEffectiveUserClassification(edge.profile).classification;
    if (edge.js && js !== edge.js) {
      mismatches.push({ edge: edge.label, expected: edge.js, js });
    }
  }

  const counts = {};
  for (const profile of profiles || []) {
    const key = profile.effective_user_classification || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  const total = (profiles || []).length;
  const sum = Object.values(counts).reduce((a, b) => a + b, 0);

  const report = {
    generatedAt: new Date().toISOString(),
    environment: "staging",
    profilesTotal: total,
    effectiveSumMatchesTotal: sum === total,
    effectiveCounts: counts,
    mismatchCount: mismatches.length,
    mismatches: mismatches.slice(0, 25),
    pass: mismatches.length === 0 && sum === total,
  };

  mkdirSync(join(ROOT, "scripts/.artifacts"), { recursive: true });
  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
