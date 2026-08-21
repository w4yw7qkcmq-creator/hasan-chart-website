#!/usr/bin/env node
/**
 * Phase 3 — Staging public read validation against live Staging Supabase.
 * STAGING ONLY.
 */
import { createClient } from "@supabase/supabase-js";
import { loadStagingEnvFile, getStagingSupabaseClientOptions } from "../lib/load-staging-env.js";
import {
  STAGING_SUPABASE_PROJECT_REF,
  maskProjectRef,
} from "../lib/staging-env-guard.js";
import { fetchEligibleTelegramPosts } from "../lib/public-section-feed/telegram-fetch.js";
import { fetchTelegramDailyAnalysisItems } from "../lib/public-section-feed/index.js";
import { fetchPublishedContentPosts } from "../lib/content-posts.js";

loadStagingEnvFile();
const stagingOpts = getStagingSupabaseClientOptions();
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = stagingOpts.url;
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = stagingOpts.anonKey;
}

const report = { checks: [], errors: [] };

function pass(name, detail = {}) {
  report.checks.push({ name, status: "PASS", ...detail });
  console.log(`PASS ${name}`, detail.count != null ? `(n=${detail.count})` : "");
}

function fail(name, detail = {}) {
  report.errors.push({ name, ...detail });
  report.checks.push({ name, status: "FAIL", ...detail });
  console.error(`FAIL ${name}`, detail);
}

console.log("Staging project:", maskProjectRef(STAGING_SUPABASE_PROJECT_REF));

try {
  for (const section of ["daily_analysis", "academy", "result"]) {
    const rows = await fetchEligibleTelegramPosts(section);
    if (rows.length > 0) {
      pass(`telegram_fetch_${section}`, { count: rows.length, sample: rows[0]?.public_slug });
    } else {
      fail(`telegram_fetch_${section}`, { reason: "zero eligible rows" });
    }
  }

  const daily = await fetchTelegramDailyAnalysisItems();
  if (daily.length > 0 && daily.every((d) => d.source === "telegram" && !("symbol" in d))) {
    pass("daily_adapter_no_fake_metadata", { count: daily.length });
  } else {
    fail("daily_adapter_no_fake_metadata", { count: daily.length });
  }

  for (const [type, section] of [
    ["academy", "academy"],
    ["result", "result"],
  ]) {
    const merged = await fetchPublishedContentPosts(type);
    const telegramCount = merged.filter((p) => p.source === "telegram").length;
    if (telegramCount > 0) {
      pass(`merged_${section}`, { total: merged.length, telegram: telegramCount });
    } else {
      fail(`merged_${section}`, { reason: "no telegram in merged feed" });
    }
  }
} catch (error) {
  fail("unexpected", { message: error?.message || String(error) });
}

console.log("\n--- SUMMARY ---");
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.errors.length > 0 ? 1 : 0;
