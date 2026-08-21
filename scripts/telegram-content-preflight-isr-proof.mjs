#!/usr/bin/env node
/**
 * Prove ISR revalidatePath: webhook publish → /academy HTML fresh within seconds (no redeploy).
 * STAGING ONLY.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const STAGING_WEB =
  process.env.TELEGRAM_CONTENT_STAGING_WEB ||
  "https://hasan-chart-website-staging-staging.up.railway.app";
const ACADEMY_CHANNEL = -1001906943855;
const MARKER = `PREFLIGHT-ISR-${Date.now()}`;

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

async function fetchAcademy(cacheBust = false) {
  const url = cacheBust ? `${STAGING_WEB}/academy?t=${Date.now()}` : `${STAGING_WEB}/academy`;
  const res = await fetch(url, { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
  return { status: res.status, html: await res.text(), headers: Object.fromEntries(res.headers) };
}

async function deliver(secret, message) {
  const t0 = Date.now();
  const res = await fetch(`${STAGING_WEB}/api/webhooks/telegram-content`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-bot-api-secret-token": secret,
    },
    body: JSON.stringify({ update_id: Date.now(), channel_post: message }),
  });
  const body = await res.json().catch(() => ({}));
  return { t0, status: res.status, body, webhookMs: Date.now() - t0 };
}

async function main() {
  const secrets = parseEnvFile(resolve(process.cwd(), ".env.staging.telegram.local"));
  const secret = secrets.TELEGRAM_CONTENT_WEBHOOK_SECRET;
  if (!secret) {
    console.error("FAIL missing webhook secret");
    process.exitCode = 1;
    return;
  }

  const before = await fetchAcademy(true);
  if (before.html.includes(MARKER)) {
    console.error("FAIL marker already in page");
    process.exitCode = 1;
    return;
  }

  const messageId = 910000000 + Math.floor(Math.random() * 99999);
  const message = {
    message_id: messageId,
    chat: { id: ACADEMY_CHANNEL, type: "channel", title: "HasaN CharT Academy" },
    date: Math.floor(Date.now() / 1000),
    text: `${MARKER}\n\nاختبار ISR revalidatePath\n\nنص عربي طويل للتحقق من العرض الصحيح بدون تأخير 300 ثانية.`,
  };

  const ingress = await deliver(secret, message);
  if (ingress.status !== 200 || !ingress.body?.success) {
    console.error("FAIL webhook", ingress);
    process.exitCode = 1;
    return;
  }

  const publishAt = ingress.t0;
  const deadline = publishAt + 30000;
  let firstSeenAt = null;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const page = await fetchAcademy(true);
    if (page.html.includes(MARKER)) {
      firstSeenAt = Date.now();
      break;
    }
  }

  if (!firstSeenAt) {
    console.error("FAIL ISR: marker not visible within 30s");
    process.exitCode = 1;
    return;
  }

  const latencyMs = firstSeenAt - publishAt;
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        marker: MARKER,
        webhookMs: ingress.webhookMs,
        pageFreshLatencyMs: latencyMs,
        withinSeconds: latencyMs / 1000,
        target: "<30s (reject 300s ISR stale)",
      },
      null,
      2
    )
  );

  if (latencyMs > 15000) {
    console.error("WARN latency >15s but within 30s cap");
  }
}

main().catch((e) => {
  console.error("FAIL", e?.message || e);
  process.exitCode = 1;
});
