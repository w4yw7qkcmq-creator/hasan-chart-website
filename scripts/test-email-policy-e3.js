#!/usr/bin/env node

/**
 * Phase E3 — Email consent & policy tests (mocks only).
 * Usage: node scripts/test-email-policy-e3.js
 */

import { randomUUID } from "crypto";
import { EMAIL_CATEGORIES } from "../lib/email-categories.js";
import { SUPPRESSION_REASONS } from "../lib/email-suppression.js";
import {
  evaluateEmailSendPolicy,
  EXCLUSION_REASONS,
  EMAIL_POLICY_SOURCES,
} from "../lib/email-policy/index.js";
import { evaluateEmailRecipient } from "../lib/email-recipient-eligibility.js";
import {
  isMarketingEmailAllowed,
  upsertMarketingPreferences,
  getMarketingPreferencesByUserId,
} from "../lib/email-marketing-preferences.js";
import { buildCampaignAudienceSnapshot } from "../lib/email-campaign/snapshot.js";
import { launchCampaignSending } from "../lib/email-campaign/processor.js";
import { updateCampaignDraft } from "../lib/email-campaign/store.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createMockSupabase(initial = {}) {
  const profiles = new Map((initial.profiles || []).map((p) => [p.id, { ...p }]));
  const prefs = new Map((initial.prefs || []).map((p) => [p.user_id, { ...p }]));
  const suppressions = new Map(
    (initial.suppressions || []).map((s) => [s.normalized_email, { ...s, active: s.active !== false }])
  );
  const campaigns = new Map((initial.campaigns || []).map((c) => [c.id, { ...c }]));
  const recipients = [];

  return {
    profiles,
    prefs,
    suppressions,
    campaigns,
    recipients,
    from(table) {
      const ctx = { table, filters: [], op: "select", payload: null, upsertConflict: null };
      const api = {
        select() {
          return api;
        },
        eq(col, val) {
          ctx.filters.push({ col, val, op: "eq" });
          return api;
        },
        in(col, vals) {
          ctx.filters.push({ col, vals, op: "in" });
          return api;
        },
        not() {
          return api;
        },
        is() {
          return api;
        },
        neq() {
          return api;
        },
        ilike(col, val) {
          ctx.filters.push({ col, val, op: "ilike" });
          return api;
        },
        limit(n) {
          ctx.limit = n;
          return api;
        },
        order() {
          return api;
        },
        range() {
          return api;
        },
        delete() {
          ctx.op = "delete";
          return api;
        },
        update(payload) {
          ctx.op = "update";
          ctx.payload = payload;
          return api;
        },
        insert(payload) {
          ctx.op = "insert";
          ctx.payload = payload;
          return api;
        },
        upsert(payload, opts = {}) {
          ctx.op = "upsert";
          ctx.payload = payload;
          ctx.upsertConflict = opts.onConflict;
          return api;
        },
        maybeSingle() {
          return api.then();
        },
        single() {
          return api.then();
        },
        then(resolve = (v) => v, reject = (e) => Promise.reject(e)) {
          try {
            if (table === "profiles") {
              let rows = [...profiles.values()];
              for (const f of ctx.filters) {
                if (f.op === "eq") rows = rows.filter((r) => r[f.col] === f.val);
                if (f.op === "in") rows = rows.filter((r) => f.vals.includes(r[f.col]));
                if (f.op === "ilike") {
                  const email = String(f.val).replace(/%/g, "").toLowerCase();
                  rows = rows.filter((r) => String(r.email || "").toLowerCase() === email);
                }
              }
              if (ctx.op === "select") {
                return Promise.resolve(resolve({ data: rows[0] || null, error: null })).then(resolve, reject);
              }
            }

            if (table === "email_marketing_preferences") {
              if (ctx.op === "select") {
                let row = null;
                for (const f of ctx.filters) {
                  if (f.col === "user_id") row = prefs.get(f.val) || null;
                }
                return Promise.resolve(resolve({ data: row, error: null })).then(resolve, reject);
              }
              if (ctx.op === "upsert") {
                const row = { ...ctx.payload };
                prefs.set(row.user_id, row);
                return Promise.resolve(resolve({ data: row, error: null })).then(resolve, reject);
              }
            }

            if (table === "email_suppressions") {
              if (ctx.op === "select") {
                let row = null;
                for (const f of ctx.filters) {
                  if (f.col === "normalized_email") row = suppressions.get(f.val) || null;
                  if (f.col === "active" && f.val === true && row && !row.active) row = null;
                }
                return Promise.resolve(resolve({ data: row, error: null })).then(resolve, reject);
              }
            }

            if (table === "email_campaigns") {
              if (ctx.op === "select") {
                let row = null;
                for (const f of ctx.filters) {
                  if (f.col === "id") row = campaigns.get(f.val) || null;
                }
                return Promise.resolve(resolve({ data: row, error: null })).then(resolve, reject);
              }
              if (ctx.op === "update") {
                for (const f of ctx.filters) {
                  if (f.col === "id") {
                    const existing = campaigns.get(f.val);
                    const next = { ...existing, ...ctx.payload };
                    campaigns.set(f.val, next);
                    return Promise.resolve(resolve({ data: next, error: null })).then(resolve, reject);
                  }
                }
              }
            }

            if (table === "email_campaign_recipients") {
              if (ctx.op === "delete") {
                recipients.length = 0;
                return Promise.resolve(resolve({ data: null, error: null })).then(resolve, reject);
              }
              if (ctx.op === "insert") {
                const rows = Array.isArray(ctx.payload) ? ctx.payload : [ctx.payload];
                recipients.push(...rows);
                return Promise.resolve(resolve({ data: rows, error: null })).then(resolve, reject);
              }
            }

            return Promise.resolve(resolve({ data: null, error: null })).then(resolve, reject);
          } catch (error) {
            return Promise.resolve(reject(error)).then(resolve, reject);
          }
        },
      };
      return api;
    },
    rpc(name) {
      if (name === "try_start_email_campaign_sending") {
        return Promise.resolve({ data: true, error: null });
      }
      if (name === "queue_email_campaign_recipients") {
        return Promise.resolve({ data: 1, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
}

async function testPolicyTransactionalWithoutConsent() {
  const userId = randomUUID();
  const supabase = createMockSupabase({
    profiles: [{ id: userId, email: "tx@example.com" }],
  });

  const result = await evaluateEmailSendPolicy(supabase, {
    userId,
    email: "tx@example.com",
    category: EMAIL_CATEGORIES.TRANSACTIONAL,
    messageType: "subscription_confirm",
  });

  assert(result.allowed === true, "transactional should be allowed without marketing consent");
  assert(result.consentRequired === false, "transactional should not require consent");
}

async function testMarketingDeniedWithoutConsent() {
  const userId = randomUUID();
  const supabase = createMockSupabase({
    profiles: [{ id: userId, email: "m@example.com" }],
  });

  const result = await evaluateEmailSendPolicy(supabase, {
    userId,
    email: "m@example.com",
    category: EMAIL_CATEGORIES.MARKETING,
  });

  assert(result.allowed === false, "marketing denied without consent");
  assert(result.reason === EXCLUSION_REASONS.MARKETING_NOT_OPTED_IN, "expected not opted in reason");
}

async function testMarketingAllowedWithConsent() {
  const userId = randomUUID();
  const supabase = createMockSupabase({
    profiles: [{ id: userId, email: "ok@example.com" }],
    prefs: [{ user_id: userId, marketing_opt_in: true, global_unsubscribed_at: null }],
  });

  const result = await evaluateEmailSendPolicy(supabase, {
    userId,
    email: "ok@example.com",
    category: EMAIL_CATEGORIES.MARKETING,
  });

  assert(result.allowed === true, "marketing allowed with consent");
  assert(result.consentSatisfied === true, "consent satisfied");
}

async function testMarketingUnsubscribedDenied() {
  const userId = randomUUID();
  const supabase = createMockSupabase({
    profiles: [{ id: userId, email: "unsub@example.com" }],
    prefs: [
      {
        user_id: userId,
        marketing_opt_in: false,
        global_unsubscribed_at: new Date().toISOString(),
      },
    ],
  });

  const result = await evaluateEmailSendPolicy(supabase, {
    userId,
    email: "unsub@example.com",
    category: EMAIL_CATEGORIES.MARKETING,
  });

  assert(result.allowed === false, "unsubscribed denied");
  assert(result.reason === EXCLUSION_REASONS.GLOBAL_UNSUBSCRIBED, "global unsubscribed reason");
}

async function testHardSuppressionBlocksMarketingEvenWithConsent() {
  const userId = randomUUID();
  const email = "bounce@example.com";
  const supabase = createMockSupabase({
    profiles: [{ id: userId, email }],
    prefs: [{ user_id: userId, marketing_opt_in: true, global_unsubscribed_at: null }],
    suppressions: [
      { normalized_email: email, reason: SUPPRESSION_REASONS.HARD_BOUNCE, active: true },
    ],
  });

  const result = await evaluateEmailSendPolicy(supabase, {
    userId,
    email,
    category: EMAIL_CATEGORIES.MARKETING,
  });

  assert(result.allowed === false, "hard bounce blocks marketing");
  assert(result.reason === EXCLUSION_REASONS.HARD_SUPPRESSED, "hard suppressed reason");
}

async function testServiceAnnouncementWithoutMarketingConsent() {
  const userId = randomUUID();
  const supabase = createMockSupabase({
    profiles: [{ id: userId, email: "svc@example.com" }],
  });

  const result = await evaluateEmailSendPolicy(supabase, {
    userId,
    email: "svc@example.com",
    category: EMAIL_CATEGORIES.SERVICE_ANNOUNCEMENT,
    messageType: "maintenance_notice",
  });

  assert(result.allowed === true, "service announcement allowed without marketing consent");
  assert(result.consentRequired === false, "service announcement no consent required");
}

async function testClientCannotSpoofCategoryViaLegacyWrapper() {
  const userId = randomUUID();
  const supabase = createMockSupabase({
    profiles: [{ id: userId, email: "spoof@example.com" }],
  });

  const evaluation = await evaluateEmailRecipient(supabase, {
    userId,
    email: "spoof@example.com",
    category: EMAIL_CATEGORIES.MARKETING,
    messageType: "fake-transactional",
  });

  assert(evaluation.eligible === false, "marketing category enforced server-side");
}

async function testSignupPreferenceEvidence() {
  const userId = randomUUID();
  const supabase = createMockSupabase({ profiles: [{ id: userId, email: "new@example.com" }] });

  await upsertMarketingPreferences(supabase, {
    userId,
    marketingOptIn: true,
    source: EMAIL_POLICY_SOURCES.SIGNUP_CHECKBOX,
    normalizedEmail: "new@example.com",
  });

  const row = await getMarketingPreferencesByUserId(supabase, userId);
  assert(row.marketing_opt_in === true, "signup opt-in stored");
  assert(row.source === EMAIL_POLICY_SOURCES.SIGNUP_CHECKBOX, "signup source recorded");
  assert(row.opted_in_at, "opted_in_at recorded");
}

async function testAccountOptOutAndReSubscribe() {
  const userId = randomUUID();
  const supabase = createMockSupabase({ profiles: [{ id: userId, email: "acc@example.com" }] });

  await upsertMarketingPreferences(supabase, {
    userId,
    marketingOptIn: true,
    source: EMAIL_POLICY_SOURCES.ACCOUNT_PREFERENCES,
  });

  await upsertMarketingPreferences(supabase, {
    userId,
    marketingOptIn: false,
    source: EMAIL_POLICY_SOURCES.EMAIL_UNSUBSCRIBE,
  });

  let allowed = await isMarketingEmailAllowed(supabase, { userId });
  assert(allowed.allowed === false, "opt-out blocks marketing");

  await upsertMarketingPreferences(supabase, {
    userId,
    marketingOptIn: true,
    source: EMAIL_POLICY_SOURCES.ACCOUNT_PREFERENCES,
  });

  allowed = await isMarketingEmailAllowed(supabase, { userId });
  assert(allowed.allowed === true, "explicit re-subscribe allowed");
  const row = await getMarketingPreferencesByUserId(supabase, userId);
  assert(!row.global_unsubscribed_at, "global unsubscribe cleared on re-subscribe");
}

async function testHardSuppressionNotClearedByReSubscribe() {
  const userId = randomUUID();
  const email = "complaint@example.com";
  const supabase = createMockSupabase({
    profiles: [{ id: userId, email }],
    suppressions: [{ normalized_email: email, reason: SUPPRESSION_REASONS.COMPLAINT, active: true }],
  });

  await upsertMarketingPreferences(supabase, {
    userId,
    marketingOptIn: true,
    source: EMAIL_POLICY_SOURCES.ACCOUNT_PREFERENCES,
  });

  const allowed = await isMarketingEmailAllowed(supabase, { userId, email });
  assert(allowed.allowed === false, "complaint still blocks despite opt-in");
}

async function testCampaignCategoryBypassRejected() {
  const campaignId = randomUUID();
  const supabase = createMockSupabase({
    campaigns: [
      {
        id: campaignId,
        name: "Test",
        status: "draft",
        category: "marketing",
        audience_type: "all_eligible",
        audience_filter: {},
        metadata: {},
      },
    ],
  });

  let threw = false;
  try {
    await updateCampaignDraft(supabase, campaignId, { category: "transactional" });
  } catch (error) {
    threw = true;
    assert(error.message.includes("consent"), "category bypass rejected");
  }
  assert(threw, "expected category bypass to throw");
}

async function testCampaignAudienceExcludesNoConsent() {
  const campaignId = randomUUID();
  const optedInUser = randomUUID();
  const noConsentUser = randomUUID();

  const supabase = createMockSupabase({
    profiles: [
      { id: optedInUser, email: "optin@example.com", deleted_at: null, account_status: "active" },
      { id: noConsentUser, email: "nocon@example.com", deleted_at: null, account_status: "active" },
    ],
    prefs: [{ user_id: optedInUser, marketing_opt_in: true, global_unsubscribed_at: null }],
    campaigns: [
      {
        id: campaignId,
        name: "E3 audience",
        status: "preparing",
        category: "marketing",
        audience_type: "all_eligible",
        audience_filter: {},
        metadata: {},
      },
    ],
  });

  const originalFrom = supabase.from.bind(supabase);
  supabase.from = (table) => {
    if (table === "profiles") {
      const api = originalFrom(table);
      const baseThen = api.then.bind(api);
      api.then = (resolve, reject) => {
        const profiles = [...supabase.profiles.values()].filter(
          (p) => p.email && !p.deleted_at && p.account_status !== "deleted" && p.account_status !== "banned"
        );
        return Promise.resolve(resolve({ data: profiles, error: null })).then(resolve, reject);
      };
      return api;
    }
    return originalFrom(table);
  };

  const { stats } = await buildCampaignAudienceSnapshot(supabase, supabase.campaigns.get(campaignId));
  assert(stats.eligible === 1, "only opted-in user eligible");
  assert(stats.excluded >= 1, "no-consent user excluded");
  assert(stats.marketingNotOptedIn >= 1, "marketing not opted in counted");
}

async function run() {
  const tests = [
    ["transactional without marketing consent", testPolicyTransactionalWithoutConsent],
    ["marketing without consent denied", testMarketingDeniedWithoutConsent],
    ["marketing with consent allowed", testMarketingAllowedWithConsent],
    ["marketing unsubscribed denied", testMarketingUnsubscribedDenied],
    ["hard bounce blocks marketing", testHardSuppressionBlocksMarketingEvenWithConsent],
    ["service announcement classification", testServiceAnnouncementWithoutMarketingConsent],
    ["client cannot spoof category", testClientCannotSpoofCategoryViaLegacyWrapper],
    ["signup preference evidence", testSignupPreferenceEvidence],
    ["account opt-out and re-subscribe", testAccountOptOutAndReSubscribe],
    ["complaint blocks re-subscribe sends", testHardSuppressionNotClearedByReSubscribe],
    ["campaign category bypass rejected", testCampaignCategoryBypassRejected],
    ["campaign audience excludes no-consent", testCampaignAudienceExcludesNoConsent],
  ];

  for (const [name, fn] of tests) {
    await fn();
    console.log(`✓ ${name}`);
  }

  console.log("\nPHASE E3 POLICY TESTS PASS");
}

run().catch((error) => {
  console.error("PHASE E3 POLICY TESTS FAILED");
  console.error(error);
  process.exit(1);
});
