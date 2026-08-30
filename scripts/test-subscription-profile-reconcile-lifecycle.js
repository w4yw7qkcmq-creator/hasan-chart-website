import assert from "node:assert/strict";
import { __resetSubscriptionActivateLocksForTests, activateSubscriptionRequest } from "../lib/admin-subscription-request-activate.js";
import { __resetAdminEventDispatchForTests } from "../lib/admin-events.js";
import { reconcileProfileSubscriptionFromRequests } from "../lib/admin-subscription-profile-reconcile.js";
import { runSubscriptionMaintenance } from "../lib/subscription-expiry-shared.js";
import {
  isActiveSubscriptionRow,
  matchesSignalSubscription,
} from "../lib/vip-recommendation-eligibility.js";

const USER_EMAIL = "subscriber@example.com";
const ADMIN_USER = { id: "admin-id", email: "admin@example.com" };
const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_REQUEST_ID = "22222222-2222-4222-8222-222222222222";

function futureIso(days = 30) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function pastIso(days = 1) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function createLifecycleSupabase(initialRows = [], options = {}) {
  const rows = initialRows.map((row) => ({ ...row }));
  const profileUpdates = [];
  let profileState = {
    email: USER_EMAIL,
    subscription_status: options.profileStatus || "غير نشط",
    subscription_plan: options.profilePlan || "بدون اشتراك",
    username: "subscriber",
    role: "user",
  };
  const { profileUpdateFails = false } = options;

  const supabase = {
    rows,
    profileUpdates,
    getProfileState() {
      return { ...profileState };
    },
    from(table) {
      if (table === "subscription_requests") {
        return {
          select(_columns) {
            return {
              eq(column, value) {
                if (column === "user_email") {
                  const listChain = {
                    _allowedStatuses: null,
                    in(_statusColumn, allowedStatuses) {
                      listChain._allowedStatuses = allowedStatuses;
                      return listChain;
                    },
                    order() {
                      return listChain;
                    },
                    limit() {
                      const data = rows.filter(
                        (row) =>
                          String(row.user_email || "").toLowerCase() ===
                            String(value || "").toLowerCase() &&
                          listChain._allowedStatuses?.includes(row.status)
                      );
                      return Promise.resolve({ data, error: null });
                    },
                  };
                  return listChain;
                }

                if (column === "status") {
                  return {
                    not(_subColumn, _subValue) {
                      return Promise.resolve({
                        data: rows.filter(
                          (row) => row.status === value && row.expires_at != null
                        ),
                        error: null,
                      });
                    },
                  };
                }

                return {
                  async maybeSingle() {
                    const match = rows.find((row) => String(row.id) === String(value));
                    return { data: match ? { ...match } : null, error: null };
                  },
                };
              },
            };
          },
          update(nextValues) {
            return {
              eq(column, value) {
                const chain = {
                  filters: [[column, value]],
                  eq(col2, val2) {
                    chain.filters.push([col2, val2]);
                    return chain;
                  },
                  select() {
                    return chain;
                  },
                  async maybeSingle() {
                    const match = rows.find((row) =>
                      chain.filters.every(([col, val]) => row[col] === val)
                    );
                    if (!match) {
                      return { data: null, error: null };
                    }
                    Object.assign(match, nextValues);
                    return {
                      data: {
                        id: match.id,
                        status: match.status,
                        started_at: match.started_at,
                        expires_at: match.expires_at,
                      },
                      error: null,
                    };
                  },
                };
                return chain;
              },
            };
          },
        };
      }

      if (table === "profiles") {
        return {
          select() {
            return {
              eq(_column, value) {
                return {
                  async maybeSingle() {
                    if (String(value).toLowerCase() !== USER_EMAIL) {
                      return { data: null, error: null };
                    }
                    return { data: { ...profileState }, error: null };
                  },
                };
              },
            };
          },
          update(values) {
            return {
              eq(_column, value) {
                profileUpdates.push({ email: value, values });
                if (profileUpdateFails) {
                  return Promise.resolve({ error: { message: "profile update failed" } });
                }
                profileState = { ...profileState, ...values };
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }

      if (table === "notifications") {
        return {
          insert() {
            return Promise.resolve({ error: null });
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return supabase;
}

function createActivateOptions(overrides = {}) {
  return {
    adminUser: ADMIN_USER,
    requestId: REQUEST_ID,
    userEmail: USER_EMAIL,
    planName: "فيوتشر - شهر",
    dispatchAdminEventFn:
      overrides.dispatchAdminEventFn || (async () => ({ success: true, warnings: [] })),
    adminEventDeps: overrides.adminEventDeps,
    onPartnerActivated: overrides.onPartnerActivated || (async () => ({ ok: true })),
  };
}

async function testActivationReconcilesProfile() {
  __resetSubscriptionActivateLocksForTests();
  __resetAdminEventDispatchForTests();

  const supabase = createLifecycleSupabase([
    {
      id: REQUEST_ID,
      user_email: USER_EMAIL,
      plan_name: "فيوتشر - شهر",
      category: "باقات الفيوتشر",
      status: "قيد المعالجة",
      created_at: "2026-08-01T00:00:00.000Z",
    },
  ]);

  const result = await activateSubscriptionRequest(supabase, createActivateOptions());

  assert.equal(result.success, true);
  assert.equal(result.profileUpdated, true);
  assert.equal(supabase.getProfileState().subscription_status, "نشط");
  assert.match(supabase.getProfileState().subscription_plan, /فيوتشر/);
  console.log("✓ activation reconciles profile to active with correct plan");
}

async function testMultiSubscriptionExpiryKeepsProfileActive() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ id: "email-id" }),
  });

  try {
    const supabase = createLifecycleSupabase(
      [
        {
          id: REQUEST_ID,
          user_email: USER_EMAIL,
          plan_name: "سبوت - شهر",
          category: "باقات السبوت",
          status: "مفعل",
          expires_at: pastIso(1),
          expired_notice_sent: false,
        },
        {
          id: OTHER_REQUEST_ID,
          user_email: USER_EMAIL,
          plan_name: "فيوتشر - شهر",
          category: "باقات الفيوتشر",
          status: "مفعل",
          expires_at: futureIso(20),
          expired_notice_sent: false,
        },
      ],
      { profileStatus: "نشط", profilePlan: "سبوت - شهر | فيوتشر - شهر" }
    );

    const summary = await runSubscriptionMaintenance(supabase, {
      dryRun: false,
      nowMs: Date.now(),
    });

    assert.equal(summary.expired, 1);
    assert.equal(summary.requestsUpdated, 1);
    assert.equal(
      supabase.rows.find((row) => row.id === REQUEST_ID)?.status,
      "منتهي"
    );
    assert.equal(
      supabase.rows.find((row) => row.id === OTHER_REQUEST_ID)?.status,
      "مفعل"
    );
    assert.equal(supabase.getProfileState().subscription_status, "نشط");
    assert.match(supabase.getProfileState().subscription_plan, /فيوتشر/);
    assert.doesNotMatch(supabase.getProfileState().subscription_plan, /سبوت/);
    console.log("✓ multi-subscription expiry keeps profile active");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testLastSubscriptionExpiryReconcilesInactive() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ id: "email-id" }),
  });

  try {
    const supabase = createLifecycleSupabase(
      [
        {
          id: REQUEST_ID,
          user_email: USER_EMAIL,
          plan_name: "فيوتشر - شهر",
          category: "باقات الفيوتشر",
          status: "مفعل",
          expires_at: pastIso(1),
          expired_notice_sent: false,
        },
      ],
      { profileStatus: "نشط", profilePlan: "فيوتشر - شهر" }
    );

    const summary = await runSubscriptionMaintenance(supabase, {
      dryRun: false,
      nowMs: Date.now(),
    });

    assert.equal(summary.expired, 1);
    assert.equal(supabase.getProfileState().subscription_status, "غير نشط");
    assert.equal(supabase.getProfileState().subscription_plan, "بدون اشتراك");
    console.log("✓ last subscription expiry reconciles profile inactive");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testRemainingPlanReflectsSurvivingSubscription() {
  const supabase = createLifecycleSupabase([
    {
      id: REQUEST_ID,
      user_email: USER_EMAIL,
      plan_name: "سبوت - 3 أشهر",
      category: "باقات السبوت",
      status: "مفعل",
      expires_at: futureIso(10),
      admin_disabled: false,
    },
    {
      id: OTHER_REQUEST_ID,
      user_email: USER_EMAIL,
      plan_name: "فيوتشر - شهر",
      category: "باقات الفيوتشر",
      status: "مفعل",
      expires_at: futureIso(20),
      admin_disabled: false,
    },
  ]);

  await reconcileProfileSubscriptionFromRequests(supabase, USER_EMAIL);

  const planText = supabase.getProfileState().subscription_plan;
  assert.equal(supabase.getProfileState().subscription_status, "نشط");
  assert.match(planText, /سبوت/);
  assert.match(planText, /فيوتشر/);
  console.log("✓ remaining plan text reflects surviving active subscriptions");
}

function testStaleProfileDoesNotAffectEntitlementChecks() {
  const activeRow = {
    user_email: USER_EMAIL,
    plan_name: "فيوتشر - شهر",
    category: "باقات الفيوتشر",
    status: "مفعل",
    expires_at: futureIso(20),
  };
  const staleProfile = {
    subscription_status: "غير نشط",
    subscription_plan: "بدون اشتراك",
  };

  assert.equal(isActiveSubscriptionRow(activeRow), true);
  assert.equal(isActiveSubscriptionRow(staleProfile), false);
  assert.equal(
    matchesSignalSubscription(`${activeRow.plan_name} ${activeRow.category}`, "futures"),
    true
  );
  console.log("✓ stale profile does not affect VIP entitlement checks");
}

async function testActivationSurfacesReconcileFailureWithoutRevokingEntitlement() {
  __resetSubscriptionActivateLocksForTests();
  __resetAdminEventDispatchForTests();

  const supabase = createLifecycleSupabase(
    [
      {
        id: REQUEST_ID,
        user_email: USER_EMAIL,
        plan_name: "فيوتشر - شهر",
        category: "باقات الفيوتشر",
        status: "قيد المعالجة",
        created_at: "2026-08-01T00:00:00.000Z",
      },
    ],
    { profileUpdateFails: true }
  );

  const result = await activateSubscriptionRequest(supabase, createActivateOptions());

  assert.equal(result.success, true);
  assert.equal(result.status, "مفعل");
  assert.equal(result.profileUpdated, false);
  assert.ok(result.warnings.some((item) => /تحديث صلاحية المستخدم/.test(item)));
  assert.equal(
    supabase.rows.find((row) => row.id === REQUEST_ID)?.status,
    "مفعل"
  );
  console.log("✓ activation succeeds when profile reconcile fails");
}

const tests = [
  ["activation reconciles profile", testActivationReconcilesProfile],
  ["multi-subscription expiry keeps profile active", testMultiSubscriptionExpiryKeepsProfileActive],
  ["last subscription expiry reconciles inactive", testLastSubscriptionExpiryReconcilesInactive],
  ["remaining plan reflects surviving subscription", testRemainingPlanReflectsSurvivingSubscription],
  ["stale profile does not affect entitlement checks", testStaleProfileDoesNotAffectEntitlementChecks],
  [
    "activation surfaces reconcile failure without revoking entitlement",
    testActivationSurfacesReconcileFailureWithoutRevokingEntitlement,
  ],
];

let failed = 0;

for (const [name, run] of tests) {
  try {
    await run();
  } catch (error) {
    failed += 1;
    console.error(`✗ ${name}`);
    console.error(error);
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log(`\n${tests.length}/${tests.length} subscription profile reconcile lifecycle tests passed`);
