#!/usr/bin/env node
/**
 * Forex Staging E2E (Staging DB only). Mocks external providers where needed.
 */
import { createClient } from "@supabase/supabase-js";
import { loadStagingEnvFile } from "../lib/load-staging-env.js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  maskProjectRef,
} from "../lib/staging-env-guard.js";
import { resolveSubscriptionPlan } from "../lib/subscription-plan-registry.js";
import {
  matchesSignalSubscription,
  isActiveSubscriptionRow,
} from "../lib/vip-recommendation-eligibility.js";
import { normalizeAdminUserServiceType } from "../lib/admin-user-service-classifier.js";
import { getSubscriptionDurationDays } from "../lib/admin-subscription-request-activate-shared.js";
import { sendVipRecommendationStatusUpdate } from "../lib/vip-recommendation-status-dispatch.js";

const RUN = `forex-staging-${Date.now()}`;
const EMAIL = `forex-canary+${RUN}@staging-hcw.test`;

const report = {
  runId: RUN,
  productionTargetConfirmedFalse: false,
  stagingProjectRefMasked: null,
  productionMigrationApplied: false,
  forexRequestCreated: false,
  proofPathSet: false,
  adminClassification: null,
  activationOk: false,
  forexActiveSubscriberAllowed: false,
  futuresOnlyDenied: true,
  spotOnlyDenied: true,
  expiredForexDenied: true,
  publishSignalId: null,
  statusEventOk: false,
  cleanupRemainingRows: 0,
  eligibilityFailures: 0,
  errors: [],
};

const cleanup = { subscriptionIds: [], signalIds: [], eventIds: [] };

function mockDeps() {
  return {
    dispatchUnifiedSiteAlerts: async () => ({ notificationCreated: true }),
    dispatchTemplateTransactionalEmail: async () => ({ sent: false, queued: false, duplicate: false }),
    sendTargetedPushNotification: async () => ({ sent: 0, skipped: 1, skipReason: "staging-mock" }),
  };
}

loadStagingEnvFile();
const projectRef = process.env.STAGING_SUPABASE_PROJECT_REF;
report.stagingProjectRefMasked = maskProjectRef(projectRef);
report.productionTargetConfirmedFalse = projectRef !== PRODUCTION_SUPABASE_PROJECT_REF;

if (!report.productionTargetConfirmedFalse) {
  console.error("Refusing to run: staging guard detected production target");
  process.exit(1);
}

