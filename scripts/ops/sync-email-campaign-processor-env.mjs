#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const SOURCE = "email-queue-worker";
const TARGET = "email-campaign-processor";
const COPY_KEYS = [
  "CRON_SECRET",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
];

function railwayJson(args) {
  const r = spawnSync("npx", ["@railway/cli", ...args], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status || 1);
  }
  return JSON.parse(r.stdout || "{}");
}

function setVar(service, key, value) {
  const r = spawnSync(
    "npx",
    ["@railway/cli", "variable", "set", `${key}=${value}`, "--service", service],
    { encoding: "utf8" }
  );
  if (r.status !== 0) {
    console.error(`Failed to set ${key} on ${service}`);
    console.error(r.stderr || r.stdout);
    process.exit(1);
  }
}

const sourceVars = railwayJson(["variables", "--json", "--service", SOURCE]);
for (const key of COPY_KEYS) {
  if (!sourceVars[key]) {
    console.error(`Missing ${key} on ${SOURCE}`);
    process.exit(1);
  }
}

setVar(TARGET, "EMAIL_CAMPAIGN_PROCESSOR_ENABLED", "true");
setVar(TARGET, "EMAIL_CAMPAIGN_POLL_INTERVAL_MS", "5000");
for (const key of COPY_KEYS) {
  setVar(TARGET, key, sourceVars[key]);
}

console.log(`Synced ${COPY_KEYS.length + 2} variables to ${TARGET}`);
