#!/usr/bin/env node
/**
 * Human-origin pre-flight canary monitor.
 * Run BEFORE you publish/edit in Telegram. Polls Staging until marker appears or timeout.
 *
 * Usage:
 *   node scripts/telegram-content-preflight-human-canary.mjs --section academy --mode publish
 *   node scripts/telegram-content-preflight-human-canary.mjs --section academy --mode edit --marker "YOUR-UNIQUE-TEXT"
 */
import { loadStagingEnvFile, getStagingSupabaseClientOptions } from "../lib/load-staging-env.js";
import { createClient } from "@supabase/supabase-js";

const STAGING_WEB =
  process.env.TELEGRAM_CONTENT_STAGING_WEB ||
  "https://hasan-chart-website-staging-staging.up.railway.app";

const SECTION_PATH = {
  daily_analysis: { page: "/daily-analysis", api: "/api/daily-analysis", dbSection: "daily_analysis" },
  academy: { page: "/academy", dbSection: "academy" },
  result: { page: "/results", dbSection: "result" },
};

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { section: "academy", mode: "publish", marker: null, timeoutMs: 600000 };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--section") out.section = args[++i];
    if (args[i] === "--mode") out.mode = args[++i];
    if (args[i] === "--marker") out.marker = args[++i];
    if (args[i] === "--timeout") out.timeoutMs = Number(args[++i]) || out.timeoutMs;
  }
  return out;
}

async function fetchPage(path) {
  const res = await fetch(`${STAGING_WEB}${path}?t=${Date.now()}`, { cache: "no-store" });
  return res.text();
}

async function fetchDailyApi() {
  const res = await fetch(`${STAGING_WEB}/api/daily-analysis`, { cache: "no-store" });
  return res.json();
}

async function main() {
  const opts = parseArgs();
  const cfg = SECTION_PATH[opts.section];
  if (!cfg) {
    console.error("Unknown section:", opts.section);
    process.exitCode = 1;
    return;
  }

  loadStagingEnvFile();
  const staging = getStagingSupabaseClientOptions();
  const admin = createClient(staging.url, staging.serviceRoleKey, {
    auth: { persistSession: false },
  });

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = staging.url;
  }

  console.log("=== Human Canary Monitor ===");
  console.log("Section:", opts.section);
  console.log("Mode:", opts.mode);
  console.log("Staging:", STAGING_WEB);
  console.log("Waiting for human action in Telegram channel...");
  console.log("Publish or edit now. Timeout:", opts.timeoutMs / 1000, "s");
  console.log("");

  const startedAt = Date.now();
  let baselineCount = 0;
  const { count } = await admin
    .from("telegram_content_posts")
    .select("id", { count: "exact", head: true })
    .eq("section", cfg.dbSection)
    .eq("sync_status", "published")
    .eq("qualification_status", "eligible");
  baselineCount = count || 0;

  let lastPostId = null;
  let lastBody = null;
  let publishSeenAt = null;
  let pageSeenAt = null;
  let marker = opts.marker;

  while (Date.now() - startedAt < opts.timeoutMs) {
    const { data: latest } = await admin
      .from("telegram_content_posts")
      .select("id, body, public_slug, published_at, updated_at, telegram_message_id")
      .eq("section", cfg.dbSection)
      .eq("sync_status", "published")
      .eq("qualification_status", "eligible")
      .order("published_at", { ascending: false })
      .limit(1);

    const post = latest?.[0];

    if (opts.mode === "publish" && post) {
      const { count: nowCount } = await admin
        .from("telegram_content_posts")
        .select("id", { count: "exact", head: true })
        .eq("section", cfg.dbSection)
        .eq("sync_status", "published")
        .eq("qualification_status", "eligible");

      const isNew =
        (nowCount || 0) > baselineCount ||
        (post.published_at && new Date(post.published_at).getTime() > startedAt - 5000);

      if (isNew && !publishSeenAt) {
        publishSeenAt = Date.now();
        lastPostId = post.id;
        lastBody = post.body;
        marker = marker || post.body?.slice(0, 80);
        console.log("[DB] New post detected", {
          id: post.id,
          slug: post.public_slug,
          dbLatencyMs: publishSeenAt - startedAt,
        });
      }
    }

    if (opts.mode === "edit" && opts.marker && post?.body?.includes(opts.marker)) {
      if (!lastBody || lastBody !== post.body) {
        if (!publishSeenAt) publishSeenAt = Date.now();
        lastPostId = post.id;
        lastBody = post.body;
        console.log("[DB] Edited body detected", { id: post.id, dbLatencyMs: publishSeenAt - startedAt });
      }
    }

    if (marker) {
      let visible = false;
      if (opts.section === "daily_analysis") {
        const api = await fetchDailyApi();
        const hit = (api.analyses || []).some(
          (a) => a.source === "telegram" && String(a.content || "").includes(marker.slice(0, 40))
        );
        visible = hit;
      } else {
        const html = await fetchPage(cfg.page);
        visible = html.includes(marker.slice(0, 40));
        if (!visible && post?.public_slug) {
          const detail = await fetchPage(`${cfg.page}/${post.public_slug}`);
          visible = detail.includes(marker.slice(0, 40));
        }
      }

      if (visible && !pageSeenAt) {
        pageSeenAt = Date.now();
        console.log("[PAGE] Content visible", {
          pageFreshLatencyMs: pageSeenAt - (publishSeenAt || startedAt),
          totalMs: pageSeenAt - startedAt,
        });
        break;
      }
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  const report = {
    result: pageSeenAt ? "PASS" : "TIMEOUT",
    section: opts.section,
    mode: opts.mode,
    postId: lastPostId,
    marker: marker?.slice(0, 80),
    dbDetectedMs: publishSeenAt ? publishSeenAt - startedAt : null,
    pageVisibleMs: pageSeenAt && publishSeenAt ? pageSeenAt - publishSeenAt : null,
    totalMs: pageSeenAt ? pageSeenAt - startedAt : null,
  };

  console.log("\n=== REPORT ===");
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = pageSeenAt ? 0 : 1;
}

main().catch((e) => {
  console.error("FAIL", e?.message || e);
  process.exitCode = 1;
});
