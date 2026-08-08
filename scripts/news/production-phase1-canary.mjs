#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const require = createRequire(import.meta.url);
const {
  createNewsPublisherGateway,
  PUBLICATION_TYPES,
  SOURCE_TYPES,
  BLOCK_REASONS,
} = require("../../worker/lib/news-intelligence/index.js");
const { detectNumericEconomicReleaseCandidate } = require("../../worker/lib/news-intelligence/economic-event-detector.js");
const { isProductionRuntime, allowMemoryIdempotencyFallback } = require("../../worker/lib/news-intelligence/runtime-mode.js");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function noopDelivery() {
  return { ok: true };
}

async function main() {
  assert.ok(SUPABASE_URL, "SUPABASE_URL missing");
  assert.ok(SERVICE_KEY, "SUPABASE_SERVICE_ROLE_KEY missing");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const canaryKey = `CANARY:NEWS_INTELLIGENCE:${Date.now()}`;
  const gatewayReleaseDate = new Date().toISOString();
  const gatewayReleaseDateAlt = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
  const results = {
    canaryKey,
    runtimeMode: isProductionRuntime({ runtimeMode: "production" }) ? "production" : "non-production",
    memoryFallbackAllowed: allowMemoryIdempotencyFallback({ runtimeMode: "production" }),
    idempotencyStore: "database",
    memoryFallback: false,
  };

  const firstInsert = await supabase.from("news_event_publications").insert({
    event_key: canaryKey,
    publication_type: "RELEASE",
    source_type: "canary",
    source_id: "phase1-canary",
    metadata: { canary: true },
    telegram_leg_status: "pending",
    site_leg_status: "pending",
  }).select("id, event_key, publication_type").maybeSingle();

  assert.equal(firstInsert.error, null, `first insert failed: ${firstInsert.error?.message || "unknown"}`);
  results.firstInsert = "success";

  const duplicateInsert = await supabase.from("news_event_publications").insert({
    event_key: canaryKey,
    publication_type: "RELEASE",
    source_type: "canary",
    source_id: "phase1-canary-dup",
    metadata: { canary: true, attempt: 2 },
  });

  assert.ok(duplicateInsert.error, "duplicate insert should fail");
  assert.equal(duplicateInsert.error.code, "23505", `expected 23505 got ${duplicateInsert.error.code}`);
  results.duplicateInsert = "blocked_23505";

  const { count, error: countError } = await supabase
    .from("news_event_publications")
    .select("id", { count: "exact", head: true })
    .eq("event_key", canaryKey)
    .eq("publication_type", "RELEASE");
  assert.equal(countError, null);
  assert.equal(count, 1);
  results.uniqueRowsForCanaryKey = count;

  const gateway = createNewsPublisherGateway({
    supabase,
    runtimeMode: "production",
  });

  const body =
    "🟥 صدر الآن :\n\n📊 أمريكا - 🇺🇸\n💵 طلبات إعانة البطالة الأمريكية\n\n" +
    "▪️ السابق : 197K\n▪️ المتوقع : 203K\n▫️ الحالي : 199K\n\n" +
    "⬅️ النتيجة : تأثير محدود\n\n📚 لمتابعة أخبار الأسهم والذهب والعملات انضم للقناة:\nhttps://t.me/EconomicNewsi ✅";

  const basePublication = {
    eventType: "US_INITIAL_JOBLESS_CLAIMS",
    publicationType: PUBLICATION_TYPES.RELEASE,
    country: "US",
    releaseDate: gatewayReleaseDate,
    title: "CANARY Jobless Claims",
    body,
    bodySource: "formatted",
    destination: "both",
    sourceLink: `canary-gateway:${Date.now()}`,
    facts: { actual: "199K", forecast: "203K", previous: "197K" },
  };

  const approved = await gateway.publish(
    {
      ...basePublication,
      sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
      sourceId: "ForexBreakingNews",
      sourceLink: `canary-gateway-approved:${Date.now()}`,
    },
    { dryRun: true, sendTelegramMessage: noopDelivery, saveNewsPostToSupabase: noopDelivery }
  );
  assert.equal(approved.dryRun, true);
  results.gatewayApprovedTelegramDryRun = "allowed";

  const duplicateGateway = await gateway.publish(
    {
      ...basePublication,
      sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
      sourceId: "ForexBreakingNews",
      sourceLink: `canary-gateway-dup:${Date.now()}`,
    },
    { dryRun: true, sendTelegramMessage: noopDelivery, saveNewsPostToSupabase: noopDelivery }
  );
  assert.equal(duplicateGateway.blocked, true);
  assert.equal(duplicateGateway.reason, BLOCK_REASONS.DUPLICATE_BLOCKED);
  results.gatewayDuplicateBlocked = duplicateGateway.reason;

  const rssBlocked = await gateway.publish(
    {
      ...basePublication,
      sourceType: SOURCE_TYPES.RSS_GENERAL,
      sourceLink: `canary-gateway-rss:${Date.now()}`,
    },
    { dryRun: true }
  );
  assert.equal(rssBlocked.blocked, true);
  assert.equal(rssBlocked.reason, BLOCK_REASONS.RSS_ECONOMIC_PUBLISH_FORBIDDEN);
  results.rssBlocked = rssBlocked.reason;

  const unapproved = await gateway.publish(
    {
      ...basePublication,
      sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
      sourceId: "FakeChannel",
      sourceLink: `canary-gateway-fake:${Date.now()}`,
      releaseDate: gatewayReleaseDateAlt(86400000),
    },
    { dryRun: true }
  );
  assert.equal(unapproved.blocked, true);
  assert.equal(unapproved.reason, BLOCK_REASONS.ECONOMIC_SOURCE_NOT_ALLOWED);
  results.unapprovedTelegramBlocked = unapproved.reason;

  const manualBlocked = await gateway.publish(
    {
      ...basePublication,
      sourceType: SOURCE_TYPES.MANUAL_API,
      sourceId: "ForexBreakingNews",
      sourceLink: `canary-gateway-manual:${Date.now()}`,
      releaseDate: gatewayReleaseDateAlt(172800000),
    },
    { dryRun: true }
  );
  assert.equal(manualBlocked.blocked, true);
  assert.equal(manualBlocked.reason, BLOCK_REASONS.MANUAL_ECONOMIC_PUBLISH_FORBIDDEN);
  results.manualBlocked = manualBlocked.reason;

  const rawBlocked = await gateway.publish(
    {
      ...basePublication,
      body: "Initial Jobless Claims previous 197K forecast 203K actual 199K",
      rawSourceText: "Initial Jobless Claims previous 197K forecast 203K actual 199K",
      sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
      sourceId: "ForexBreakingNews",
      sourceLink: `canary-gateway-raw:${Date.now()}`,
      releaseDate: gatewayReleaseDateAlt(259200000),
    },
    { dryRun: true }
  );
  assert.equal(rawBlocked.blocked, true);
  results.rawBlocked = rawBlocked.reason;

  const factBlocked = await gateway.publish(
    {
      ...basePublication,
      facts: { actual: "209K", forecast: "203K", previous: "197K" },
      sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
      sourceId: "ForexBreakingNews",
      sourceLink: `canary-gateway-fact:${Date.now()}`,
      releaseDate: gatewayReleaseDateAlt(345600000),
    },
    { dryRun: true }
  );
  assert.equal(factBlocked.blocked, true);
  assert.equal(factBlocked.reason, BLOCK_REASONS.FACT_INTEGRITY_FAILED);
  results.factBlocked = factBlocked.reason;

  const detector = detectNumericEconomicReleaseCandidate({
    title: "US CPI m/m",
    text: "Previous 0.2% Forecast 0.3% Actual 0.4%",
    releaseDate: "2026-08-06T12:30:00.000Z",
  });
  assert.equal(detector.isNumericEconomicCandidate, true);
  results.detectorNumericEconomic = true;

  console.log("PRODUCTION_PHASE1_CANARY_PASS", JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error("PRODUCTION_PHASE1_CANARY_FAIL", error);
  process.exit(1);
});
