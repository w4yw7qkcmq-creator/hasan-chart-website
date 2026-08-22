"use strict";

const path = require("path");

const SERVICE_NAME = "hasan-chart-email-campaign-processor";

function log(event, extra = {}) {
  console.log(JSON.stringify({ event, service: SERVICE_NAME, timestamp: new Date().toISOString(), ...extra }));
}

function loadEnv() {
  try {
    require("dotenv").config({ path: path.join(__dirname, "../.env.local") });
    require("dotenv").config();
  } catch (_) {}
}

async function runOnce() {
  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "").replace(/\/$/, "");
  const secret = process.env.CRON_SECRET?.trim() || process.env.WORKER_API_SECRET?.trim();

  if (!siteUrl || !secret) {
    throw new Error("Missing NEXT_PUBLIC_SITE_URL or CRON_SECRET for campaign processor caller");
  }

  const response = await fetch(`${siteUrl}/api/cron/process-email-campaigns`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

async function main() {
  loadEnv();

  const enabled = String(process.env.EMAIL_CAMPAIGN_PROCESSOR_ENABLED || "true").toLowerCase();
  if (!["1", "true", "yes"].includes(enabled)) {
    log("EMAIL_CAMPAIGN_PROCESSOR_SKIPPED");
    process.exit(0);
  }

  const pollMs = Math.max(Number(process.env.EMAIL_CAMPAIGN_POLL_INTERVAL_MS || 5000), 2000);
  let cycle = 0;
  let shutdown = false;

  process.on("SIGTERM", () => { shutdown = true; });
  process.on("SIGINT", () => { shutdown = true; });

  log("EMAIL_CAMPAIGN_PROCESSOR_STARTED", { pollMs, mode: "web-cron-bridge" });

  while (!shutdown) {
    cycle += 1;
    const started = Date.now();
    try {
      const result = await runOnce();
      log("EMAIL_CAMPAIGN_PROCESSOR_CYCLE", { cycleNumber: cycle, ...result, durationMs: Date.now() - started });
    } catch (error) {
      log("EMAIL_CAMPAIGN_PROCESSOR_CYCLE_FAILED", { cycleNumber: cycle, error: error.message, durationMs: Date.now() - started });
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

main().catch((error) => {
  log("EMAIL_CAMPAIGN_PROCESSOR_BOOT_FAILED", { error: error.message });
  process.exit(1);
});
