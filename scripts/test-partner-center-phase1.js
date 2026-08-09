#!/usr/bin/env node
/**
 * Partner Center Phase 1 — unit/integration tests (in-memory mock DB)
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const {
  PARTNER_EVENT_TYPES,
  QUALIFICATION_STATES,
  FRAUD_RISK_LEVELS,
  LEDGER_BALANCE_BUCKETS,
} = require("../lib/partner-center/constants.js");
const { roundMoney, sumLedgerBucket, assertPositiveMoney } = require("../lib/partner-center/money.js");
const {
  buildPartnerEventIdempotencyKey,
  recordPartnerEvent,
} = require("../lib/partner-center/event-model.js");
const {
  canTransitionQualification,
  transitionReferralQualification,
  initializeReferralQualification,
} = require("../lib/partner-center/qualification-engine.js");
const {
  normalizeAttributionQuery,
  validateCampaignForPartner,
  finalizeReferralAttribution,
  recordAttributionClick,
} = require("../lib/partner-center/attribution-engine.js");
const {
  assessReferralSignupRisk,
  evaluateReferralSignupFraud,
} = require("../lib/partner-center/anti-fraud.js");
const {
  appendFinancialLedgerEntry,
  buildLedgerIdempotencyKey,
  recordCommissionLedgerCredit,
  recordFinancialReversalEntry,
} = require("../lib/partner-center/financial-ledger.js");

/** Inline mirrors of partner-commission-engine helpers for isolated unit tests (avoids full ESM import graph). */
async function getPartnerForReferredUser(supabase, referredUserId) {
  const normalizedUserId = String(referredUserId || "").trim();
  if (!normalizedUserId) {
    return { found: false, reason: "missing_user" };
  }
  const { data: referral, error: referralError } = await supabase
    .from("partner_referrals")
    .select("id, partner_id, referral_code, referred_username, referred_user_id, status")
    .eq("referred_user_id", normalizedUserId)
    .maybeSingle();
  if (referralError) {
    throw referralError;
  }
  if (!referral?.partner_id) {
    return { found: false, reason: "no_partner_referral" };
  }
  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("id, user_id, referral_code, status, tier_key")
    .eq("id", referral.partner_id)
    .maybeSingle();
  if (partnerError) {
    throw partnerError;
  }
  if (!partner?.id || partner.status !== "active") {
    return { found: false, reason: "inactive_partner" };
  }
  if (String(partner.user_id) === normalizedUserId) {
    return { found: false, reason: "self_referral" };
  }
  return { found: true, partner, referral };
}

