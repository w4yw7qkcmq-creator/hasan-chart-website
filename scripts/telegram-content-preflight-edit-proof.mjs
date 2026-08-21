#!/usr/bin/env node
/**
 * Prove edit path: edited_channel_post → same DB row → page fresh within seconds.
 * STAGING ONLY (webhook delivery mimics Telegram edit ingress).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadStagingEnvFile, getStagingSupabaseClientOptions } from "../lib/load-staging-env.js";
import { createClient } from "@supabase/supabase-js";

const STAGING_WEB =
  process.env.TELEGRAM_CONTENT_STAGING_WEB ||
  "https://hasan-chart-website-staging-staging.up.railway.app";
const ACADEMY_CHANNEL = -1001906943855;

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

async function fetchAcademy() {
  const res = await fetch(`${STAGING_WEB}/academy?t=${Date.now()}`, { cache: "no-store" });
  return res.text();
}

async function main() {
  loadStagingEnvFile();
  const staging = getStagingSupabaseClientOptions();
  const admin = createClient(staging.url, staging.serviceRoleKey, { auth: { persistSession: false } });
  const secrets = parseEnvFile(resolve(process.cwd(), ".env.staging.telegram.local"));
  const secret = secrets.TELEGRAM_CONTENT_WEBHOOK_SECRET;

  const marker = `PREFLIGHT-EDIT-${Date.now()}`;
  const { data: target } = await admin
    .from("telegram_content_posts")
    .select("id, telegram_message_id, body, public_slug")
    .eq("section", "academy")
    .eq("public_slug", "tg-ac-70")
    .maybeSingle();

  if (!target) {
    console.error("FAIL target post tg-ac-70 not found");
    process.exitCode = 1;
    return;
  }

  const beforeCount = await admin
    .from("telegram_content_posts")
    .select("id", { count: "exact", head: true })
    .eq("section", "academy")
    .eq("sync_status", "published")
    .eq("qualification_status", "eligible");

  const editedText = `${target.body}\n\n${marker}\n\nتعديل عربي: السطر الثاني\n\n#edit`;
  const editAt = Date.now();

  const res = await fetch(`${STAGING_WEB}/api/webhooks/telegram-content`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-bot-api-secret-token": secret,
    },
    body: JSON.stringify({
      update_id: Date.now(),
      edited_channel_post: {
        message_id: target.telegram_message_id,
        chat: { id: ACADEMY_CHANNEL, type: "channel", title: "HasaN CharT Academy" },
        date: Math.floor(Date.now() / 1000),
        edit_date: Math.floor(Date.now() / 1000),
        text: editedText,
      },
    }),
  });
  const ingress = await res.json().catch(() => ({}));
  if (res.status !== 200 || !ingress.success) {
    console.error("FAIL edit webhook", res.status, ingress);
    process.exitCode = 1;
    return;
  }

  let pageSeenAt = null;
  const detailPath = `/academy/${target.public_slug}`;
  const deadline = editAt + 30000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const listHtml = await fetchAcademy();
    const detailRes = await fetch(`${STAGING_WEB}${detailPath}?t=${Date.now()}`, { cache: "no-store" });
    const detailHtml = await detailRes.text();
    if (detailHtml.includes(marker) || listHtml.includes(marker)) {
      pageSeenAt = Date.now();
      break;
    }
  }

  const { data: afterRow } = await admin
    .from("telegram_content_posts")
    .select("id, body")
    .eq("id", target.id)
    .single();

  const { count: afterCount } = await admin
    .from("telegram_content_posts")
    .select("id", { count: "exact", head: true })
    .eq("section", "academy")
    .eq("sync_status", "published")
    .eq("qualification_status", "eligible");

  const report = {
    result: pageSeenAt && afterRow?.body?.includes(marker) ? "PASS" : "FAIL",
    postId: target.id,
    sameRow: afterRow?.id === target.id,
    noDuplicate: afterCount === beforeCount.count,
    editToPageMs: pageSeenAt ? pageSeenAt - editAt : null,
    marker,
  };

  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.result === "PASS" ? 0 : 1;
}

main().catch((e) => {
  console.error("FAIL", e?.message || e);
  process.exitCode = 1;
});