const sb = createClient(process.env.STAGING_SUPABASE_URL, process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const plan = resolveSubscriptionPlan({
  plan_name: "فوركس - شهر",
  category: "باقات الفوركس",
  price: "$1",
});
if (!plan.ok || plan.plan.price !== "$99") {
  report.errors.push("PLAN_REGISTRY_FAIL");
  process.exit(1);
}

const durationDays = getSubscriptionDurationDays(plan.plan.planName);
const expiresAt = new Date(Date.now() + durationDays * 86400000).toISOString();

const { data: pendingReq, error: pendingErr } = await sb
  .from("subscription_requests")
  .insert({
    user_email: EMAIL,
    username: `forex_${RUN}`,
    plan_name: plan.plan.planName,
    category: plan.plan.category,
    price: plan.plan.price,
    telegram_username: "@forex_staging",
    payment_network: "BEP20",
    status: "بانتظار المراجعة",
    payment_proof_path: `staging-canary/${RUN}/proof.webp`,
    payment_proof_mime_type: "image/webp",
    payment_proof_size_bytes: 128,
    payment_proof_uploaded_at: new Date().toISOString(),
  })
  .select("id,plan_name,category,price,payment_network,status,payment_proof_path")
  .single();

if (pendingErr) {
  report.errors.push(`PENDING_INSERT:${pendingErr.message}`);
} else {
  cleanup.subscriptionIds.push(pendingReq.id);
  report.forexRequestCreated = true;
  report.proofPathSet = Boolean(pendingReq.payment_proof_path);
  report.adminClassification = normalizeAdminUserServiceType(pendingReq);
}

const { data: activeReq, error: activeErr } = await sb
  .from("subscription_requests")
  .insert({
    user_email: EMAIL,
    username: `forex_${RUN}`,
    plan_name: plan.plan.planName,
    category: plan.plan.category,
    price: plan.plan.price,
    telegram_username: "@forex_staging",
    payment_network: "TRC20",
    status: "مفعل",
    started_at: new Date().toISOString(),
    expires_at: expiresAt,
  })
  .select("id,user_email,plan_name,category,price,status,expires_at")
  .single();

if (activeErr) {
  report.errors.push(`ACTIVE_INSERT:${activeErr.message}`);
} else {
  cleanup.subscriptionIds.push(activeReq.id);
  report.activationOk = true;
  report.forexActiveSubscriberAllowed = matchesSignalSubscription(
    `${activeReq.plan_name} ${activeReq.category}`,
    "forex"
  );
  if (!report.forexActiveSubscriberAllowed) report.eligibilityFailures += 1;
}

const futuresRow = {
  plan_name: "فيوتشر - شهر",
  category: "باقات الفيوتشر",
  status: "مفعل",
  expires_at: expiresAt,
};
const spotRow = {
  plan_name: "سبوت - شهر",
  category: "باقات السبوت",
  status: "مفعل",
  expires_at: expiresAt,
};
const expiredForex = {
  plan_name: plan.plan.planName,
  category: plan.plan.category,
  status: "مفعل",
  expires_at: new Date(Date.now() - 86400000).toISOString(),
};

report.futuresOnlyDenied = !matchesSignalSubscription(
  `${futuresRow.plan_name} ${futuresRow.category}`,
  "forex"
);
report.spotOnlyDenied = !matchesSignalSubscription(`${spotRow.plan_name} ${spotRow.category}`, "forex");
report.expiredForexDenied =
  !isActiveSubscriptionRow(expiredForex) ||
  !matchesSignalSubscription(`${expiredForex.plan_name} ${expiredForex.category}`, "forex");

if (!report.futuresOnlyDenied || !report.spotOnlyDenied || !report.expiredForexDenied) {
  report.eligibilityFailures += 1;
}

const { data: signal, error: signalErr } = await sb
  .from("vip_signals")
  .insert({
    signal_type: "forex",
    coin: "EURUSD",
    entry: "STAGING CANARY",
    targets: "STAGING",
    stop_loss: "STAGING",
    notes: `STAGING CANARY ${RUN}`,
    status: "نشطة",
    trade_status: "active",
    publish_recipient_count: 1,
  })
  .select("id,signal_type,coin")
  .single();

if (signalErr) {
  report.errors.push(`SIGNAL_INSERT:${signalErr.message}`);
} else {
  cleanup.signalIds.push(signal.id);
  report.publishSignalId = signal.id;

  try {
    const result = await sendVipRecommendationStatusUpdate(sb, {
      recommendationId: signal.id,
      eventType: "target_1_hit",
      adminUser: { id: null, email: "staging-forex-canary@invalid" },
      deps: mockDeps(),
    });
    report.statusEventOk = Boolean(result?.ok);
    if (result?.eventId) cleanup.eventIds.push(result.eventId);
  } catch (err) {
    report.errors.push(`STATUS:${err.message}`);
  }
}

for (const id of cleanup.signalIds) {
  await sb.from("vip_signal_status_deliveries").delete().eq("signal_id", id);
  await sb.from("vip_signal_status_events").delete().eq("signal_id", id);
  await sb.from("vip_signals").delete().eq("id", id);
}
for (const id of cleanup.subscriptionIds) {
  await sb.from("subscription_requests").delete().eq("id", id);
}

const { count } = await sb
  .from("subscription_requests")
  .select("id", { count: "exact", head: true })
  .eq("user_email", EMAIL);
report.cleanupRemainingRows = count || 0;

console.log(JSON.stringify(report, null, 2));

const fail =
  report.errors.length ||
  report.eligibilityFailures ||
  report.cleanupRemainingRows ||
  !report.productionTargetConfirmedFalse ||
  !report.forexRequestCreated ||
  !report.activationOk ||
  !report.forexActiveSubscriberAllowed;

process.exit(fail ? 1 : 0);
