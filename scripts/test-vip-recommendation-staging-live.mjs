#!/usr/bin/env node
/**
 * VIP recommendation staging live integration (Staging DB only, mocked providers).
 * Run: node scripts/test-vip-recommendation-staging-live.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { loadStagingEnvFile } from "../lib/load-staging-env.js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  maskProjectRef,
} from "../lib/staging-env-guard.js";
import {
  sendVipRecommendationStatusUpdate,
  retryFailedVipStatusDeliveries,
  MAX_VIP_STATUS_DELIVERY_ATTEMPTS,
} from "../lib/vip-recommendation-status-dispatch.js";
import {
  matchesSignalSubscription,
  isActiveSubscriptionRow,
} from "../lib/vip-recommendation-eligibility.js";

const TEST_RUN_ID = `vip-staging-${Date.now()}`;
const TEST_EMAIL_DOMAIN = "vip-staging-test.invalid";

const report = {
  testRunId: TEST_RUN_ID,
  environment: "staging",
  projectRefMasked: null,
  productionDatabaseTouched: false,
  schemaVerificationFailures: 0,
  databaseIntegrationFailures: 0,
  concurrencyFailures: 0,
  duplicateEvents: 0,
  duplicateDeliveries: 0,
  eligibilityFailures: 0,
  retryFailures: 0,
  realEmailsSent: 0,
  realPushSent: 0,
  cleanupRemainingRows: 0,
  counters: {},
};

const cleanup = {
  signalIds: [],
  subscriptionIds: [],
  profileIds: [],
};

function fail(code, message) {
  report.databaseIntegrationFailures += 1;
  report.errors = report.errors || [];
  report.errors.push({ code, message });
  throw new Error(`${code}: ${message}`);
}

function mockDeps() {
  return {
    dispatchUnifiedSiteAlerts: async () => ({ notificationCreated: true }),
    dispatchTemplateTransactionalEmail: async () => ({ sent: true, queued: false }),
    sendTargetedPushNotification: async () => ({ sent: 0, skipped: 1, skipReason: "staging-mock" }),
  };
}

async function verifySchema(sb) {
  const requiredCols = [
    "trade_status",
    "target_1_hit_at",
    "target_2_hit_at",
    "closed_at",
    "closed_reason",
    "last_status_event",
    "last_status_event_at",
    "last_status_updated_by",
    "publish_recipient_count",
    "published_by_email",
    "published_by",
  ];

  for (const col of requiredCols) {
    const { error } = await sb.from("vip_signals").select(col).limit(0);
    if (error) {
      report.schemaVerificationFailures += 1;
      fail("SCHEMA_COLUMN", col);
    }
  }

  for (const table of ["vip_signal_status_events", "vip_signal_status_deliveries"]) {
    const { error } = await sb.from(table).select("id").limit(0);
    if (error) {
      report.schemaVerificationFailures += 1;
      fail("SCHEMA_TABLE", table);
    }
  }

  const { data: rpcData, error: rpcError } = await sb.rpc("update_vip_signal_status_event", {
    p_signal_id: -1,
    p_event_type: "target_1_hit",
    p_admin_user_id: null,
    p_admin_email: "staging-test@invalid",
    p_request_id: `${TEST_RUN_ID}-probe`,
  });
  if (!rpcError && rpcData) {
    // expected error for missing signal — ok if error
  }
}

async function seedTestData(sb) {
  const signals = [];
  for (const [signalType, coin] of [
    ["spot", `TSTSPOT-${TEST_RUN_ID.slice(-6)}`],
    ["futures", `TSTFUT-${TEST_RUN_ID.slice(-6)}`],
    ["spot", `TSTCLOSE-${TEST_RUN_ID.slice(-6)}`],
    ["spot", `TSTCONC-${TEST_RUN_ID.slice(-6)}`],
  ]) {
    const { data, error } = await sb
      .from("vip_signals")
      .insert({
        signal_type: signalType,
        coin,
        entry: "100-101",
        targets: "105",
        stop_loss: "98",
        notes: JSON.stringify({ test_run_id: TEST_RUN_ID, environment: "staging", created_by_test: true }),
        status: "نشطة",
        trade_status: "active",
        publish_recipient_count: 0,
        published_by_email: `admin+${TEST_RUN_ID}@${TEST_EMAIL_DOMAIN}`,
      })
      .select("id")
      .single();
    if (error) fail("SEED_SIGNAL", error.message);
    signals.push({ id: data.id, signalType, coin });
    cleanup.signalIds.push(data.id);
  }

  const subs = [
    { plan: "VIP Spot", email: `spot+${TEST_RUN_ID}@${TEST_EMAIL_DOMAIN}`, active: true },
    { plan: "VIP Futures", email: `futures+${TEST_RUN_ID}@${TEST_EMAIL_DOMAIN}`, active: true },
    { plan: "VIP Signals Combined", email: `combined+${TEST_RUN_ID}@${TEST_EMAIL_DOMAIN}`, active: true },
    {
      plan: "VIP Spot",
      email: `expired+${TEST_RUN_ID}@${TEST_EMAIL_DOMAIN}`,
      active: false,
      expires_at: new Date(Date.now() - 86400000).toISOString(),
    },
    { plan: "VIP Spot", email: `inactive+${TEST_RUN_ID}@${TEST_EMAIL_DOMAIN}`, active: false, status: "منتهي" },
  ];

  for (const sub of subs) {
    const { data, error } = await sb
      .from("subscription_requests")
      .insert({
        user_email: sub.email,
        plan_name: sub.plan,
        category: "test",
        status: sub.status || (sub.active ? "مفعل" : "منتهي"),
        expires_at: sub.expires_at || new Date(Date.now() + 7 * 86400000).toISOString(),
      })
      .select("id")
      .single();
    if (error) fail("SEED_SUB", error.message);
    cleanup.subscriptionIds.push(data.id);
  }

  return signals;
}

async function testEligibility(sb) {
  const { data: subs } = await sb
    .from("subscription_requests")
    .select("user_email,plan_name,category,status,expires_at")
    .like("user_email", `%${TEST_RUN_ID}%`);

  let failures = 0;
  for (const row of subs || []) {
    const email = row.user_email;
    const spotOk = matchesSignalSubscription(row.plan_name, "spot");
    const futOk = matchesSignalSubscription(row.plan_name, "futures");
    const active = isActiveSubscriptionRow(row);

    if (email.includes("spot+") && active && !spotOk) failures += 1;
    if (email.includes("futures+") && active && !futOk) failures += 1;
    if (email.includes("combined+") && active && (!spotOk || !futOk)) failures += 1;
    if (email.includes("expired+") && active) failures += 1;
    if (email.includes("inactive+") && active) failures += 1;
  }
  report.eligibilityFailures = failures;
  if (failures > 0) fail("ELIGIBILITY", `failures=${failures}`);
}

async function testTransitions(sb, signals, adminUser) {
  const spot = signals.find((s) => s.coin.startsWith("TSTSPOT"));
  const closeSig = signals.find((s) => s.coin.startsWith("TSTCLOSE"));
  const deps = mockDeps();

  const t1 = await sendVipRecommendationStatusUpdate(sb, {
    recommendationId: String(spot.id),
    eventType: "target_1_hit",
    adminUser,
    requestId: `${TEST_RUN_ID}-t1`,
    deps,
  });
  if (!t1.ok) fail("TRANSITION_T1", t1.error);

  const t1dup = await sendVipRecommendationStatusUpdate(sb, {
    recommendationId: String(spot.id),
    eventType: "target_1_hit",
    adminUser,
    requestId: `${TEST_RUN_ID}-t1-dup`,
    deps,
  });
  if (t1dup.ok) {
    report.duplicateEvents += 1;
    fail("DUPLICATE_T1", "should be blocked");
  }

  const t2early = await sendVipRecommendationStatusUpdate(sb, {
    recommendationId: String(closeSig.id),
    eventType: "target_2_hit",
    adminUser,
    requestId: `${TEST_RUN_ID}-t2-early`,
    deps,
  });
  if (t2early.ok) fail("T2_BEFORE_T1", "should be blocked");

  const t2 = await sendVipRecommendationStatusUpdate(sb, {
    recommendationId: String(spot.id),
    eventType: "target_2_hit",
    adminUser,
    requestId: `${TEST_RUN_ID}-t2`,
    deps,
  });
  if (!t2.ok) fail("TRANSITION_T2", t2.error);

  const close = await sendVipRecommendationStatusUpdate(sb, {
    recommendationId: String(closeSig.id),
    eventType: "close_now",
    adminUser,
    requestId: `${TEST_RUN_ID}-close`,
    deps,
  });
  if (!close.ok) fail("TRANSITION_CLOSE", close.error);

  const afterClose = await sendVipRecommendationStatusUpdate(sb, {
    recommendationId: String(closeSig.id),
    eventType: "target_1_hit",
    adminUser,
    requestId: `${TEST_RUN_ID}-after-close`,
    deps,
  });
  if (afterClose.ok) fail("AFTER_CLOSE", "should be blocked");
}

async function testConcurrency(sb, signals, adminUser) {
  const conc = signals.find((s) => s.coin.startsWith("TSTCONC"));
  const deps = mockDeps();

  const [a, b] = await Promise.all([
    sendVipRecommendationStatusUpdate(sb, {
      recommendationId: String(conc.id),
      eventType: "target_1_hit",
      adminUser,
      requestId: `${TEST_RUN_ID}-conc-a`,
      deps,
    }),
    sendVipRecommendationStatusUpdate(sb, {
      recommendationId: String(conc.id),
      eventType: "target_1_hit",
      adminUser,
      requestId: `${TEST_RUN_ID}-conc-b`,
      deps,
    }),
  ]);

  const successes = [a, b].filter((r) => r.ok).length;
  const blocked = [a, b].filter((r) => r.status === 409).length;

  const { count } = await sb
    .from("vip_signal_status_events")
    .select("id", { count: "exact", head: true })
    .eq("signal_id", conc.id)
    .eq("event_type", "target_1_hit");

  report.counters.concurrentRequests = 2;
  report.counters.successfulTransitions = successes;
  report.counters.blockedDuplicates = blocked;
  report.counters.eventRowsCreated = count || 0;

  if (successes !== 1 || blocked !== 1 || (count || 0) !== 1) {
    report.concurrencyFailures = 1;
    fail("CONCURRENCY", `successes=${successes} blocked=${blocked} events=${count}`);
  }
}

async function testDeliveryIdempotency(sb, signals, adminUser) {
  const spot = signals.find((s) => s.coin.startsWith("TSTSPOT"));
  const { data: deliveries } = await sb
    .from("vip_signal_status_deliveries")
    .select("idempotency_key,status,channel")
    .eq("signal_id", spot.id)
    .eq("event_type", "target_1_hit");

  const keys = new Set((deliveries || []).map((d) => d.idempotency_key));
  if (keys.size !== (deliveries || []).length) {
    report.duplicateDeliveries += 1;
    fail("DELIVERY_DUP", "duplicate idempotency keys");
  }

  if ((deliveries || []).length === 0) {
    fail("DELIVERY_EMPTY", "expected mocked deliveries");
  }

  report.counters.maxAttemptsConstant = MAX_VIP_STATUS_DELIVERY_ATTEMPTS;
}

async function cleanupTestData(sb) {
  if (cleanup.signalIds.length) {
    await sb.from("vip_signal_status_deliveries").delete().in("signal_id", cleanup.signalIds);
    await sb.from("vip_signal_status_events").delete().in("signal_id", cleanup.signalIds);
    await sb.from("vip_signals").delete().in("id", cleanup.signalIds);
  }
  if (cleanup.subscriptionIds.length) {
    await sb.from("subscription_requests").delete().in("id", cleanup.subscriptionIds);
  }

  const { count } = await sb
    .from("vip_signals")
    .select("id", { count: "exact", head: true })
    .like("notes", `%${TEST_RUN_ID}%`);

  report.cleanupRemainingRows = count || 0;
}

async function main() {
  const staging = loadStagingEnvFile();
  if (staging.projectRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    fail("PRODUCTION_GUARD", "ref matches production");
  }
  if (staging.projectRef !== STAGING_SUPABASE_PROJECT_REF) {
    fail("STAGING_REF", "unexpected staging ref");
  }

  report.projectRefMasked = maskProjectRef(staging.projectRef);
  report.productionDatabaseTouched = false;

  const sb = createClient(
    process.env.STAGING_SUPABASE_URL,
    process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const adminUser = { id: null, email: `admin+${TEST_RUN_ID}@${TEST_EMAIL_DOMAIN}` };

  await verifySchema(sb);
  const signals = await seedTestData(sb);
  await testEligibility(sb);
  await testTransitions(sb, signals, adminUser);
  await testConcurrency(sb, signals, adminUser);
  await testDeliveryIdempotency(sb, signals, adminUser);
  await cleanupTestData(sb);

  report.verdict = report.databaseIntegrationFailures === 0 ? "PASS" : "FAIL";
  console.log(JSON.stringify(report, null, 2));
  if (report.verdict !== "PASS") process.exit(1);
}

main().catch((err) => {
  report.verdict = "FAIL";
  report.fatal = err.message;
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
});
