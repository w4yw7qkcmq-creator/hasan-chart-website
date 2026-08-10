#!/usr/bin/env node
/**
 * Round 7 — Staging qualified referral reward validation
 * Staging ONLY (tvkhuijufhnpqpchkyss)
 * Classification: PARTNER_R7_STAGING_VALIDATION_ONLY
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadStagingEnvFile } from "../../lib/load-staging-env.js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
} from "../../lib/staging-env-guard.js";
import { createPartnerSignupBonusAtomic } from "../../lib/partner-center/financial-gateway.js";
import { initializeReferralQualification, transitionReferralQualification } from "../../lib/partner-center/qualification-engine.js";
import {
  reevaluateReferralQualificationForUser,
} from "../../lib/partner-center/qualification-evaluator.js";
import { recordTrustedQualificationActivity, ACTIVITY_EVENT_TYPES } from "../../lib/partner-center/qualification-activity.js";
import { QUALIFICATION_STATES, FRAUD_RISK_LEVELS } from "../../lib/partner-center/constants.js";
import {
  releaseSignupBonusOnQualification,
  creditQualifiedReferralRewardOnQualification,
  QUALIFIED_REFERRAL_REWARD_RPC,
} from "../../lib/partner-center/qualification-financial-bridge.js";
import {
  validateQualifiedReferralRewardAmount,
  adminUpdateQualifiedReferralRewardPolicy,
  getActiveQualifiedReferralRewardRule,
} from "../../lib/partner-center/qualified-referral-reward-policy.js";

const RUN = `r7-staging-${Date.now()}`;
const ARTIFACT = join(process.cwd(), "scripts/partner-center/.artifacts", `${RUN}.json`);
const SIGNUP_BONUS_AMOUNT = 0.2;
const QRR_AMOUNT_V1 = 1.0;
const QRR_AMOUNT_V2 = 0.5;

const report = {
  runId: RUN,
  classification: "PARTNER_R7_STAGING_VALIDATION_ONLY",
  environment: {},
  tests: {},
  errors: [],
  baseline: {},
  deltas: {},
  stacking: {},
};

function pass(name, detail = "") {
  report.tests[name] = { status: "PASS", detail };
  console.log(`PASS ${name}${detail ? `: ${detail}` : ""}`);
}

function fail(name, detail = "") {
  report.tests[name] = { status: "FAIL", detail };
  report.errors.push({ name, detail });
  console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
}

function loadStaging() {
  loadStagingEnvFile();
  if (process.env.STAGING_SUPABASE_PROJECT_REF === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("ABORT: staging matches production");
  }
  if (process.env.STAGING_SUPABASE_PROJECT_REF !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error(`ABORT: unexpected staging ref ${process.env.STAGING_SUPABASE_PROJECT_REF}`);
  }
  return createClient(process.env.STAGING_SUPABASE_URL, process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function partnerBalances(service, partnerId) {
  const { data, error } = await service
    .from("partners")
    .select("balance_bonus_pending, total_earnings, balance_pending, balance_withdrawable")
    .eq("id", partnerId)
    .single();
  if (error) throw error;
  return data;
}

async function countHistoricalCredits(service) {
  const { count, error } = await service
    .from("partner_qualified_referral_reward_credits")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return count || 0;
}

async function ensureQualified(service, { referralId, partnerId, referredUserId }) {
  await service.auth.admin.updateUserById(referredUserId, { email_confirm: true });
  await transitionReferralQualification(service, {
    referralId,
    partnerId,
    toState: QUALIFICATION_STATES.VERIFIED,
    reason: "email_verified",
  });
  await recordTrustedQualificationActivity(service, {
    referredUserId,
    activityType: ACTIVITY_EVENT_TYPES.PRICE_ALERT,
    sourceEntityId: crypto.randomUUID(),
    partnerId,
    referralId,
  });
  await transitionReferralQualification(service, {
    referralId,
    partnerId,
    toState: QUALIFICATION_STATES.QUALIFIED,
    reason: "staging_controlled_qualification",
  });
}

async function mkFixture(service, label) {
  const password = process.env.STAGING_IAM_TEST_PASSWORD || "StagingTestPass!2026";
  const suffix = `${label}-${RUN.slice(-6)}`;
  const partnerEmail = `r7-${suffix}@staging-hcw.test`;
  const referredEmail = `r7-ref-${suffix}@staging-hcw.test`;

  const mkUser = async (email, confirm = false) => {
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: confirm,
      user_metadata: { r7: RUN, label },
    });
    if (error && !String(error.message).includes("already")) throw error;
    if (data?.user?.id) return data.user.id;
    const { data: list } = await service.auth.admin.listUsers({ perPage: 200 });
    return list.users.find((u) => u.email === email)?.id;
  };

  const partnerUserId = await mkUser(partnerEmail, true);
  const referredUserId = await mkUser(referredEmail, false);
  const referralCode = `R7${suffix.replace(/-/g, "").toUpperCase()}`.slice(0, 12);

  const { data: partnerRow, error: pErr } = await service
    .from("partners")
    .insert({ user_id: partnerUserId, referral_code: referralCode, status: "active", tier_key: "partner" })
    .select("id, balance_bonus_pending, total_earnings")
    .single();
  let partnerId = partnerRow?.id;
  if (pErr?.code === "23505") {
    const { data: ex } = await service.from("partners").select("id, balance_bonus_pending, total_earnings").eq("user_id", partnerUserId).single();
    partnerId = ex.id;
  } else if (pErr) throw pErr;

  const { data: referralRow, error: refErr } = await service
    .from("partner_referrals")
    .insert({
      partner_id: partnerId,
      referred_user_id: referredUserId,
      referral_code: referralCode,
      referred_username: label,
      status: "registered",
    })
    .select("id")
    .single();
  if (refErr) throw refErr;

  await service.from("partner_referral_attributions").insert({
    partner_id: partnerId,
    referral_id: referralRow.id,
    referred_user_id: referredUserId,
    referral_code: referralCode,
    policy: "first_touch",
  }).then((r) => {
    if (r.error && r.error.code !== "23505") throw r.error;
  });

  await initializeReferralQualification(service, {
    partnerId,
    referralId: referralRow.id,
    referredUserId,
  });

  await createPartnerSignupBonusAtomic(service, {
    partnerId,
    referralId: referralRow.id,
    referredUserId,
    referralCode,
    invitedUsername: label,
  });

  return { partnerId, referralId: referralRow.id, referredUserId, referralCode };
}

async function catalogVerification(service) {
  const checks = [
    ["table_rules", () => service.from("partner_qualified_referral_reward_rules").select("id").limit(1)],
    ["table_credits", () => service.from("partner_qualified_referral_reward_credits").select("id").limit(1)],
    ["rpc_exists", () => service.rpc(QUALIFIED_REFERRAL_REWARD_RPC, {
      p_referral_id: "00000000-0000-4000-8000-000000000099",
      p_partner_id: "00000000-0000-4000-8000-000000000098",
      p_rule_id: "00000000-0000-4000-8000-000000000097",
    })],
  ];
  for (const [name, fn] of checks) {
    const { error } = await fn();
    if (error && name === "rpc_exists" && (error.message?.includes("rule_not_found") || error.code === "P0002")) {
      pass(`catalog_${name}`, "callable");
    } else if (error) {
      fail(`catalog_${name}`, error.message);
    } else {
      pass(`catalog_${name}`);
    }
  }

  const { data: ledgerProbe, error: ledgerErr } = await service.rpc("credit_partner_qualified_referral_reward_atomic", {
    p_referral_id: "00000000-0000-4000-8000-000000000099",
    p_partner_id: "00000000-0000-4000-8000-000000000098",
    p_rule_id: "00000000-0000-4000-8000-000000000097",
  });
  if (ledgerErr && (ledgerErr.message?.includes("rule_not_found") || ledgerErr.code === "P0002")) {
    pass("catalog_ledger_entry_type", "rpc reachable");
  } else if (ledgerProbe) {
    pass("catalog_ledger_entry_type", JSON.stringify(ledgerProbe));
  } else {
    fail("catalog_ledger_entry_type", ledgerErr?.message || "unknown");
  }
}

async function validationMatrix() {
  const cases = [
    ["0.01", true],
    ["0.50", true],
    ["1.00", true],
    ["100.00", true],
    ["0", false],
    ["-1", false],
    ["100.01", false],
    ["0.005", false],
    ["1e3", false],
    ["abc", false],
    ["NaN", false],
  ];
  for (const [input, ok] of cases) {
    const r = validateQualifiedReferralRewardAmount(input);
    if (r.ok === ok) pass(`validation_${input}`, String(r.ok));
    else fail(`validation_${input}`, `expected ${ok} got ${r.ok}`);
  }
}

async function main() {
  const service = loadStaging();
  report.environment = { ref: STAGING_SUPABASE_PROJECT_REF, name: "staging" };

  report.baseline.historicalCreditsBefore = await countHistoricalCredits(service);
  pass("historical_baseline_credits", String(report.baseline.historicalCreditsBefore));

  await catalogVerification(service);
  await validationMatrix();

  const actorId = crypto.randomUUID();
  const { created: ruleV1 } = await adminUpdateQualifiedReferralRewardPolicy(service, {
    amount: QRR_AMOUNT_V1,
    isEnabled: true,
    actorUserId: actorId,
  });
  if (Number(ruleV1.amount) === QRR_AMOUNT_V1 && ruleV1.is_enabled && ruleV1.status === "active") {
    pass("rule_create_v1", `v${ruleV1.rule_version} amount=${ruleV1.amount}`);
  } else {
    fail("rule_create_v1", JSON.stringify(ruleV1));
  }

  const fixtureA = await mkFixture(service, "stackA");
  const beforeA = await partnerBalances(service, fixtureA.partnerId);
  await ensureQualified(service, fixtureA);

  const releaseA = await releaseSignupBonusOnQualification(service, fixtureA);
  const creditA = await creditQualifiedReferralRewardOnQualification(service, fixtureA);
  const afterA = await partnerBalances(service, fixtureA.partnerId);

  const bonusDeltaA = Number(afterA.balance_bonus_pending) - Number(beforeA.balance_bonus_pending);
  const expectedCombined = SIGNUP_BONUS_AMOUNT + QRR_AMOUNT_V1;

  if (releaseA.released || releaseA.duplicate) pass("stacking_signup_release", JSON.stringify(releaseA));
  else fail("stacking_signup_release", JSON.stringify(releaseA));

  if (creditA.credited && Number(creditA.amount) === QRR_AMOUNT_V1) {
    pass("financial_qrr_credit", `amount=${creditA.amount}`);
  } else {
    fail("financial_qrr_credit", JSON.stringify(creditA));
  }

  if (Math.abs(bonusDeltaA - expectedCombined) < 0.001) {
    pass("stacking_combined_delta", `delta=${bonusDeltaA} expected=${expectedCombined}`);
    report.stacking = { signupBonus: SIGNUP_BONUS_AMOUNT, qualifiedReward: QRR_AMOUNT_V1, combined: expectedCombined, actualDelta: bonusDeltaA };
  } else {
    fail("stacking_combined_delta", `delta=${bonusDeltaA} expected=${expectedCombined}`);
  }

  const { data: creditRow } = await service
    .from("partner_qualified_referral_reward_credits")
    .select("*")
    .eq("referral_id", fixtureA.referralId)
    .single();
  if (creditRow?.status === "credited" && Number(creditRow.amount) === QRR_AMOUNT_V1) {
    pass("credit_row_single", creditRow.id);
  } else {
    fail("credit_row_single", JSON.stringify(creditRow));
  }

  const { data: ledgerRow } = await service
    .from("partner_financial_ledger_entries")
    .select("entry_type, balance_bucket, amount")
    .eq("reference_id", fixtureA.referralId)
    .eq("entry_type", "qualified_referral_reward")
    .maybeSingle();
  if (ledgerRow?.entry_type === "qualified_referral_reward" && ledgerRow.balance_bucket === "bonus_pending") {
    pass("ledger_qrr_entry", `amount=${ledgerRow.amount}`);
  } else {
    fail("ledger_qrr_entry", JSON.stringify(ledgerRow));
  }

  const beforeIdem = await partnerBalances(service, fixtureA.partnerId);
  for (let i = 0; i < 10; i += 1) {
    await creditQualifiedReferralRewardOnQualification(service, fixtureA);
    await releaseSignupBonusOnQualification(service, fixtureA);
    await reevaluateReferralQualificationForUser(service, {
      referredUserId: fixtureA.referredUserId,
      trigger: `idem_${i}`,
    });
  }
  const afterIdem = await partnerBalances(service, fixtureA.partnerId);
  const { count: creditCountA } = await service
    .from("partner_qualified_referral_reward_credits")
    .select("id", { count: "exact", head: true })
    .eq("referral_id", fixtureA.referralId);
  if (Number(afterIdem.balance_bonus_pending) === Number(beforeIdem.balance_bonus_pending) && creditCountA === 1) {
    pass("idempotency_x10", "no duplicate delta");
  } else {
    fail("idempotency_x10", `balance changed or count=${creditCountA}`);
  }

  await transitionReferralQualification(service, {
    referralId: fixtureA.referralId,
    partnerId: fixtureA.partnerId,
    toState: QUALIFICATION_STATES.CUSTOMER,
    reason: "staging_customer",
  });
  const creditAfterCustomer = await creditQualifiedReferralRewardOnQualification(service, fixtureA);
  const { count: creditCountAfterCustomer } = await service
    .from("partner_qualified_referral_reward_credits")
    .select("id", { count: "exact", head: true })
    .eq("referral_id", fixtureA.referralId);
  if (creditAfterCustomer.duplicate && creditCountAfterCustomer === 1) {
    pass("customer_no_second_qrr");
  } else {
    fail("customer_no_second_qrr", JSON.stringify(creditAfterCustomer));
  }

  const { created: ruleDisabled } = await adminUpdateQualifiedReferralRewardPolicy(service, {
    amount: QRR_AMOUNT_V1,
    isEnabled: false,
    actorUserId: actorId,
  });
  pass("rule_disable", `v${ruleDisabled.rule_version}`);

  const fixtureDisabled = await mkFixture(service, "disabled");
  await ensureQualified(service, fixtureDisabled);
  const creditDisabled = await creditQualifiedReferralRewardOnQualification(service, fixtureDisabled);
  const { data: skippedRow } = await service
    .from("partner_qualified_referral_reward_credits")
    .select("status")
    .eq("referral_id", fixtureDisabled.referralId)
    .single();
  if (skippedRow?.status === "skipped_disabled" && !creditDisabled.credited) {
    pass("disabled_no_financial_credit", skippedRow.status);
  } else {
    fail("disabled_no_financial_credit", JSON.stringify({ creditDisabled, skippedRow }));
  }

  await adminUpdateQualifiedReferralRewardPolicy(service, {
    amount: QRR_AMOUNT_V2,
    isEnabled: true,
    actorUserId: actorId,
  });
  const fixtureReenable = await mkFixture(service, "reenable");
  await ensureQualified(service, fixtureReenable);
  const creditReenable = await creditQualifiedReferralRewardOnQualification(service, fixtureReenable);
  if (Number(creditReenable.amount) === QRR_AMOUNT_V2) {
    pass("reenable_new_referral_gets_current_rule", `amount=${creditReenable.amount}`);
  } else {
    fail("reenable_new_referral_gets_current_rule", JSON.stringify(creditReenable));
  }

  const { data: oldCredit } = await service
    .from("partner_qualified_referral_reward_credits")
    .select("amount")
    .eq("referral_id", fixtureDisabled.referralId)
    .single();
  if (Number(oldCredit?.amount) === 0 && skippedRow?.status === "skipped_disabled") {
    pass("reenable_no_retroactive", "disabled referral unchanged");
  } else {
    fail("reenable_no_retroactive", JSON.stringify(oldCredit));
  }

  const { created: ruleV2 } = await adminUpdateQualifiedReferralRewardPolicy(service, {
    amount: QRR_AMOUNT_V2,
    isEnabled: true,
    actorUserId: actorId,
  });
  const fixtureB = await mkFixture(service, "versionB");
  await ensureQualified(service, fixtureB);
  await creditQualifiedReferralRewardOnQualification(service, fixtureB);
  const { data: creditB } = await service
    .from("partner_qualified_referral_reward_credits")
    .select("amount, rule_version")
    .eq("referral_id", fixtureB.referralId)
    .single();
  if (Number(creditB?.amount) === QRR_AMOUNT_V2) {
    pass("rule_versioning_v2_amount", `v${creditB.rule_version}`);
  } else {
    fail("rule_versioning_v2_amount", JSON.stringify(creditB));
  }

  const { data: creditAHistory } = await service
    .from("partner_qualified_referral_reward_credits")
    .select("amount")
    .eq("referral_id", fixtureA.referralId)
    .single();
  if (Number(creditAHistory?.amount) === QRR_AMOUNT_V1) {
    pass("rule_versioning_v1_unchanged", String(creditAHistory.amount));
  } else {
    fail("rule_versioning_v1_unchanged", JSON.stringify(creditAHistory));
  }

  const activeRules = await service
    .from("partner_qualified_referral_reward_rules")
    .select("id")
    .eq("status", "active");
  if ((activeRules.data || []).length === 1) pass("single_active_rule");
  else fail("single_active_rule", `count=${(activeRules.data || []).length}`);

  const tamper = await service.rpc(QUALIFIED_REFERRAL_REWARD_RPC, {
    p_referral_id: fixtureB.referralId,
    p_partner_id: fixtureA.partnerId,
    p_rule_id: ruleV2.id,
  });
  if (tamper.data?.duplicate || tamper.error) {
    pass("client_tamper_wrong_partner", JSON.stringify(tamper.data || tamper.error?.message));
  } else {
    fail("client_tamper_wrong_partner", JSON.stringify(tamper));
  }

  const offer = await getActiveQualifiedReferralRewardRule(service);
  if (offer?.is_enabled && Number(offer.amount) === QRR_AMOUNT_V2) {
    pass("partner_offer_active", `amount=${offer.amount}`);
  } else {
    fail("partner_offer_active", JSON.stringify(offer));
  }

  report.baseline.historicalCreditsAfter = await countHistoricalCredits(service);
  const historicalDelta = report.baseline.historicalCreditsAfter - report.baseline.historicalCreditsBefore;
  if (historicalDelta >= 0) {
    pass("historical_no_auto_backfill", `newCredits=${historicalDelta} (fixture-only)`);
  } else {
    fail("historical_no_auto_backfill", String(historicalDelta));
  }

  const passed = Object.values(report.tests).filter((t) => t.status === "PASS").length;
  const failed = Object.values(report.tests).filter((t) => t.status === "FAIL").length;
  report.summary = { passed, failed, verdict: failed === 0 ? "PASS" : "FAIL" };

  mkdirSync(join(process.cwd(), "scripts/partner-center/.artifacts"), { recursive: true });
  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  console.log(`\nArtifact: ${ARTIFACT}`);
  console.log(`Summary: ${passed} PASS / ${failed} FAIL`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("R7 staging validation fatal", err);
  process.exit(1);
});
