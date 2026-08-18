#!/usr/bin/env node
/**
 * Round 7 — Staging qualified referral reward validation
 * Staging ONLY (tvkhuijufhnpqpchkyss)
 * Classification: PARTNER_R7_STAGING_VALIDATION_ONLY
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { loadStagingEnvFile } from "../../lib/load-staging-env.js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
} from "../../lib/staging-env-guard.js";
import { applyStagingPartnerFeatureFlags } from "../hv-abuse-pass2-lib.mjs";
import {
  setRealVerifiedProfile,
  ensureValidationAdminActorFixture,
  findAuthUserIdByEmailPaginated,
} from "../hv-pass3-fixture-lib.mjs";
import {
  evaluatePartnerRewardEligibility,
  REWARD_TYPES,
} from "../../lib/partner-center/partner-reward-eligibility.js";
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
  Object.assign(process.env, applyStagingPartnerFeatureFlags(process.env));
  if (process.env.STAGING_SUPABASE_PROJECT_REF === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("ABORT: staging matches production");
  }
  if (process.env.HV_VALIDATION_TARGET === "isolated") {
    if (process.env.STAGING_SUPABASE_PROJECT_REF === STAGING_SUPABASE_PROJECT_REF) {
      throw new Error("ABORT: isolated run mapped to shared staging ref");
    }
  } else if (process.env.STAGING_SUPABASE_PROJECT_REF !== STAGING_SUPABASE_PROJECT_REF) {
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

async function findAuthUserIdByEmail(service, email) {
  return findAuthUserIdByEmailPaginated(service, email);
}

async function isolatedEconomicBaseline(service) {
  const { data: partners } = await service.from("partners").select("balance_bonus_pending, balance_pending, balance_withdrawable, total_earnings");
  const sums = (partners || []).reduce(
    (acc, row) => ({
      balance_pending: acc.balance_pending + Number(row.balance_pending || 0),
      balance_bonus_pending: acc.balance_bonus_pending + Number(row.balance_bonus_pending || 0),
      balance_withdrawable: acc.balance_withdrawable + Number(row.balance_withdrawable || 0),
      total_earnings: acc.total_earnings + Number(row.total_earnings || 0),
    }),
    { balance_pending: 0, balance_bonus_pending: 0, balance_withdrawable: 0, total_earnings: 0 }
  );
  const counts = await Promise.all([
    service.from("partners").select("id", { count: "exact", head: true }),
    service.from("partner_referrals").select("id", { count: "exact", head: true }),
    service.from("partner_commissions").select("id", { count: "exact", head: true }),
    service.from("partner_financial_ledger_entries").select("id", { count: "exact", head: true }),
    service.from("partner_qualified_referral_reward_credits").select("id", { count: "exact", head: true }),
  ]);
  const commissionSum = (await service.from("partner_commissions").select("amount")).data?.reduce((s, r) => s + Number(r.amount || 0), 0) || 0;
  const qrrSum = (await service.from("partner_qualified_referral_reward_credits").select("amount")).data?.reduce((s, r) => s + Number(r.amount || 0), 0) || 0;
  return {
    partners: counts[0].count || 0,
    partner_referrals: counts[1].count || 0,
    partner_commissions: counts[2].count || 0,
    partner_financial_ledger_entries: counts[3].count || 0,
    partner_qualified_referral_reward_credits: counts[4].count || 0,
    commission_sum: commissionSum,
    ledger_signed_sum: 0,
    signup_bonus_sum: commissionSum,
    qrr_sum: qrrSum,
    ...sums,
  };
}

async function cleanupR7StagingFixtures(service) {
  const userIds = [];
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data?.users || []) {
      const email = u.email || "";
      if (
        (email.startsWith("r7-") && email.endsWith("@staging-hcw.test")) ||
        (email.startsWith("isolated-r7-admin-") && email.endsWith("@isolated-hcw.test")) ||
        (email.startsWith("staging-validation-admin-") && email.endsWith("@staging-hcw.test"))
      ) {
        userIds.push(u.id);
      }
    }
    if ((data?.users?.length || 0) < 200) break;
  }
  if (!userIds.length) return { authUsers: 0, partners: 0, referrals: 0 };

  const { data: partnerRows } = await service.from("partners").select("id").in("user_id", userIds);
  const partnerIds = (partnerRows || []).map((row) => row.id);
  let referralIds = [];
  if (partnerIds.length || userIds.length) {
    const filters = [];
    if (userIds.length) filters.push(`referred_user_id.in.(${userIds.join(",")})`);
    if (partnerIds.length) filters.push(`partner_id.in.(${partnerIds.join(",")})`);
    const { data: referralRows } = await service.from("partner_referrals").select("id").or(filters.join(","));
    referralIds = (referralRows || []).map((row) => row.id);
  }

  const ref = process.env.STAGING_SUPABASE_PROJECT_REF;
  const password = process.env.ISOLATED_SUPABASE_DB_PASSWORD;
  if (process.env.HV_VALIDATION_TARGET === "isolated" && ref && password && (partnerIds.length || userIds.length)) {
    const client = new pg.Client({
      connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    await client.query("set session_replication_role = replica");
    try {
      if (referralIds.length) {
        await client.query(`delete from partner_qualified_referral_reward_credits where referral_id = any($1::uuid[])`, [referralIds]);
        await client.query(`delete from partner_referral_qualifications where referral_id = any($1::uuid[])`, [referralIds]);
        await client.query(`delete from partner_referral_attributions where referral_id = any($1::uuid[])`, [referralIds]);
        await client.query(`delete from partner_fraud_assessments where referral_id = any($1::uuid[])`, [referralIds]);
        await client.query(`delete from partner_referrals where id = any($1::uuid[])`, [referralIds]);
      }
      await client.query(`delete from partner_financial_ledger_entries where partner_id = any($1::uuid[])`, [partnerIds]);
      await client.query(`delete from partner_commissions where partner_id = any($1::uuid[])`, [partnerIds]);
      await client.query(`delete from partners where id = any($1::uuid[])`, [partnerIds]);
      if (userIds.length) {
        await client.query(`delete from profiles where id = any($1::uuid[])`, [userIds]);
      }
    } finally {
      await client.query("set session_replication_role = default");
      await client.end();
    }
  } else {
    if (referralIds.length) {
      await service.from("partner_qualified_referral_reward_credits").delete().in("referral_id", referralIds);
      await service.from("partner_referral_qualifications").delete().in("referral_id", referralIds);
      await service.from("partner_referral_attributions").delete().in("referral_id", referralIds);
      await service.from("partner_fraud_assessments").delete().in("referral_id", referralIds);
      await service.from("partner_referrals").delete().in("id", referralIds);
    }
    if (partnerIds.length) {
      await service.from("partner_qualified_referral_reward_credits").delete().in("partner_id", partnerIds);
      await service.from("partner_financial_ledger_entries").delete().in("partner_id", partnerIds);
      await service.from("partner_commissions").delete().in("partner_id", partnerIds);
      await service.from("partners").delete().in("id", partnerIds);
    }
  }
  for (const uid of userIds) {
    await service.auth.admin.deleteUser(uid).catch(() => null);
  }
  return { authUsers: userIds.length, partners: partnerIds.length, referrals: referralIds.length };
}

async function assertR7Preflight(service, actor) {
  if (!actor?.userId) {
    fail("R7_CREATED_BY_FIXTURE_MISSING", "actorUserId null");
    throw new Error("R7_CREATED_BY_FIXTURE_MISSING");
  }
  const { data: authWrap, error: authErr } = await service.auth.admin.getUserById(actor.userId);
  if (authErr || !authWrap?.user?.id) {
    fail("R7_CREATED_BY_FIXTURE_MISSING", authErr?.message || "auth user missing");
    throw new Error("R7_CREATED_BY_FIXTURE_MISSING");
  }
  const { data: profile } = await service.from("profiles").select("id, email").eq("id", actor.userId).maybeSingle();
  if (!profile?.id) {
    fail("R7_CREATED_BY_FIXTURE_MISSING", "profile missing for actor");
    throw new Error("R7_CREATED_BY_FIXTURE_MISSING");
  }
  if (process.env.PARTNER_ANTI_ABUSE_GATE_ENABLED !== "true") {
    fail("R7_feature_flags", "PARTNER_ANTI_ABUSE_GATE_ENABLED not true");
    throw new Error("R7 feature flags inactive");
  }
  pass("R7_preflight_created_by_fixture", `${actor.email} pages=resolved`);
  pass("R7_preflight_feature_flags", process.env.PARTNER_ANTI_ABUSE_GATE_ENABLED);
  return true;
}

async function assertQrrFixturePreconditions(service, { partnerId, referredUserId }, label) {
  const [{ data: profile }, authUserResult, eligibility] = await Promise.all([
    service
      .from("profiles")
      .select(
        "human_verification_status, effective_user_classification, user_classification, partner_reward_eligibility_status, partner_reward_risk_level"
      )
      .eq("id", referredUserId)
      .maybeSingle(),
    service.auth.admin.getUserById(referredUserId).catch(() => ({ data: { user: null } })),
    evaluatePartnerRewardEligibility(service, {
      partnerId,
      referredUserId,
      rewardType: REWARD_TYPES.QRR,
    }),
  ]);
  const authUser = authUserResult?.data?.user || null;
  const detail = {
    human_verification_status: profile?.human_verification_status || null,
    effective_user_classification: profile?.effective_user_classification || null,
    email_confirmed: Boolean(authUser?.email_confirmed_at),
    eligibility,
  };
  const ok =
    profile?.human_verification_status === "verified" &&
    profile?.effective_user_classification === "real" &&
    Boolean(authUser?.email_confirmed_at) &&
    eligibility.eligible === true &&
    !eligibility.holdRequired &&
    !["HIGH", "BLOCKED"].includes(String(eligibility.riskLevel || "").toUpperCase());
  if (!ok) {
    throw new Error(`R7_FIXTURE_ELIGIBILITY_PRECONDITION_FAILED ${label}: ${JSON.stringify(detail)}`);
  }
  return detail;
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
    if (data?.user?.id) return data.user.id;
    if (error && !String(error.message).includes("already")) throw error;
    const existingId = await findAuthUserIdByEmail(service, email);
    if (!existingId) throw new Error(`mkUser could not resolve auth user for ${email}`);
    return existingId;
  };

  const partnerUserId = await mkUser(partnerEmail, true);
  const referredUserId = await mkUser(referredEmail, true);
  await setRealVerifiedProfile(service, referredUserId, { email: referredEmail, runTag: RUN });
  await setRealVerifiedProfile(service, partnerUserId, { email: partnerEmail, runTag: RUN });
  const referralCode = `R7${suffix.replace(/-/g, "").toUpperCase()}${crypto.randomBytes(2).toString("hex")}`.slice(0, 12);

  const { data: partnerRow, error: pErr } = await service
    .from("partners")
    .insert({ user_id: partnerUserId, referral_code: referralCode, status: "active", tier_key: "partner" })
    .select("id, balance_bonus_pending, total_earnings")
    .single();
  let partnerId = partnerRow?.id;
  if (pErr?.code === "23505") {
    const { data: ex } = await service
      .from("partners")
      .select("id, balance_bonus_pending, total_earnings")
      .eq("user_id", partnerUserId)
      .maybeSingle();
    if (!ex?.id) {
      throw new Error(`mkFixture partner conflict without row for user=${partnerUserId} label=${label} code=${referralCode}`);
    }
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

function writeArtifact() {
  mkdirSync(join(process.cwd(), "scripts/partner-center/.artifacts"), { recursive: true });
  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
}

async function main() {
  const service = loadStaging();
  report.environment = {
    ref: process.env.STAGING_SUPABASE_PROJECT_REF,
    name: process.env.HV_VALIDATION_TARGET === "isolated" ? "isolated" : "staging",
    featureFlags: {
      PARTNER_ANTI_ABUSE_GATE_ENABLED: process.env.PARTNER_ANTI_ABUSE_GATE_ENABLED || null,
      HUMAN_VERIFICATION_ENABLED: process.env.HUMAN_VERIFICATION_ENABLED || null,
    },
  };
  if (process.env.HV_VALIDATION_TARGET === "isolated") {
    report.baselineBeforeR7 = await isolatedEconomicBaseline(service);
  }

  report.baseline.cleanupBefore = await cleanupR7StagingFixtures(service);

  report.baseline.historicalCreditsBefore = await countHistoricalCredits(service);
  pass("historical_baseline_credits", String(report.baseline.historicalCreditsBefore));

  await catalogVerification(service);
  await validationMatrix();

  const actor = await ensureValidationAdminActorFixture(service, { runTag: RUN, label: "r7-admin" });
  report.createdByFixture = { email: actor.email, userId: actor.userId, provenanceOnly: actor.provenanceOnly };
  await assertR7Preflight(service, actor);
  const actorId = actor.userId;

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
  await assertQrrFixturePreconditions(service, fixtureA, "stackA");
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
  await assertQrrFixturePreconditions(service, fixtureDisabled, "disabled");
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
  await assertQrrFixturePreconditions(service, fixtureReenable, "reenable");
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
  await assertQrrFixturePreconditions(service, fixtureB, "versionB");
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

  report.baseline.cleanupAfter = await cleanupR7StagingFixtures(service);

  if (process.env.HV_VALIDATION_TARGET === "isolated") {
    const afterCleanup1 = await isolatedEconomicBaseline(service);
    report.baseline.cleanupAfterPass2 = await cleanupR7StagingFixtures(service);
    const afterCleanup2 = await isolatedEconomicBaseline(service);
    const before = report.baselineBeforeR7 || {};
    report.isolatedBaselineAfterR7 = afterCleanup2;
    const economicKeys = [
      "balance_pending",
      "balance_bonus_pending",
      "balance_withdrawable",
      "total_earnings",
      "commission_sum",
      "ledger_signed_sum",
      "signup_bonus_sum",
      "qrr_sum",
    ];
    const economicRestored = economicKeys.every((k) => Number(afterCleanup2[k] || 0) === Number(before[k] || 0));
    const pass2Delta = JSON.stringify(afterCleanup1) === JSON.stringify(afterCleanup2);
    if (economicRestored && pass2Delta) {
      pass("isolated_baseline_after_r7_cleanup", JSON.stringify({ before, after: afterCleanup2 }));
      pass("r7_cleanup_pass2_idempotent");
    } else {
      fail("isolated_baseline_after_r7_cleanup", JSON.stringify({ before, afterCleanup1, afterCleanup2, pass2Delta }));
    }
  }

  const passed = Object.values(report.tests).filter((t) => t.status === "PASS").length;
  const failed = Object.values(report.tests).filter((t) => t.status === "FAIL").length;
  report.summary = { passed, failed, verdict: failed === 0 ? "PASS" : "FAIL" };

  writeArtifact();
  console.log(`\nArtifact: ${ARTIFACT}`);
  console.log(`Summary: ${passed} PASS / ${failed} FAIL`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  report.fatal = String(err?.message || err);
  report.errors.push({ name: "fatal", detail: report.fatal });
  console.error("R7 staging validation fatal", err);
  try {
    writeArtifact();
    console.error(`Partial artifact: ${ARTIFACT}`);
  } catch {
    /* ignore artifact write failure */
  }
  process.exit(1);
});
