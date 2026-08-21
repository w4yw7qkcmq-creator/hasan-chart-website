#!/usr/bin/env node
/**
 * Phase 3 — prove webhook publish → cache invalidation → public page refresh (no redeploy).
 * STAGING ONLY. Uses synthetic channel_post delivery (same ingress path as human posts).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadStagingEnvFile } from "../lib/load-staging-env.js";

const STAGING_WEB =
  process.env.TELEGRAM_CONTENT_STAGING_WEB ||
  "https://hasan-chart-website-staging-staging.up.railway.app";
const ACADEMY_CHANNEL = -1001906943855;
const MARKER = `PHASE3-REVALIDATE-${Date.now()}`;

function parseEnvFile(path) {
  const values = {};
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) values[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return values;
}

async function fetchAcademyHtml() {
  const res = await fetch(`${STAGING_WEB}/academy`, { cache: "no-store" });
  return res.text();
}

async function deliver(secret, message) {
  const res = await fetch(`${STAGING_WEB}/api/webhooks/telegram-content`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-bot-api-secret-token": secret,
    },
    body: JSON.stringify({ update_id: Date.now(), channel_post: message }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function main() {
  loadStagingEnvFile();
  const secrets = parseEnvFile(resolve(process.cwd(), ".env.staging.telegram.local"));
  const secret = secrets.TELEGRAM_CONTENT_WEBHOOK_SECRET;
  if (!secret) {
    console.error("FAIL missing webhook secret");
    process.exitCode = 1;
    return;
  }

  const beforeHtml = await fetchAcademyHtml();
  if (beforeHtml.includes(MARKER)) {
    console.error("FAIL marker already present before test");
    process.exitCode = 1;
    return;
  }

  const messageId = 900000000 + Math.floor(Math.random() * 99999);
  const message = {
    message_id: messageId,
    chat: { id: ACADEMY_CHANNEL, type: "channel", title: "HasaN CharT Academy" },
    date: Math.floor(Date.now() / 1000),
    text: `${MARKER}\n\nاختبار إعادة التحقق Phase 3 — نص عربي\n\n#test`,
  };

  const ingress = await deliver(secret, message);
  if (ingress.status !== 200 || !ingress.body?.success) {
    console.error("FAIL webhook ingress", ingress);
    process.exitCode = 1;
    return;
  }
  console.log("PASS webhook_ingress", { messageId, outcome: ingress.body?.outcome });

  const deadline = Date.now() + 45000;
  let afterHtml = beforeHtml;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    afterHtml = await fetchAcademyHtml();
    if (afterHtml.includes(MARKER)) {
      console.log("PASS academy_page_shows_new_post_without_redeploy", { marker: MARKER });
      console.log("PHASE 3 REVALIDATION: PASS");
      return;
    }
  }

  console.error("FAIL academy page did not show marker within timeout");
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("FAIL", error?.message || error);
  process.exitCode = 1;
});
