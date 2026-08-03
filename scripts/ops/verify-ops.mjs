#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OPS_DIR = path.resolve(import.meta.dirname);
const ROOT = path.resolve(OPS_DIR, "../..");
let failed = 0;

function ok(m) { console.log(`✓ ${m}`); }
function fail(m) { console.error(`✗ ${m}`); failed++; }

const modules = [
  "config.mjs", "paths.mjs", "artifact-reader.mjs", "platform.mjs", "generate.mjs",
  "engines/dependencies.mjs", "engines/slo.mjs", "engines/alerts.mjs",
  "engines/deployment.mjs", "engines/incidents.mjs", "render/html.mjs",
];

console.log("Enterprise Operations — static verify\n");

for (const f of modules) {
  const full = path.join(OPS_DIR, f);
  if (!fs.existsSync(full)) { fail(`missing ${f}`); continue; }
  try { execSync(`node --check "${full}"`, { stdio: "pipe" }); ok(`syntax ${f}`); }
  catch (e) { fail(`syntax ${f}`); }
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
for (const s of ["ops:generate", "ops:verify"]) {
  if (pkg.scripts?.[s]) ok(`npm script ${s}`); else fail(`missing ${s}`);
}

const docs = [
  "docs/runbooks/runbooks-index.md",
  "docs/recovery/recovery-index.md",
  "docs/incidents/incident-template.md",
  "docs/checklists/release-checklist.md",
  "docs/checklists/launch-checklist.md",
  "docs/checklists/operational-checklist.md",
];
for (const d of docs) {
  if (fs.existsSync(path.join(OPS_DIR, d))) ok(`doc ${d}`); else fail(`missing ${d}`);
}

try {
  const { buildOpsPlatform } = await import("./platform.mjs");
  const p = buildOpsPlatform();
  if (p.version && p.executiveDashboard) ok("platform build (no services)");
  else fail("platform build invalid");
} catch (e) { fail(`platform: ${e.message}`); }

console.log(failed ? `\nVerify FAILED (${failed})` : "\nVerify PASS");
process.exit(failed ? 1 : 0);
