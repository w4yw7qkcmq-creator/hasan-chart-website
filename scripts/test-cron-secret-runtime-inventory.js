#!/usr/bin/env node
/**
 * B2 — Runtime CRON_SECRET inventory + static guardrails.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function read(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
      walk(full, acc);
      continue;
    }
    if (/\.(js|mjs|cjs|ts|tsx)$/.test(entry)) acc.push(full.slice(ROOT.length + 1));
  }
  return acc;
}

const RUNTIME_ALLOWLIST = new Map([
  ["lib/admin-auth.js", "rollback verifyCronSecret implementation"],
  ["lib/iam/service-identities.js", "rollback legacy cron mapping when IAM_API=false"],
  ["lib/iam/machine-auth.js", "rollback legacy cron path when IAM_API=false"],
  ["worker/worker-security.js", "soak legacy fallback for instant-analysis worker HTTP"],
  ["worker/lib/machine-auth.js", "soak legacy fallback helper for worker HTTP routes"],
  ["lib/instant-analysis-worker.js", "soak outbound legacy bearer to worker"],
  ["scripts/iam/production-service-accounts-provision.mjs", "provisioning docs + rollback notes"],
  ["scripts/iam/production-iam-api-canary.mjs", "canary negative legacy bearer test"],
  ["scripts/iam/production-iam-rls-canary.mjs", "canary negative legacy bearer test"],
  ["scripts/iam/staging-iam-api-hardening-validation.mjs", "staging negative legacy bearer test"],
  ["scripts/iam/staging-api-enforcement.mjs", "staging negative legacy bearer test"],
  ["scripts/iam/b2-staging-closure-validation.mjs", "staging B2 closure legacy fallback probe"],
  ["scripts/iam/b2-production-closure-canary.mjs", "production B2 closure canary probe"],
  ["scripts/iam/production-worker-auth-canary.mjs", "canary legacy probe"],
  ["scripts/staging-worker-auth-live-validation.mjs", "staging legacy probe"],
  ["scripts/preflight-check.js", "env presence check only"],
  ["scripts/preflight-check.cjs", "env presence check only"],
]);

const patterns = [
  { re: /\bverifyCronSecret\s*\(/, label: "verifyCronSecret(" },
  { re: /\bCRON_SECRET\b/, label: "CRON_SECRET" },
  { re: /x-cron-secret/i, label: "x-cron-secret" },
];

const files = walk(ROOT).filter(
  (p) =>
    !p.startsWith("scripts/performance/.artifacts/") &&
    !p.startsWith("scripts/test-cron-secret-runtime-inventory.js") &&
    !p.startsWith("tmp") &&
    !p.includes(".env")
);

const inventory = [];

for (const file of files) {
  const source = read(file);
  for (const pattern of patterns) {
    if (!pattern.re.test(source)) continue;
    const classification = RUNTIME_ALLOWLIST.has(file)
      ? RUNTIME_ALLOWLIST.get(file)
      : file.startsWith("scripts/test-") || file.includes(".test.")
        ? "test-only"
        : file.startsWith("docs/") || file.endsWith(".md")
          ? "documentation"
          : "UNEXPECTED_RUNTIME_USAGE";
    inventory.push({ file, match: pattern.label, classification });
  }
}

const unexpected = inventory.filter((row) => row.classification === "UNEXPECTED_RUNTIME_USAGE");

assert.equal(
  unexpected.length,
  0,
  `Unexpected runtime CRON_SECRET usage:\n${unexpected.map((r) => `- ${r.file} (${r.match})`).join("\n")}`
);

assert.doesNotMatch(read("worker/subscription-maintenance-worker.js"), /function verifyCronSecret/);
assert.doesNotMatch(read("app/api/check-subscription-expiry/route.js"), /verifyCronSecret/);
assert.doesNotMatch(read("app/api/check-price-alerts/route.js"), /verifyCronSecret/);
assert.match(read("app/api/check-subscription-expiry/route.js"), /requireMachineAuth/);
assert.match(read("worker/subscription-maintenance-worker.js"), /verifyWorkerRouteAccess/);
assert.match(read("lib/iam/machine-auth.js"), /legacy_cron_denied_when_iam_api_enabled/);

console.log(`cron-secret runtime inventory: ${inventory.length} references, ${unexpected.length} unexpected`);
console.log("B2 static CRON_SECRET runtime guard PASS");