async function preventDuplicateCommission(supabase, { partnerId, referredUserId, serviceType, sourceId }) {
  const normalizedPartnerId = String(partnerId || "").trim();
  const normalizedUserId = String(referredUserId || "").trim();
  const normalizedServiceType = String(serviceType || "").trim().toLowerCase();
  const normalizedSourceId = String(sourceId || "").trim();
  if (!normalizedPartnerId || !normalizedUserId || !normalizedServiceType || !normalizedSourceId) {
    return { duplicate: false };
  }
  const { data, error } = await supabase
    .from("partner_commissions")
    .select("id, status, amount")
    .eq("partner_id", normalizedPartnerId)
    .eq("user_id", normalizedUserId)
    .eq("service_type", normalizedServiceType)
    .eq("source_id", normalizedSourceId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (data?.id) {
    return { duplicate: true, existing: data };
  }
  return { duplicate: false };
}

const PARTNER_A = "11111111-1111-1111-1111-111111111111";
const PARTNER_B = "22222222-2222-2222-2222-222222222222";
const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const REFERRAL_1 = "33333333-3333-3333-3333-333333333333";

function createMockSupabase(seed = {}) {
  const tables = structuredClone(seed);

  function getTable(name) {
    if (!tables[name]) {
      tables[name] = [];
    }
    return tables[name];
  }

  function matchRow(row, filters) {
    return Object.entries(filters).every(([key, value]) => {
      if (value && typeof value === "object" && value.in) {
        return value.in.includes(row[key]);
      }
      return row[key] === value;
    });
  }

  function makeBuilder(tableName) {
    const state = { filters: [], insertRow: null, updatePatch: null, limitN: null, maybeSingle: false };

    const builder = {
      select() {
        return builder;
      },
      eq(field, value) {
        state.filters.push([field, value]);
        return builder;
      },
      in(field, values) {
        state.filters.push([field, { in: values }]);
        return builder;
      },
      insert(row) {
        state.insertRow = row;
        return builder;
      },
      update(patch) {
        state.updatePatch = patch;
        return builder;
      },
      order() {
        return builder;
      },
      limit(n) {
        state.limitN = n;
        return builder;
      },
      maybeSingle() {
        state.maybeSingle = true;
        return builder.then ? builder : builder.execute();
      },
      single() {
        state.maybeSingle = false;
        return builder.execute();
      },
      then(resolve, reject) {
        return builder.execute().then(resolve, reject);
      },
      async execute() {
        const table = getTable(tableName);

        if (state.insertRow) {
          const rows = Array.isArray(state.insertRow) ? state.insertRow : [state.insertRow];
          for (const row of rows) {
            const record = {
              id: row.id || crypto.randomUUID(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              ...row,
            };
            const uniqueViolations = [
              ["partner_events", "idempotency_key"],
              ["partner_attribution_sessions", "idempotency_key"],
              ["partner_attribution_sessions", "partner_id,visitor_key"],
              ["partner_referral_attributions", "referral_id"],
              ["partner_referral_attributions", "referred_user_id"],
              ["partner_referral_qualifications", "referral_id"],
              ["partner_referral_qualifications", "referred_user_id"],
              ["partner_qualification_transitions", "referral_id,from_state,to_state,reason"],
              ["partner_financial_ledger_entries", "idempotency_key"],
              ["partner_financial_ledger_entries", "legacy_commission_id,entry_type,entry_direction"],
              ["partner_commissions", "partner_id,user_id,service_type,source_id"],
            ];

            for (const [tableKey, keySpec] of uniqueViolations) {
              if (tableKey !== tableName) continue;
              const keys = keySpec.split(",");
              const duplicate = table.some((existing) =>
                keys.every((key) => existing[key] === record[key])
              );
              if (duplicate) {
                return {
                  data: null,
                  error: { code: "23505", message: "duplicate key value violates unique constraint" },
                };
              }
            }

            table.push(record);
          }

          const inserted = table[table.length - 1];
          return { data: state.maybeSingle ? inserted : rows.length === 1 ? inserted : rows, error: null };
        }

        if (state.updatePatch) {
          let updated = null;
          for (const row of table) {
            const matches = state.filters.every(([field, value]) => matchRow(row, { [field]: value }));
            if (matches) {
              Object.assign(row, state.updatePatch, { updated_at: new Date().toISOString() });
              updated = row;
            }
          }
          return { data: state.maybeSingle ? updated : updated, error: null };
        }

        let rows = table.filter((row) =>
          state.filters.every(([field, value]) => matchRow(row, { [field]: value }))
        );

        if (state.limitN != null) {
          rows = rows.slice(0, state.limitN);
        }

        return { data: state.maybeSingle ? rows[0] || null : rows, error: null };
      },
    };

    return builder;
  }

  return {
    tables,
    from(tableName) {
      return makeBuilder(tableName);
    },
  };
}

function seedPartnerContext() {
  return {
    partners: [
      {
        id: PARTNER_A,
        user_id: USER_A,
        referral_code: "ALPHA123",
        status: "active",
        tier_key: "bronze",
        balance_pending: 0,
        balance_withdrawable: 0,
        balance_bonus_pending: 0,
        total_earnings: 0,
      },
      {
        id: PARTNER_B,
        user_id: USER_B,
        referral_code: "BETA456",
        status: "active",
        tier_key: "bronze",
        balance_pending: 0,
        balance_withdrawable: 0,
        balance_bonus_pending: 0,
        total_earnings: 0,
      },
    ],
    partner_referrals: [
      {
        id: REFERRAL_1,
        partner_id: PARTNER_A,
        referred_user_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        referral_code: "ALPHA123",
        status: "registered",
      },
    ],
    partner_campaigns: [
      { id: "camp-1", partner_id: PARTNER_A, slug: "analysis", is_active: true },
    ],
  };
}

async function testValidReferralEventIdempotency() {
  const supabase = createMockSupabase({ partner_events: [] });
  const key = buildPartnerEventIdempotencyKey(PARTNER_EVENT_TYPES.SIGNUP, ["user-1"]);
  const first = await recordPartnerEvent(supabase, {
    eventType: PARTNER_EVENT_TYPES.SIGNUP,
    idempotencyKey: key,
    partnerId: PARTNER_A,
    referredUserId: "user-1",
  });
  const second = await recordPartnerEvent(supabase, {
    eventType: PARTNER_EVENT_TYPES.SIGNUP,
    idempotencyKey: key,
    partnerId: PARTNER_A,
    referredUserId: "user-1",
  });
  assert.equal(first.recorded, true);
  assert.equal(second.duplicate, true);
  assert.equal(supabase.tables.partner_events.length, 1);
}

async function testSelfReferralBlocked() {
  const supabase = createMockSupabase({
    ...seedPartnerContext(),
    partner_referrals: [
      {
        id: REFERRAL_1,
        partner_id: PARTNER_A,
        referred_user_id: USER_A,
        referral_code: "ALPHA123",
        status: "registered",
      },
    ],
  });
  const result = await getPartnerForReferredUser(supabase, USER_A);
  assert.equal(result.found, false);
  assert.equal(result.reason, "self_referral");

  const fraud = assessReferralSignupRisk({ selfReferral: true });
  assert.equal(fraud.riskLevel, FRAUD_RISK_LEVELS.BLOCKED);
  assert.equal(fraud.decision, "block");
}

async function testDuplicateCommissionDetection() {
  const supabase = createMockSupabase({
    ...seedPartnerContext(),
    partner_commissions: [
      {
        id: "comm-1",
        partner_id: PARTNER_A,
        user_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        service_type: "vip_signal",
        source_id: "sub-1",
        amount: 10,
        status: "pending",
      },
    ],
  });
  const dup = await preventDuplicateCommission(supabase, {
    partnerId: PARTNER_A,
    referredUserId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    serviceType: "vip_signal",
    sourceId: "sub-1",
  });
  assert.equal(dup.duplicate, true);
}

async function testQualificationInvalidTransition() {
  const supabase = createMockSupabase({
    partner_referral_qualifications: [
      {
        referral_id: REFERRAL_1,
        partner_id: PARTNER_A,
        referred_user_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        state: QUALIFICATION_STATES.SIGNUP,
      },
    ],
    partner_qualification_transitions: [],
  });
  assert.equal(canTransitionQualification("signup", "customer"), false);
  const result = await transitionReferralQualification(supabase, {
    referralId: REFERRAL_1,
    partnerId: PARTNER_A,
    toState: QUALIFICATION_STATES.CUSTOMER,
    reason: "invalid_jump",
  });
  assert.equal(result.transitioned, false);
  assert.equal(result.reason, "invalid_transition");
}

async function testDuplicateQualificationInit() {
  const supabase = createMockSupabase({
    partner_referral_qualifications: [],
    partner_qualification_transitions: [],
  });
  const first = await initializeReferralQualification(supabase, {
    partnerId: PARTNER_A,
    referralId: REFERRAL_1,
    referredUserId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  });
  const second = await initializeReferralQualification(supabase, {
    partnerId: PARTNER_A,
    referralId: REFERRAL_1,
    referredUserId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  });
  assert.equal(first.created, true);
  assert.equal(second.duplicate, true);
}

async function testLedgerDuplicateCommissionCredit() {
  const supabase = createMockSupabase({ partner_events: [], partner_financial_ledger_entries: [] });
  const first = await recordCommissionLedgerCredit(supabase, {
    partnerId: PARTNER_A,
    commissionId: "comm-abc",
    amount: 12.5,
  });
  const second = await recordCommissionLedgerCredit(supabase, {
    partnerId: PARTNER_A,
    commissionId: "comm-abc",
    amount: 12.5,
  });
  assert.equal(first.appended, true);
  assert.equal(second.duplicate, true);
  assert.equal(supabase.tables.partner_financial_ledger_entries.length, 1);
}

async function testLedgerBalanceInvariant() {
  const entries = [
    {
      entry_direction: "credit",
      amount: 10,
      balance_bucket: LEDGER_BALANCE_BUCKETS.PENDING,
      lifecycle_status: "pending",
    },
    {
      entry_direction: "debit",
      amount: 10,
      balance_bucket: LEDGER_BALANCE_BUCKETS.PENDING,
      lifecycle_status: "payable",
    },
    {
      entry_direction: "credit",
      amount: 10,
      balance_bucket: LEDGER_BALANCE_BUCKETS.WITHDRAWABLE,
      lifecycle_status: "payable",
    },
  ];
  assert.equal(sumLedgerBucket(entries, LEDGER_BALANCE_BUCKETS.PENDING), 0);
  assert.equal(sumLedgerBucket(entries, LEDGER_BALANCE_BUCKETS.WITHDRAWABLE), 10);
}

async function testCampaignTamperingStripped() {
  const supabase = createMockSupabase(seedPartnerContext());
  const valid = await validateCampaignForPartner(supabase, {
    partnerId: PARTNER_A,
    campaignSlug: "analysis",
  });
  const invalid = await validateCampaignForPartner(supabase, {
    partnerId: PARTNER_A,
    campaignSlug: "fake-campaign",
  });
  assert.equal(valid.valid, true);
  assert.equal(invalid.valid, false);

  const normalized = normalizeAttributionQuery({
    campaign: "Analysis!",
    source: "Telegram@spam",
    medium: "cpc",
    landingPath: "/partner?utm=x",
  });
  assert.equal(normalized.campaign, "analysis");
  assert.equal(normalized.source, "telegramspam");
}

async function testConcurrentQualificationTransition() {
  const supabase = createMockSupabase({
    partner_referral_qualifications: [
      {
        referral_id: REFERRAL_1,
        partner_id: PARTNER_A,
        referred_user_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        state: QUALIFICATION_STATES.SIGNUP,
      },
    ],
    partner_qualification_transitions: [],
  });

  const [a, b] = await Promise.all([
    transitionReferralQualification(supabase, {
      referralId: REFERRAL_1,
      partnerId: PARTNER_A,
      toState: QUALIFICATION_STATES.VERIFIED,
      reason: "email_verified",
    }),
    transitionReferralQualification(supabase, {
      referralId: REFERRAL_1,
      partnerId: PARTNER_A,
      toState: QUALIFICATION_STATES.VERIFIED,
      reason: "email_verified",
    }),
  ]);

  const successes = [a, b].filter((result) => result.transitioned).length;
  assert.ok(successes >= 1);
  assert.equal(
    supabase.tables.partner_referral_qualifications[0].state,
    QUALIFICATION_STATES.VERIFIED
  );
}

async function testFraudPersisted() {
  const supabase = createMockSupabase({ partner_fraud_assessments: [] });
  const { assessment, row } = await evaluateReferralSignupFraud(supabase, {
    partnerId: PARTNER_A,
    referredUserId: "user-x",
    referralId: REFERRAL_1,
    duplicateAttribution: true,
  });
  assert.equal(assessment.riskLevel, FRAUD_RISK_LEVELS.HIGH);
  assert.ok(row.id);
}

async function testMoneyRounding() {
  assert.equal(roundMoney(10.005), 10.01);
  assert.equal(roundMoney(10.004), 10);
}

async function testLedgerIdempotentRetry() {
  const supabase = createMockSupabase({ partner_financial_ledger_entries: [] });
  const key = buildLedgerIdempotencyKey(["manual", "adj-1"]);
  const first = await appendFinancialLedgerEntry(supabase, {
    partnerId: PARTNER_A,
    entryType: "manual_adjustment",
    entryDirection: "credit",
    amount: 5,
    balanceBucket: LEDGER_BALANCE_BUCKETS.WITHDRAWABLE,
    idempotencyKey: key,
  });
  const second = await appendFinancialLedgerEntry(supabase, {
    partnerId: PARTNER_A,
    entryType: "manual_adjustment",
    entryDirection: "credit",
    amount: 5,
    balanceBucket: LEDGER_BALANCE_BUCKETS.WITHDRAWABLE,
    idempotencyKey: key,
  });
  assert.equal(first.appended, true);
  assert.equal(second.duplicate, true);
}

async function testInvalidReferralAttributionDuplicate() {
  const supabase = createMockSupabase({
    ...seedPartnerContext(),
    partner_referral_attributions: [],
  });
  const first = await finalizeReferralAttribution(supabase, {
    partnerId: PARTNER_A,
    referralId: REFERRAL_1,
    referredUserId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    referralCode: "ALPHA123",
  });
  const second = await finalizeReferralAttribution(supabase, {
    partnerId: PARTNER_A,
    referralId: REFERRAL_1,
    referredUserId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    referralCode: "ALPHA123",
  });
  assert.equal(first.recorded, true);
  assert.equal(second.duplicate, true);
  assert.equal(second.reason, "already_attributed");
}

async function testInactivePartnerReferralBlocked() {
  const supabase = createMockSupabase({
    partners: [
      {
        id: PARTNER_A,
        user_id: USER_A,
        referral_code: "ALPHA123",
        status: "suspended",
        tier_key: "bronze",
      },
    ],
    partner_referrals: [
      {
        id: REFERRAL_1,
        partner_id: PARTNER_A,
        referred_user_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        referral_code: "ALPHA123",
        status: "registered",
      },
    ],
  });
  const result = await getPartnerForReferredUser(supabase, "cccccccc-cccc-cccc-cccc-cccccccccccc");
  assert.equal(result.found, false);
  assert.equal(result.reason, "inactive_partner");
}

async function testTamperedPartnerIdRejected() {
  const supabase = createMockSupabase({
    partner_referral_qualifications: [
      {
        referral_id: REFERRAL_1,
        partner_id: PARTNER_A,
        referred_user_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        state: QUALIFICATION_STATES.SIGNUP,
      },
    ],
    partner_qualification_transitions: [],
  });
  const result = await transitionReferralQualification(supabase, {
    referralId: REFERRAL_1,
    partnerId: PARTNER_B,
    toState: QUALIFICATION_STATES.VERIFIED,
    reason: "tampered_partner",
  });
  assert.equal(result.transitioned, false);
  assert.equal(result.reason, "partner_mismatch");
}

async function testTamperedAmountRejected() {
  assert.throws(() => assertPositiveMoney(-5), /INVALID_MONEY/);
  assert.throws(() => assertPositiveMoney("not-a-number"), /INVALID_MONEY/);
  await assert.rejects(
    () =>
      appendFinancialLedgerEntry(createMockSupabase(), {
        partnerId: PARTNER_A,
        entryType: "commission",
        entryDirection: "credit",
        amount: -10,
        balanceBucket: LEDGER_BALANCE_BUCKETS.PENDING,
        idempotencyKey: "bad-amount",
      }),
    /INVALID_MONEY/
  );
}

async function testFinancialReversalPreservesOriginal() {
  const supabase = createMockSupabase({ partner_financial_ledger_entries: [] });
  const credit = await appendFinancialLedgerEntry(supabase, {
    partnerId: PARTNER_A,
    entryType: "commission",
    entryDirection: "credit",
    amount: 20,
    balanceBucket: LEDGER_BALANCE_BUCKETS.WITHDRAWABLE,
    idempotencyKey: buildLedgerIdempotencyKey(["orig", "comm-1"]),
  });
  const reversal = await recordFinancialReversalEntry(supabase, {
    partnerId: PARTNER_A,
    originalEntryId: credit.entry.id,
    amount: 20,
    balanceBucket: LEDGER_BALANCE_BUCKETS.WITHDRAWABLE,
    reason: "refund",
  });
  assert.equal(reversal.appended, true);
  assert.equal(supabase.tables.partner_financial_ledger_entries.length, 2);
  assert.equal(
    supabase.tables.partner_financial_ledger_entries[1].reverses_entry_id,
    credit.entry.id
  );
  const balance = sumLedgerBucket(
    supabase.tables.partner_financial_ledger_entries,
    LEDGER_BALANCE_BUCKETS.WITHDRAWABLE
  );
  assert.equal(balance, 0);
}

async function testAttributionClickDuplicateVisitor() {
  const supabase = createMockSupabase({
    ...seedPartnerContext(),
    partner_attribution_sessions: [],
    partner_events: [],
  });
  const first = await recordAttributionClick(supabase, {
    partnerId: PARTNER_A,
    referralCode: "ALPHA123",
    visitorKey: "visitor-abc",
  });
  const second = await recordAttributionClick(supabase, {
    partnerId: PARTNER_A,
    referralCode: "ALPHA123",
    visitorKey: "visitor-abc",
  });
  assert.equal(first.recorded, true);
  assert.equal(second.duplicate, true);
}

async function testInvalidCampaignStrippedOnClick() {
  const supabase = createMockSupabase({
    ...seedPartnerContext(),
    partner_attribution_sessions: [],
    partner_events: [],
  });
  const result = await recordAttributionClick(supabase, {
    partnerId: PARTNER_A,
    referralCode: "ALPHA123",
    visitorKey: "visitor-xyz",
    attribution: { campaign: "fake-campaign" },
  });
  assert.equal(result.recorded, true);
  assert.equal(supabase.tables.partner_attribution_sessions[0].campaign_slug, null);
}

const tests = [
  ["valid referral event idempotency", testValidReferralEventIdempotency],
  ["invalid referral duplicate attribution", testInvalidReferralAttributionDuplicate],
  ["inactive partner blocked", testInactivePartnerReferralBlocked],
  ["self referral blocked", testSelfReferralBlocked],
  ["duplicate commission detection", testDuplicateCommissionDetection],
  ["qualification invalid transition", testQualificationInvalidTransition],
  ["duplicate qualification init", testDuplicateQualificationInit],
  ["tampered partner id rejected", testTamperedPartnerIdRejected],
  ["tampered amount rejected", testTamperedAmountRejected],
  ["ledger duplicate commission credit", testLedgerDuplicateCommissionCredit],
  ["ledger balance invariant", testLedgerBalanceInvariant],
  ["financial reversal accounting", testFinancialReversalPreservesOriginal],
  ["campaign tampering stripped", testCampaignTamperingStripped],
  ["invalid campaign stripped on click", testInvalidCampaignStrippedOnClick],
  ["attribution click duplicate visitor", testAttributionClickDuplicateVisitor],
  ["concurrent qualification transition", testConcurrentQualificationTransition],
  ["fraud persisted", testFraudPersisted],
  ["money rounding", testMoneyRounding],
  ["ledger idempotent retry", testLedgerIdempotentRetry],
];

let passed = 0;
let failed = 0;

for (const [name, fn] of tests) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`, error.message);
  }
}

console.log(`\nPartner Center Phase 1 tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
