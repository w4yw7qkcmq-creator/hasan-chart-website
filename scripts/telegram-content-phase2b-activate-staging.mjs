#!/usr/bin/env node
/**
 * Phase 2B — Configure Staging Telegram Content Sync (secrets from local file only).
 * STAGING ONLY. Never prints token/secret values.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadStagingEnvFile } from "../lib/load-staging-env.js";
import { PRODUCTION_SUPABASE_PROJECT_REF } from "../lib/staging-env-guard.js";

const ROOT = resolve(process.cwd());
const SECRETS_FILE = resolve(ROOT, ".env.staging.telegram.local");
const STAGING_WEB =
  process.env.STAGING_RAILWAY_WEB_URL ||
  "https://hasan-chart-website-staging-staging.up.railway.app";
const SERVICE = "hasan-chart-website-staging";
const RAILWAY_ENV = "staging";

function parseEnvFile(path) {
  const values = {};
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    values[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return values;
}

function setRailwayVar(key, value) {
  const r = spawnSync(
    "npx",
    [
      "@railway/cli@latest",
      "variable",
      "set",
      `${key}=${value}`,
      "--service",
      SERVICE,
      "--environment",
      RAILWAY_ENV,
    ],
    { cwd: ROOT, encoding: "utf8" }
  );
  if (r.status !== 0) {
    throw new Error(`Failed to set ${key}: ${(r.stderr || r.stdout || "").slice(0, 120)}`);
  }
}

function requireKeys(secrets, keys) {
  const missing = keys.filter((k) => !String(secrets[k] || "").trim());
  if (missing.length) {
    throw new Error(`Missing in .env.staging.telegram.local: ${missing.join(", ")}`);
  }
}

async function configureTelegramWebhook(token, webhookSecret) {
  const url = `${STAGING_WEB}/api/webhooks/telegram-content`;
  const params = new URLSearchParams({
    url,
    secret_token: webhookSecret,
    allowed_updates: JSON.stringify(["channel_post", "edited_channel_post"]),
    drop_pending_updates: "true",
  });
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook?${params}`);
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`setWebhook failed: ${data.description || "unknown"}`);
  }
  const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const info = await infoRes.json();
  return {
    url: info?.result?.url || null,
    hasError: Boolean(info?.result?.last_error_message),
    pending: info?.result?.pending_update_count ?? null,
    allowed: info?.result?.allowed_updates || null,
  };
}

async function main() {
  loadStagingEnvFile();
  if (process.env.STAGING_SUPABASE_PROJECT_REF === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("ABORT: staging env matches production");
  }

  const secrets = parseEnvFile(SECRETS_FILE);
  requireKeys(secrets, [
    "TELEGRAM_CONTENT_BOT_TOKEN",
    "TELEGRAM_CONTENT_WEBHOOK_SECRET",
    "TELEGRAM_CONTENT_CHANNEL_DAILY_ANALYSIS",
    "TELEGRAM_CONTENT_CHANNEL_ACADEMY",
    "TELEGRAM_CONTENT_CHANNEL_RESULT",
  ]);

  const keys = [
    "TELEGRAM_CONTENT_BOT_TOKEN",
    "TELEGRAM_CONTENT_WEBHOOK_SECRET",
    "TELEGRAM_CONTENT_CHANNEL_DAILY_ANALYSIS",
    "TELEGRAM_CONTENT_CHANNEL_ACADEMY",
    "TELEGRAM_CONTENT_CHANNEL_RESULT",
  ];

  for (const key of keys) {
    setRailwayVar(key, secrets[key]);
  }

  const webhook = await configureTelegramWebhook(
    secrets.TELEGRAM_CONTENT_BOT_TOKEN,
    secrets.TELEGRAM_CONTENT_WEBHOOK_SECRET
  );

  // Trigger redeploy so vars take effect
  spawnSync(
    "npx",
    ["@railway/cli@latest", "redeploy", "--service", SERVICE, "--environment", RAILWAY_ENV, "--yes"],
    { cwd: ROOT, stdio: "inherit" }
  );

  console.log(
    JSON.stringify(
      {
        stagingWeb: STAGING_WEB,
        railwayVarsSet: keys,
        webhookConfigured: true,
        webhookUrlHost: new URL(STAGING_WEB).host,
        webhookInfo: {
          urlHost: webhook.url ? new URL(webhook.url).host : null,
          path: "/api/webhooks/telegram-content",
          hasError: webhook.hasError,
          pendingUpdates: webhook.pending,
          allowedUpdates: webhook.allowed,
        },
        tokenConfigured: true,
        secretConfigured: true,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
