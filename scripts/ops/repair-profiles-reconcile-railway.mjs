#!/usr/bin/env node
/**
 * Sync Railway profiles-last-sign-in-reconcile service:
 * - start command via npm script (correct caller)
 * - required env from web service
 *
 * Usage: node scripts/ops/repair-profiles-reconcile-railway.mjs
 */
import { spawnSync } from "node:child_process";

const SERVICE = "profiles-last-sign-in-reconcile";
const SOURCE = "hasan-chart-website";
const COPY_KEYS = [
  "PRODUCTION_URL",
  "WEB_APP_URL",
  "NEXT_PUBLIC_SITE_URL",
  "IAM_CRON_SERVICE_ACCOUNT_ID",
  "IAM_CRON_SERVICE_SECRET",
  "CRON_SECRET",
];

function railway(args) {
  const r = spawnSync("npx", ["@railway/cli@latest", ...args], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status || 1);
  }
  return (r.stdout || "").trim();
}

function setVar(service, key, value) {
  const r = spawnSync(
    "npx",
    ["@railway/cli@latest", "variable", "set", `${key}=${value}`, "--service", service],
    { encoding: "utf8" }
  );
  if (r.status !== 0) {
    console.error(`Failed to set ${key} on ${service}`);
    console.error(r.stderr || r.stdout);
    process.exit(1);
  }
}

const sourceVars = JSON.parse(railway(["variables", "--json", "--service", SOURCE]));

if (!sourceVars.PRODUCTION_URL && !sourceVars.WEB_APP_URL && sourceVars.NEXT_PUBLIC_SITE_URL) {
  setVar(SERVICE, "PRODUCTION_URL", sourceVars.NEXT_PUBLIC_SITE_URL);
}

for (const key of COPY_KEYS) {
  if (sourceVars[key]) {
    setVar(SERVICE, key, sourceVars[key]);
  }
}

setVar(
  SERVICE,
  "RAILWAY_START_COMMAND",
  "node profiles-last-sign-in-reconcile-cron-caller.js"
);

console.log(`Repaired ${SERVICE}: env synced from ${SOURCE}, start command documented.`);
console.log(
  "Ensure Railway service Config File = railway.profiles-last-sign-in-cron.toml and Root Directory = worker"
);
