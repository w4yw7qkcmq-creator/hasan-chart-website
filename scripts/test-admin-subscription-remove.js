import assert from "node:assert/strict";
import {
  __resetSubscriptionRemoveLocksForTests,
  removeSubscriptionRequest,
} from "../lib/admin-subscription-request-remove.js";
import {
  canRemoveSubscriptionRequest,
  validateSubscriptionRemovePayload,
} from "../lib/admin-subscription-request-remove-shared.js";
import {
  buildSubscriptionEndedIdempotencyKey,
  dispatchSubscriptionEndedEmail,
  SUBSCRIPTION_ENDED_SUBJECT,
} from "../lib/subscription-ended-dispatch.js";
import { buildSubscriptionEndedEmailContent } from "../lib/email-layout.js";
import { buildSubscriptionRequestTimeline } from "../lib/admin-subscription-request-timeline.js";
import {
  fetchActiveSubscriptionRowsForUser,
  reconcileProfileAfterSubscriptionRemoval,
} from "../lib/admin-subscription-profile-reconcile.js";

const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_USER = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  email: "admin@hasanchartworld.com",
};
const USER_EMAIL = "user@example.com";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function createMockSupabase(initialRow, options = {}) {
  let row = initialRow ? { ...initialRow } : null;
  const otherActiveRows = Array.isArray(options.otherActiveRows) ? options.otherActiveRows : [];
  const auditRows = [];
  const profileUpdates = [];
  const { updateFails = false, updateRace = false, profileUpdateFails = false } = options;

  const supabase = {
    auditRows,
    profileUpdates,
    from(table) {
      if (table === "subscription_requests") {
        return {
          select() {
            return {
              eq(column, value) {
                if (column === "user_email") {
                  return {
                    in() {
                      return {
                        order() {
                          return {
                            limit() {
                              const activeRows = otherActiveRows.filter((item) => {
                                if (item?.admin_disabled) return false;
                                if (
                                  item?.expires_at &&
                                  new Date(item.expires_at).getTime() <= Date.now()
                                ) {
                                  return false;
                                }
                                return ["مفعل", "نشط", "active"].includes(String(item.status || "").trim());
                              });
                              return Promise.resolve({ data: activeRows, error: null });
                            },
                          };
                        },
                      };
                    },
                  };
                }

                return {
                  async maybeSingle() {
                    if (!row || String(value) !== String(row.id)) {
                      return { data: null, error: null };
                    }
                    return { data: { ...row }, error: null };
                  },
                };
              },
            };
          },
          update(nextValues) {
            assert.notEqual(
              Object.prototype.hasOwnProperty.call(nextValues, "payment_proof"),
              true,
              "remove update must not touch payment_proof"
            );
            assert.equal(nextValues.status, "منتهي");
            assert.equal(nextValues.admin_disabled, true);

            return {
              eq(_column, value) {
                const chain = {
                  eq(_statusColumn, expectedStatus) {
                    chain._expectedStatus = expectedStatus;
                    return chain;
                  },
                  select() {
                    return chain;
                  },
                  async maybeSingle() {
                    if (!row || String(value) !== String(row.id)) {
                      return { data: null, error: null };
                    }

                    if (updateFails) {
                      return { data: null, error: { message: "update failed" } };
                    }

                    if (updateRace || row.status !== chain._expectedStatus) {
                      return { data: null, error: null };
                    }

                    row = { ...row, ...nextValues };
                    return {
                      data: {
                        id: row.id,
                        status: row.status,
                        admin_disabled: row.admin_disabled,
                        expires_at: row.expires_at,
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
              eq() {
                return {
                  async maybeSingle() {
                    return { data: { id: USER_ID }, error: null };
                  },
                };
              },
            };
          },
          update(values) {
            return {
              eq(_column, email) {
                if (profileUpdateFails) {
                  return Promise.resolve({ error: { message: "profile update failed" } });
                }
                profileUpdates.push({ email, values });
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }

      if (table === "admin_logs") {
        return {
          insert(payload) {
            auditRows.push(payload);
            return Promise.resolve({ error: null });
          },
        };
      }

      throw new Error(`unexpected table ${table}`);
    },
  };

  return supabase;
}

function testCanRemoveSubscriptionRequest() {
  assert.equal(canRemoveSubscriptionRequest("مفعل"), true);
  assert.equal(canRemoveSubscriptionRequest("نشط"), true);
  assert.equal(canRemoveSubscriptionRequest("active"), true);
  assert.equal(canRemoveSubscriptionRequest("مفعل", true), false);
  assert.equal(canRemoveSubscriptionRequest("مرفوض"), false);
  assert.equal(canRemoveSubscriptionRequest("منتهي"), false);
  console.log("✓ canRemoveSubscriptionRequest");
}

function testValidateSubscriptionRemovePayload() {
  assert.deepEqual(validateSubscriptionRemovePayload({ removalNotes: "  note  " }), {
    removalNotes: "note",
  });

  assert.throws(
    () => validateSubscriptionRemovePayload({ removalNotes: "x".repeat(501) }),
    /500/
  );
  console.log("✓ validateSubscriptionRemovePayload");
}

async function testRemoveSubscriptionRequestSuccess() {
  __resetSubscriptionRemoveLocksForTests();

  const supabase = createMockSupabase({
    id: REQUEST_ID,
    user_email: USER_EMAIL,
    username: "tester",
    plan_name: "VIP Spot",
    category: "باقات السبوت",
    price: "100",
    status: "مفعل",
    created_at: "2026-01-01T00:00:00.000Z",
    payment_proof: "https://cdn.example.com/proof.jpg",
    admin_disabled: false,
  });

  let alertCalled = false;
  let emailCalled = false;

  const result = await removeSubscriptionRequest(supabase, {
    adminUser: ADMIN_USER,
    requestId: REQUEST_ID,
    removalNotes: "انتهت الخدمة",
    reconcileProfile: async () => ({
      profileReconciled: true,
      hasOtherActiveSameService: false,
      otherActiveSameServiceIds: [],
      serviceRemovedFromProfile: true,
    }),
    dispatchAlerts: async () => {
      alertCalled = true;
      return { notificationCreated: true };
    },
    dispatchEndedEmail: async () => {
      emailCalled = true;
      return { emailQueued: true };
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.status, "منتهي");
  assert.equal(result.profileReconciled, true);
  assert.equal(alertCalled, true);
  assert.equal(emailCalled, true);
  assert.equal(supabase.auditRows.length, 1);
  assert.equal(supabase.auditRows[0].action, "remove-subscription-request");
  console.log("✓ removeSubscriptionRequest success");
}

async function testRemoveKeepsProfileWhenSameServiceActive() {
  __resetSubscriptionRemoveLocksForTests();

  const otherRequestId = "33333333-3333-4333-8333-333333333333";
  const supabase = createMockSupabase(
    {
      id: REQUEST_ID,
      user_email: USER_EMAIL,
      username: "tester",
      plan_name: "VIP Spot",
      category: "باقات السبوت",
      price: "100",
      status: "مفعل",
      created_at: "2026-01-01T00:00:00.000Z",
      admin_disabled: false,
    },
    {
      otherActiveRows: [
        {
          id: otherRequestId,
          user_email: USER_EMAIL,
          plan_name: "VIP Spot",
          category: "باقات السبوت",
          status: "مفعل",
          admin_disabled: false,
          expires_at: "2027-01-01T00:00:00.000Z",
        },
      ],
    }
  );

  const result = await removeSubscriptionRequest(supabase, {
    adminUser: ADMIN_USER,
    requestId: REQUEST_ID,
    reconcileProfile: async (_client, payload) =>
      reconcileProfileAfterSubscriptionRemoval(_client, payload),
    dispatchAlerts: async () => ({ notificationCreated: true }),
    dispatchEndedEmail: async () => ({ emailQueued: true }),
  });

  assert.equal(result.profileReconciled, true);
  assert.equal(result.hasOtherActiveSameService, true);
  assert.equal(result.otherActiveSameServiceIds.includes(otherRequestId), true);
  assert.equal(
    supabase.auditRows.some((entry) => entry.action === "remove-subscription-service-retained"),
    true
  );
  assert.equal(supabase.profileUpdates[0]?.values?.subscription_status, "نشط");
  console.log("✓ remove keeps profile when same service active");
}

async function testRemoveProfileReconcileFailureStillSuccess() {
  __resetSubscriptionRemoveLocksForTests();

  const supabase = createMockSupabase({
    id: REQUEST_ID,
    user_email: USER_EMAIL,
    plan_name: "VIP Spot",
    category: "باقات السبوت",
    status: "مفعل",
    admin_disabled: false,
  }, { profileUpdateFails: true });

  const result = await removeSubscriptionRequest(supabase, {
    adminUser: ADMIN_USER,
    requestId: REQUEST_ID,
    reconcileProfile: async (_client, payload) =>
      reconcileProfileAfterSubscriptionRemoval(_client, payload),
    dispatchAlerts: async () => ({ notificationCreated: true }),
    dispatchEndedEmail: async () => ({ emailQueued: true }),
  });

  assert.equal(result.success, true);
  assert.equal(result.profileReconciled, false);
  assert.match(result.profileReconcileWarning || "", /profile/);
  assert.equal(
    supabase.auditRows.some((entry) => entry.action === "remove-subscription-profile-reconcile-failed"),
    true
  );
  assert.equal(supabase.auditRows.find((entry) => entry.action === "remove-subscription-profile-reconcile-failed")?.details?.severity, "critical");
  console.log("✓ remove reconcile failure still success");
}

async function testFetchActiveSubscriptionRowsUsesAllRows() {
  const supabase = createMockSupabase(null, {
    otherActiveRows: [
      {
        id: "a",
        plan_name: "VIP Spot",
        category: "باقات السبوت",
        status: "مفعل",
        admin_disabled: false,
      },
      {
        id: "b",
        plan_name: "VIP Futures",
        category: "باقات الفيوتشر",
        status: "مفعل",
        admin_disabled: false,
      },
    ],
  });

  const result = await fetchActiveSubscriptionRowsForUser(supabase, USER_EMAIL);
  assert.equal(result.activeRows.length, 2);
  console.log("✓ fetchActiveSubscriptionRows uses all rows");
}

function testRemoveTimelineEvent() {
  const timeline = buildSubscriptionRequestTimeline(
    {
      id: REQUEST_ID,
      plan_name: "VIP Spot",
      status: "منتهي",
      created_at: "2026-01-01T00:00:00.000Z",
      started_at: "2026-01-02T00:00:00.000Z",
      payment_proof: "proof",
    },
    [
      {
        id: "log-1",
        action: "remove-subscription-request",
        admin_email: ADMIN_USER.email,
        created_at: "2026-01-03T00:00:00.000Z",
        details: {
          removalNotes: "انتهت الخدمة",
          notificationCreated: true,
          emailQueued: true,
          timestamp: "2026-01-03T00:00:00.000Z",
        },
      },
    ]
  );

  const endedEvent = timeline.find((event) => event.type === "ended");
  assert.ok(endedEvent);
  assert.match(endedEvent.title, /إزالة/);
  console.log("✓ remove timeline event");
}

function testEndedEmailHelpers() {
  const html = buildSubscriptionEndedEmailContent({
    username: "tester",
    planName: "VIP Spot",
    price: "100",
    endedAt: "2026-01-03T00:00:00.000Z",
    removalNotes: "test",
    requestId: REQUEST_ID,
  });

  assert.match(html, /إنهاء اشتراكك/);
  assert.equal(
    buildSubscriptionEndedIdempotencyKey(REQUEST_ID),
    `subscription_ended:${REQUEST_ID}`
  );
  assert.equal(SUBSCRIPTION_ENDED_SUBJECT.includes("إنهاء"), true);
  console.log("✓ ended email helpers");
}

async function testEndedEmailDispatchMissingRecipient() {
  const result = await dispatchSubscriptionEndedEmail({
    subscriptionRequestId: REQUEST_ID,
    recipientEmail: "",
    planName: "VIP Spot",
  });

  assert.equal(result.emailQueued, false);
  console.log("✓ ended email dispatch missing recipient");
}

async function run() {
  testCanRemoveSubscriptionRequest();
  testValidateSubscriptionRemovePayload();
  await testFetchActiveSubscriptionRowsUsesAllRows();
  await testRemoveSubscriptionRequestSuccess();
  await testRemoveKeepsProfileWhenSameServiceActive();
  await testRemoveProfileReconcileFailureStillSuccess();
  testRemoveTimelineEvent();
  testEndedEmailHelpers();
  await testEndedEmailDispatchMissingRecipient();
  console.log("\nAll admin subscription remove tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
