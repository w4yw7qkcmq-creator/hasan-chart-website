import assert from "node:assert/strict";
import { reconcileProfileSubscriptionFromRequests } from "../lib/admin-subscription-profile-reconcile.js";

const USER_EMAIL = "subscriber@example.com";

function futureIso(days = 30) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function buildReconcilePayload(activeRows) {
  const planText = activeRows
    .map((row) => [row.plan_name, row.category].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" | ");
  const expectedStatus = activeRows.length ? "نشط" : "غير نشط";
  const expectedPlan = planText || "بدون اشتراك";
  return { expectedStatus, expectedPlan, active_request_count: activeRows.length };
}

function filterActiveRows(rows) {
  return rows.filter((row) => {
    if (row?.admin_disabled) return false;
    if (row?.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return false;
    return ["مفعل", "نشط", "active"].includes(row.status);
  });
}

function createRpcSupabase(rows, options = {}) {
  const subscriptionRows = rows.map((row) => ({ ...row }));
  let profileState = {
    email: USER_EMAIL,
    subscription_status: options.profileStatus || "غير نشط",
    subscription_plan: options.profilePlan || "بدون اشتراك",
  };
  const { rpcMismatch = false, rpcError = null } = options;

  const supabase = {
    getProfileState() {
      return { ...profileState };
    },
    from(table) {
      if (table === "subscription_requests") {
        return {
          select() {
            return {
              eq(column, value) {
                const listChain = {
                  in(_statusColumn, allowedStatuses) {
                    listChain._allowedStatuses = allowedStatuses;
                    return listChain;
                  },
                  order() {
                    return listChain;
                  },
                  limit() {
                    const data = subscriptionRows.filter(
                      (row) =>
                        String(row.user_email || "").toLowerCase() === String(value || "").toLowerCase() &&
                        listChain._allowedStatuses?.includes(row.status)
                    );
                    return Promise.resolve({ data, error: null });
                  },
                };
                return listChain;
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
    async rpc(fn, params) {
      if (fn !== "reconcile_profile_subscription_from_requests") {
        throw new Error(`Unexpected rpc ${fn}`);
      }
      if (rpcError) {
        return { data: null, error: rpcError };
      }

      const email = String(params.p_user_email || "").toLowerCase();
      const activeRows = filterActiveRows(
        subscriptionRows.filter((row) => String(row.user_email || "").toLowerCase() === email)
      );
      const { expectedStatus, expectedPlan, active_request_count } = buildReconcilePayload(activeRows);

      if (rpcMismatch) {
        return {
          data: {
            success: true,
            profile_matched: false,
            expected_status: expectedStatus,
            expected_plan: expectedPlan,
            actual_status: profileState.subscription_status,
            actual_plan: profileState.subscription_plan,
            active_request_count,
            profiles_updated: 0,
          },
          error: null,
        };
      }

      profileState = {
        ...profileState,
        subscription_status: expectedStatus,
        subscription_plan: expectedPlan,
      };

      return {
        data: {
          success: true,
          profile_matched: true,
          expected_status: expectedStatus,
          expected_plan: expectedPlan,
          actual_status: expectedStatus,
          actual_plan: expectedPlan,
          active_request_count,
          profiles_updated: 1,
        },
        error: null,
      };
    },
  };

  return supabase;
}

async function testStaleInactiveProfileReconcilesActive() {
  const supabase = createRpcSupabase([
    {
      id: "req-1",
      user_email: USER_EMAIL,
      plan_name: "فيوتشر - شهر",
      category: "باقات الفيوتشر",
      status: "مفعل",
      expires_at: futureIso(20),
      admin_disabled: false,
    },
  ]);

  await reconcileProfileSubscriptionFromRequests(supabase, USER_EMAIL);

  assert.equal(supabase.getProfileState().subscription_status, "نشط");
  assert.match(supabase.getProfileState().subscription_plan, /فيوتشر/);
  console.log("✓ stale inactive profile reconciles to active via RPC");
}

async function testNoActiveRequestsReconcilesInactive() {
  const supabase = createRpcSupabase([], {
    profileStatus: "نشط",
    profilePlan: "فيوتشر - شهر",
  });

  await reconcileProfileSubscriptionFromRequests(supabase, USER_EMAIL);

  assert.equal(supabase.getProfileState().subscription_status, "غير نشط");
  assert.equal(supabase.getProfileState().subscription_plan, "بدون اشتراك");
  console.log("✓ no active requests reconciles profile inactive");
}

async function testCannotInventActiveWithoutQualifyingRequests() {
  const supabase = createRpcSupabase([
    {
      id: "req-1",
      user_email: USER_EMAIL,
      plan_name: "فيوتشر - شهر",
      category: "باقات الفيوتشر",
      status: "منتهي",
      expires_at: futureIso(20),
      admin_disabled: false,
    },
  ]);

  await reconcileProfileSubscriptionFromRequests(supabase, USER_EMAIL);

  assert.equal(supabase.getProfileState().subscription_status, "غير نشط");
  assert.equal(supabase.getProfileState().subscription_plan, "بدون اشتراك");
  console.log("✓ reconcile cannot invent active entitlement without qualifying requests");
}

async function testSilentNoOpMismatchThrows() {
  const supabase = createRpcSupabase(
    [
      {
        id: "req-1",
        user_email: USER_EMAIL,
        plan_name: "فيوتشر - شهر",
        category: "باقات الفيوتشر",
        status: "مفعل",
        expires_at: futureIso(20),
        admin_disabled: false,
      },
    ],
    { rpcMismatch: true, profileStatus: "غير نشط" }
  );

  await assert.rejects(
    () => reconcileProfileSubscriptionFromRequests(supabase, USER_EMAIL),
    /did not persist expected state/
  );
  assert.equal(supabase.getProfileState().subscription_status, "غير نشط");
  console.log("✓ silent no-op mismatch is detected and throws");
}

const tests = [
  ["stale inactive profile reconciles active", testStaleInactiveProfileReconcilesActive],
  ["no active requests reconciles inactive", testNoActiveRequestsReconcilesInactive],
  ["cannot invent active without qualifying requests", testCannotInventActiveWithoutQualifyingRequests],
  ["silent no-op mismatch throws", testSilentNoOpMismatchThrows],
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

console.log(`\n${tests.length}/${tests.length} profile subscription reconcile RPC security tests passed`);
