#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";

const CV_DIR = path.resolve(import.meta.dirname);
const ROOT = path.resolve(CV_DIR, "../..");
let failed = 0;
const ok = (m) => console.log(`✓ ${m}`);
const fail = (m) => { console.error(`✗ ${m}`); failed++; };

const modules = [
  "config.mjs", "env.mjs", "paths.mjs", "retry.mjs", "freshness.mjs",
  "scheduler.mjs", "runner.mjs", "report.mjs", "report-engine.mjs",
  "incidents.mjs", "timeline.mjs", "run.mjs",
  "probes/index.mjs", "probes/web-health.mjs", "probes/instant-analysis-health.mjs",
  "probes/order-book.mjs", "probes/news.mjs", "probes/auth-gate.mjs",
  "probes/workers.mjs", "probes/release-gate.mjs", "probes/operational-signals.mjs",
];

console.log("Continuous Verification — static verify\n");

for (const f of modules) {
  try { execSync(`node --check "${path.join(CV_DIR, f)}"`, { stdio: "pipe" }); ok(`syntax ${f}`); }
  catch { fail(`syntax ${f}`); }
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
for (const s of ["cv:verify", "cv:run", "cv:run:production", "cv:checkpoint", "cv:report", "cv:test"]) {
  if (pkg.scripts?.[s]) ok(`npm script ${s}`); else fail(`missing ${s}`);
}

try {
  const { CHECKPOINTS, PROBE_IDS } = await import("./config.mjs");
  if (CHECKPOINTS.length === 6 && PROBE_IDS.length === 8) ok("checkpoint + probe registry");
  else fail("checkpoint/probe count");
} catch (e) { fail(e.message); }

try {
  const { getSchedulerPlan } = await import("./scheduler.mjs");
  const plan = getSchedulerPlan();
  if (plan.checkpoints.length === 6) ok("scheduler plan");
  else fail("scheduler plan");
} catch (e) { fail(e.message); }

try {
  const { loadCvArtifactsForOps } = await import("../ops/cv-reader.mjs");
  ok("ops cv-reader import");
} catch (e) { fail(`ops integration: ${e.message}`); }

try {
  const { evaluatePostDeployCv } = await import("../e2e/release-gate.mjs");
  if (typeof evaluatePostDeployCv === "function") ok("release-gate post-deploy CV");
  else fail("release-gate post-deploy CV missing");
} catch (e) { fail(`release-gate: ${e.message}`); }

if (fs.existsSync(path.join(CV_DIR, "README.md"))) ok("README"); else fail("README");
if (fs.existsSync(path.join(ROOT, ".env.cv.example"))) ok(".env.cv.example"); else fail(".env.cv.example");

console.log(failed ? `\nVerify FAILED (${failed})` : "\nVerify PASS");
process.exit(failed ? 1 : 0);
