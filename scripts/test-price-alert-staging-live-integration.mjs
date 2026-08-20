#!/usr/bin/env node
/**
 * Staging live integration — isolated fixture rows, mock delivery sinks only.
 * Never sends Production push/email.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";
import { loadStagingEnvFile } from "../lib/load-staging-env.js";
import { assertStagingSupabaseConfig } from "../lib/staging-env-guard.js";

const require = createRequire(import.meta.url);
const { evaluatePriceAlertCondition } = require("../worker/lib/price-alert-condition.js");
const { beginChannelDelivery, finalizeChannelDelivery } = require("../worker/lib/price-alert-delivery-state.js");
const { processRetryableDeliveries } = require("../worker/lib/price-alert-retry-processor.js");

const FIXTURE_ALERT_ID = 999999001;
const FIXTURE_CHANNELS = ["site", "push", "email"];

loadStagingEnvFile();
const staging = assertStagingSupabaseConfig({
  projectRef: process.env.STAGING_SUPABASE_PROJECT_REF,
  url: process.env.STAGING_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
});
const supabase = createClient(staging.url, process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function cleanupFixture() {
  await supabase
    .from("price_alert_delivery_attempts")
    .delete()
    .eq("alert_id", FIXTURE_ALERT_ID);
}

async function main() {
  assert.equal(evaluatePriceAlertCondition({ condition: "above", targetPrice: 1, currentPrice: 2 }).triggered, true);
  assert.equal(evaluatePriceAlertCondition({ condition: "below", targetPrice: 2, currentPrice: 1 }).triggered, true);

  await cleanupFixture();

  const site = await beginChannelDelivery(supabase, { alertId: FIXTURE_ALERT_ID, channel: "site" });
  assert.equal(site.proceed, true);
  await finalizeChannelDelivery(supabase, { alertId: FIXTURE_ALERT_ID, channel: "site", status: "sent" });

  const push = await beginChannelDelivery(supabase, { alertId: FIXTURE_ALERT_ID, channel: "push" });
  assert.equal(push.proceed, true);
  await finalizeChannelDelivery(supabase, {
    alertId: FIXTURE_ALERT_ID,
    channel: "push",
    status: "failed",
    errorCodeSafe: "MOCK_PUSH_FAIL",
    attemptCount: 1,
  });

  const email = await beginChannelDelivery(supabase, { alertId: FIXTURE_ALERT_ID, channel: "email" });
  assert.equal(email.proceed, true);
  await finalizeChannelDelivery(supabase, { alertId: FIXTURE_ALERT_ID, channel: "email", status: "sent" });

  const siteAgain = await beginChannelDelivery(supabase, { alertId: FIXTURE_ALERT_ID, channel: "site" });
  assert.equal(siteAgain.proceed, false);
  assert.equal(siteAgain.reason, "already_sent");

  const { data: pushRow } = await supabase
    .from("price_alert_delivery_attempts")
    .select("id, status, channel")
    .eq("alert_id", FIXTURE_ALERT_ID)
    .eq("channel", "push")
    .maybeSingle();
  assert.ok(pushRow?.id);

  await supabase
    .from("price_alert_delivery_attempts")
    .update({ next_attempt_at: new Date().toISOString(), status: "retryable_failed" })
    .eq("id", pushRow.id);

  const retry = await processRetryableDeliveries(supabase, {
    deliverChannel: async ({ channel }) => {
      assert.equal(channel, "push");
      return { sent: true, providerMessageId: "mock-staging-push" };
    },
    limit: 5,
  });
  assert.equal(retry.ok, true);
  assert.ok(retry.stats.retried >= 1);

  const duplicateRun = await processRetryableDeliveries(supabase, {
    deliverChannel: async () => {
      throw new Error("must not deliver on duplicate run");
    },
    limit: 5,
  });
  assert.equal(duplicateRun.ok, true);
  assert.equal(duplicateRun.stats.retried, 0);

  await cleanupFixture();
  console.log("price alert staging live integration PASS");
}

main().catch(async (error) => {
  try {
    await cleanupFixture();
  } catch (_) {
    // ignore cleanup errors
  }
  console.error(error);
  process.exit(1);
});
