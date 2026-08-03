#!/usr/bin/env node
/**
 * Static verification for Enterprise E2E infrastructure (no smoke execution).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const E2E_DIR = path.resolve(import.meta.dirname);
const ROOT = path.resolve(E2E_DIR, "../..");

const modules = [
  "constants.mjs",
  "env.mjs",
  "http.mjs",
  "safety.mjs",
  "report.mjs",
  "paths.mjs",
  "metadata.mjs",
  "retry.mjs",
  "visual-regression.mjs",
  "screenshots.mjs",
  "console-capture.mjs",
  "browser-runner.mjs",
  "html-report.mjs",
  "release-gate.mjs",
  "smoke.mjs",
  "provision.mjs",
];

const requiredScripts = [
  "smoke",
  "smoke:local",
  "smoke:staging",
  "smoke:production",
  "e2e:smoke",
  "e2e:provision",
  "e2e:verify",
];

let failed = 0;

function ok(msg) {
  console.log(`✓ ${msg}`);
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  failed += 1;
}

console.log("Enterprise E2E Infrastructure — static verify\n");

for (const file of modules) {
  const full = path.join(E2E_DIR, file);
  if (!fs.existsSync(full)) {
    fail(`missing ${file}`);
    continue;
  }
  try {
    execSync(`node --check "${full}"`, { stdio: "pipe" });
    ok(`syntax ${file}`);
  } catch (error) {
    fail(`syntax ${file}: ${error.message}`);
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
for (const script of requiredScripts) {
  if (pkg.scripts?.[script]) ok(`npm script ${script}`);
  else fail(`npm script missing: ${script}`);
}

for (const dep of ["pixelmatch", "pngjs", "playwright"]) {
  if (pkg.devDependencies?.[dep]) ok(`devDependency ${dep}`);
  else fail(`devDependency missing: ${dep}`);
}

const dirs = [
  path.join(E2E_DIR, ".baseline"),
  path.join(E2E_DIR, ".artifacts", "screenshots"),
  path.join(E2E_DIR, ".artifacts", "reports"),
  path.join(E2E_DIR, ".artifacts", "logs"),
  path.join(E2E_DIR, ".artifacts", "json"),
];

for (const dir of dirs) {
  fs.mkdirSync(dir, { recursive: true });
  ok(`dir ${path.relative(E2E_DIR, dir)}`);
}

try {
  await import("./env.mjs");
  await import("./report.mjs");
  await import("./paths.mjs");
  await import("./release-gate.mjs");
  ok("core imports");

  const { evaluateReleaseGate } = await import("./release-gate.mjs");
  const mockGate = evaluateReleaseGate({
    steps: [{ id: "health", name: "Health", status: "PASS", note: "readiness=ready" }],
    summary: { PASS: 1, FAIL: 0, BLOCKED: 0, VERIFY_ONLY: 0, MANUAL_REQUIRED: 0 },
    metadata: { environment: "verify", gitCommit: "test", gitBranch: "test", durationMs: 100 },
  });
  if (mockGate.verdict && typeof mockGate.score === "number") ok("release gate evaluate (mock)");
  else fail("release gate evaluate returned invalid result");
} catch (error) {
  fail(`import error: ${error.message}`);
}

console.log(failed ? `\nVerify FAILED (${failed})` : "\nVerify PASS");
process.exit(failed ? 1 : 0);
