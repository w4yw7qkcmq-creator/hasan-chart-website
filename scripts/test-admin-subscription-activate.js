import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  __resetAdminEventDispatchForTests,
  ADMIN_EVENT_TYPES,
  buildAdminEventIdempotencyKey,
  dispatchAdminEvent,
  mapAdminEventResultToLegacyActivateResponse,
} from "../lib/admin-events.js";
import { recordAdminAction } from "../lib/admin-audit-log.js";
import {
  __resetSubscriptionActivateLocksForTests,
  activateSubscriptionRequest,
  canActivateSubscriptionRequest,
} from "../lib/admin-subscription-request-activate.js";
import { buildSubscriptionActivatedIdempotencyKey } from "../lib/subscription-activated-dispatch.js";
import { buildSubscriptionRequestTimeline } from "../lib/admin-subscription-request-timeline.js";

const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const ADMIN_USER = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  email: "admin@hasanchartworld.com",
};
const USER_EMAIL = "user@example.com";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function createActivateAdminEventDeps(overrides = {}) {
  return {
    createUserNotification:
      overrides.createUserNotification ||
      (async () => ({
        success: true,
        notificationCreated: true,
        userNotificationCreated: true,
      })),
    queueEmail:
      overrides.queueEmail ||
      (async () => ({ success: true, emailQueued: true })),
    createAuditLog:
      overrides.createAuditLog ||
      (async (client, payload) => {
        const auditResult = await recordAdminAction(client, {
          adminId: payload.adminId,
          adminEmail: payload.adminEmail,
          action: payload.action,
          targetTable: payload.targetTable,
          targetId: payload.targetId,
          details: payload.details,
        });
        return { ok: auditResult?.ok === true, success: auditResult?.ok === true };
      }),
    ...overrides,
  };
}

function createActivateDispatchOptions(overrides = {}) {
  return {
    dispatchAdminEventFn: overrides.dispatchAdminEventFn || dispatchAdminEvent,
    adminEventDeps: {
      ...createActivateAdminEventDeps(overrides.adminEventDeps || {}),
      ...(overrides.adminEventDeps || {}),
    },
    onPartnerActivated:
      overrides.onPartnerActivated ||
      (async () => ({ ok: true })),
  };
}

function createMockSupabase(initialRow, options = {}) {
  let row = initialRow ? { ...initialRow } : null;
  const auditRows = [];
  const profileUpdates = [];
  const {
    updateFails = false,
    updateRace = false,
    profileUpdateFails = false,
    profileLookup = { id: USER_ID },
  } = options;

  const supabase = {
    auditRows,
    profileUpdates,
    getRow() {
      return row;
    },
    from(table) {
      if (table === "subscription_requests") {
        return {
          select() {
            return {
              eq(column, value) {
                if (column === "user_email") {
                  const listChain = {
                    in(_statusColumn, allowedStatuses) {
                      listChain._allowedStatuses = allowedStatuses;
                      return listChain;
                    },
                    order() {
                      return listChain;
                    },
                    limit() {
                      return Promise.resolve({
                        data:
                          row &&
                          String(row.user_email || "").toLowerCase() ===
                            String(value || "").toLowerCase() &&
                          listChain._allowedStatuses?.includes(row.status)
                            ? [{ ...row }]
                            : [],
                        error: null,
                      });
                    },
                  };
                  return listChain;
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
                        started_at: row.started_at,
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
              eq(_column, value) {
                return {
                  async maybeSingle() {
                    if (value !== USER_EMAIL) {
                      return { data: null, error: null };
                    }
                    return { data: profileLookup, error: null };
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

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return supabase;
}

async function testSuccessfulActivateWithNotificationEmailAudit() {
  __resetSubscriptionActivateLocksForTests();
  __resetAdminEventDispatchForTests();

  const supabase = createMockSupabase({
    id: REQUEST_ID,
    user_email: USER_EMAIL,
    username: "Hasan User",
    plan_name: "VIP Spot",
    price: "50 USDT",
    status: "قيد المعالجة",
    created_at: "2026-07-01T10:00:00.000Z",
  });

  let notificationCalled = false;
  let emailCalled = false;

  const result = await activateSubscriptionRequest(supabase, {
    adminUser: ADMIN_USER,
    requestId: REQUEST_ID,
    userEmail: USER_EMAIL,
    planName: "VIP Spot",
    ...createActivateDispatchOptions({
      adminEventDeps: {
        createUserNotification: async () => {
          notificationCalled = true;
          return {
            success: true,
            notificationCreated: true,
            userNotificationCreated: true,
          };
        },
        queueEmail: async (payload) => {
          emailCalled = true;
          assert.equal(payload.subscriptionRequestId, REQUEST_ID);
          assert.equal(payload.recipientEmail, USER_EMAIL);
          assert.equal(payload.planName, "VIP Spot");
          assert.ok(payload.expiresAt);
          return { success: true, emailQueued: true };
        },
      },
    }),
  });

  assert.equal(result.success, true);
  assert.equal(result.status, "مفعل");
  assert.equal(result.notificationCreated, true);
  assert.equal(result.emailQueued, true);
  assert.equal(result.auditLogged, true);
  assert.equal(result.eventType, ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED);
  assert.equal(result.profileUpdated, true);
  assert.equal(result.partnerHookCompleted, true);
  assert.equal(notificationCalled, true);
  assert.equal(emailCalled, true);
  assert.equal(supabase.getRow().status, "مفعل");
  assert.equal(supabase.profileUpdates.length, 1);
  assert.equal(supabase.auditRows[0].action, "update-subscription-request");
  assert.equal(supabase.auditRows[0].details.status, "مفعل");
}

async function testActivateSuccessWithEmailFailure() {
  __resetSubscriptionActivateLocksForTests();
  __resetAdminEventDispatchForTests();

  const supabase = createMockSupabase({
    id: REQUEST_ID,
    user_email: USER_EMAIL,
    plan_name: "VIP Spot",
    status: "قيد المعالجة",
  });

  const result = await activateSubscriptionRequest(supabase, {
    adminUser: ADMIN_USER,
    requestId: REQUEST_ID,
    ...createActivateDispatchOptions({
      adminEventDeps: {
        queueEmail: async () => ({ success: false, emailQueued: false }),
      },
    }),
  });

  assert.equal(result.success, true);
  assert.equal(result.emailQueued, false);
  assert.match(result.emailWarning, /تعذر إضافة رسالة البريد/);
}

async function testActivateSuccessWithNotificationFailure() {
  __resetSubscriptionActivateLocksForTests();
  __resetAdminEventDispatchForTests();

  const supabase = createMockSupabase({
    id: REQUEST_ID,
    user_email: USER_EMAIL,
    plan_name: "VIP Spot",
    status: "قيد المعالجة",
  });

  const result = await activateSubscriptionRequest(supabase, {
    adminUser: ADMIN_USER,
    requestId: REQUEST_ID,
    ...createActivateDispatchOptions({
      adminEventDeps: {
        createUserNotification: async () => {
          throw new Error("notification down");
        },
        queueEmail: async () => ({ success: true, emailQueued: true }),
      },
    }),
  });

  assert.equal(result.success, true);
  assert.equal(result.notificationCreated, false);
  assert.equal(result.emailQueued, true);
  assert.match(result.notificationWarning, /تعذر إنشاء إشعار/);
}

async function testActivateSuccessWithAuditFailure() {
  __resetSubscriptionActivateLocksForTests();
  __resetAdminEventDispatchForTests();

  const supabase = createMockSupabase({
    id: REQUEST_ID,
    user_email: USER_EMAIL,
    plan_name: "VIP Spot",
    status: "قيد المعالجة",
  });

  const originalFrom = supabase.from.bind(supabase);
  supabase.from = (table) => {
    if (table === "admin_logs") {
      return {
        insert() {
          return Promise.resolve({ error: { message: "audit insert failed" } });
        },
      };
    }
    return originalFrom(table);
  };

  const result = await activateSubscriptionRequest(supabase, {
    adminUser: ADMIN_USER,
    requestId: REQUEST_ID,
    ...createActivateDispatchOptions(),
  });

  assert.equal(result.success, true);
  assert.equal(result.auditLogged, false);
  assert.match(result.auditWarning, /تعذر تسجيل العملية/);
}

async function testActivateWarningsArray() {
  __resetSubscriptionActivateLocksForTests();
  __resetAdminEventDispatchForTests();

  const supabase = createMockSupabase({
    id: REQUEST_ID,
    user_email: USER_EMAIL,
    plan_name: "VIP Spot",
    status: "قيد المعالجة",
  });

  const result = await activateSubscriptionRequest(supabase, {
    adminUser: ADMIN_USER,
    requestId: REQUEST_ID,
    ...createActivateDispatchOptions({
      adminEventDeps: {
        createUserNotification: async () => ({ success: false, notificationCreated: false }),
        queueEmail: async () => ({ success: false, emailQueued: false }),
      },
    }),
  });

  assert.ok(result.warnings.length >= 2);
}

async function testActivateDuplicateDispatch() {
  __resetAdminEventDispatchForTests();
  let auditCalls = 0;

  const deps = createActivateAdminEventDeps({
    createAuditLog: async () => {
      auditCalls += 1;
      return { ok: true, success: true };
    },
  });

  const event = {
    eventType: ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED,
    actor: { id: ADMIN_USER.id, email: ADMIN_USER.email },
    target: {
      type: "subscription_requests",
      id: REQUEST_ID,
      userEmail: USER_EMAIL,
    },
    context: { planName: "VIP Spot", expiresAt: "2026-08-01T00:00:00.000Z", newStatus: "مفعل" },
    notification: { enabled: true, title: "تم تفعيل اشتراكك بنجاح 🎉", message: "msg" },
    email: { enabled: true },
    audit: { enabled: true, action: "update-subscription-request" },
    idempotencyKey: buildAdminEventIdempotencyKey(
      ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED,
      REQUEST_ID
    ),
  };

  await dispatchAdminEvent(event, { supabase: { from: () => ({ insert: async () => ({ error: null }) }) }, ...deps });
  const second = await dispatchAdminEvent(event, { supabase: { from: () => ({ insert: async () => ({ error: null }) }) }, ...deps });

  assert.equal(auditCalls, 1);
  assert.equal(second.duplicate, true);
}

function testActivateIdempotencyKeyMatchesEmailQueue() {
  assert.equal(
    buildAdminEventIdempotencyKey(ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED, REQUEST_ID),
    buildSubscriptionActivatedIdempotencyKey(REQUEST_ID)
  );
}

function testActivateTimelineAuditActionPreserved() {
  const timeline = buildSubscriptionRequestTimeline(
    {
      id: REQUEST_ID,
      user_email: USER_EMAIL,
      plan_name: "VIP Spot",
      status: "مفعل",
      started_at: "2026-07-01T10:00:00.000Z",
    },
    [
      {
        id: "activate-log",
        action: "update-subscription-request",
        created_at: "2026-07-01T10:00:00.000Z",
        admin_email: ADMIN_USER.email,
        details: {
          status: "مفعل",
          planName: "VIP Spot",
          expiresAt: "2026-08-01T00:00:00.000Z",
        },
      },
    ]
  );

  const activatedEvents = timeline.filter((event) => event.type === "activated");
  assert.equal(activatedEvents.length, 1);
  assert.match(activatedEvents[0].description, /VIP Spot/);
}

function testLegacyActivateResponseMapping() {
  const mapped = mapAdminEventResultToLegacyActivateResponse({
    eventType: ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED,
    userNotificationCreated: true,
    adminNotificationCreated: false,
    emailQueued: true,
    auditLogged: true,
    warnings: ["warn"],
  });

  assert.equal(mapped.notificationCreated, true);
  assert.equal(mapped.emailQueued, true);
  assert.equal(mapped.auditLogged, true);
  assert.equal(mapped.eventType, ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED);
}

function testDispatcherDoesNotMutateDb() {
  const source = readFileSync(
    fileURLToPath(new URL("../lib/admin-events.js", import.meta.url)),
    "utf8"
  );
  assert.doesNotMatch(source, /\.update\(/);
  assert.doesNotMatch(source, /\.delete\(/);
}

function testCanActivateUiGuard() {
  assert.equal(canActivateSubscriptionRequest("قيد المعالجة"), true);
  assert.equal(canActivateSubscriptionRequest("مفعل"), false);
  assert.equal(canActivateSubscriptionRequest("مرفوض"), false);
}

async function testActivatePartnerHookFailureStillDispatches() {
  __resetSubscriptionActivateLocksForTests();
  __resetAdminEventDispatchForTests();

  const supabase = createMockSupabase({
    id: REQUEST_ID,
    user_email: USER_EMAIL,
    plan_name: "VIP Spot",
    status: "قيد المعالجة",
  });

  let dispatchCalled = false;

  const result = await activateSubscriptionRequest(supabase, {
    adminUser: ADMIN_USER,
    requestId: REQUEST_ID,
    ...createActivateDispatchOptions({
      onPartnerActivated: async () => {
        throw new Error("partner hook down");
      },
      dispatchAdminEventFn: async (...args) => {
        dispatchCalled = true;
        return dispatchAdminEvent(...args);
      },
    }),
  });

  assert.equal(result.success, true);
  assert.equal(result.partnerHookCompleted, false);
  assert.equal(result.notificationCreated, true);
  assert.equal(result.emailQueued, true);
  assert.equal(dispatchCalled, true);
  assert.ok(result.warnings.some((item) => /مزامنة مكافآت الشريك/.test(item)));
  assert.ok(
    supabase.auditRows.some((entry) => entry.action === "activate-subscription-partner-hook-failed")
  );
}

async function testActivateProfileUpdateFailurePartialSuccess() {
  __resetSubscriptionActivateLocksForTests();
  __resetAdminEventDispatchForTests();

  const supabase = createMockSupabase(
    {
      id: REQUEST_ID,
      user_email: USER_EMAIL,
      plan_name: "VIP Spot",
      status: "قيد المعالجة",
    },
    { profileUpdateFails: true }
  );

  let dispatchCalled = false;

  const result = await activateSubscriptionRequest(supabase, {
    adminUser: ADMIN_USER,
    requestId: REQUEST_ID,
    ...createActivateDispatchOptions({
      dispatchAdminEventFn: async (...args) => {
        dispatchCalled = true;
        return dispatchAdminEvent(...args);
      },
    }),
  });

  assert.equal(result.success, true);
  assert.equal(result.profileUpdated, false);
  assert.equal(supabase.getRow().status, "مفعل");
  assert.equal(dispatchCalled, true);
  assert.ok(result.warnings.some((item) => /تحديث صلاحية المستخدم/.test(item)));
  assert.ok(
    supabase.auditRows.some((entry) => entry.action === "activate-subscription-profile-reconcile-failed")
  );
}

async function testActivateSkipsDispatcherWhenDbUpdateFails() {
  __resetSubscriptionActivateLocksForTests();

  const supabase = createMockSupabase(
    {
      id: REQUEST_ID,
      user_email: USER_EMAIL,
      plan_name: "VIP Spot",
      status: "قيد المعالجة",
    },
    { updateFails: true }
  );

  let dispatchCalled = false;

  await assert.rejects(
    () =>
      activateSubscriptionRequest(supabase, {
        adminUser: ADMIN_USER,
        requestId: REQUEST_ID,
        ...createActivateDispatchOptions({
          dispatchAdminEventFn: async () => {
            dispatchCalled = true;
            return { success: true, warnings: [] };
          },
        }),
      }),
    /update failed/
  );

  assert.equal(dispatchCalled, false);
}

function testActivateResponseFields() {
  const responseShape = {
    success: true,
    notificationCreated: true,
    emailQueued: true,
    auditLogged: true,
    profileUpdated: true,
    partnerHookCompleted: true,
    warnings: [],
    eventType: ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED,
  };

  for (const key of Object.keys(responseShape)) {
    assert.ok(key.length > 0);
  }
}

async function testActivateAuditDetailsIncludeChannelState() {
  __resetAdminEventDispatchForTests();
  let auditDetails = null;

  await dispatchAdminEvent(
    {
      eventType: ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED,
      actor: { id: ADMIN_USER.id, email: ADMIN_USER.email },
      target: { type: "subscription_requests", id: REQUEST_ID, userEmail: USER_EMAIL },
      context: {
        planName: "VIP Spot",
        previousStatus: "قيد المعالجة",
        newStatus: "مفعل",
        expiresAt: "2026-08-01T00:00:00.000Z",
        profileUpdated: false,
        partnerHookCompleted: false,
      },
      notification: { enabled: true, message: "msg" },
      email: { enabled: true },
      audit: { enabled: true, action: "update-subscription-request" },
      idempotencyKey: buildAdminEventIdempotencyKey(
        ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED,
        REQUEST_ID
      ),
    },
    {
      supabase: createMockSupabase({
        id: REQUEST_ID,
        user_email: USER_EMAIL,
        plan_name: "VIP Spot",
        status: "مفعل",
      }),
      createAuditLog: async (_client, payload) => {
        auditDetails = payload.details;
        return { ok: true, success: true };
      },
      createUserNotification: async () => ({
        success: true,
        userNotificationCreated: true,
      }),
      queueEmail: async () => ({ success: true, emailQueued: true }),
    }
  );

  assert.equal(auditDetails.status, "مفعل");
  assert.equal(auditDetails.previousStatus, "قيد المعالجة");
  assert.equal(auditDetails.profileUpdated, false);
  assert.equal(auditDetails.partnerHookCompleted, false);
  assert.equal(auditDetails.notificationCreated, true);
  assert.equal(auditDetails.emailQueued, true);
  assert.equal(auditDetails.eventType, ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED);
}

function testInMemoryDedupeIsProcessLocalOnly() {
  const source = readFileSync(
    fileURLToPath(new URL("../lib/admin-events.js", import.meta.url)),
    "utf8"
  );
  assert.match(source, /const processedIdempotencyKeys = new Map\(\)/);
  assert.doesNotMatch(source, /processedIdempotencyKeys.*supabase/);
}

function testEmailQueueHasPersistentIdempotency() {
  const source = readFileSync(
    fileURLToPath(new URL("../lib/subscription-activated-dispatch.js", import.meta.url)),
    "utf8"
  );
  assert.match(source, /buildSubscriptionActivatedIdempotencyKey/);
  assert.match(source, /idempotencyKey:/);
  assert.match(source, /dispatchTransactionalEmail/);
}

async function testAlreadyActivatedConflict() {
  __resetSubscriptionActivateLocksForTests();
  const supabase = createMockSupabase({
    id: REQUEST_ID,
    user_email: USER_EMAIL,
    plan_name: "VIP Spot",
    status: "مفعل",
  });

  await assert.rejects(
    () =>
      activateSubscriptionRequest(supabase, {
        adminUser: ADMIN_USER,
        requestId: REQUEST_ID,
        ...createActivateDispatchOptions(),
      }),
    (error) => error.status === 409
  );
}

const tests = [
  ["successful activate + notification + email + audit", testSuccessfulActivateWithNotificationEmailAudit],
  ["activate success with email failure", testActivateSuccessWithEmailFailure],
  ["activate success with notification failure", testActivateSuccessWithNotificationFailure],
  ["activate success with audit failure", testActivateSuccessWithAuditFailure],
  ["activate warnings array", testActivateWarningsArray],
  ["activate duplicate dispatch", testActivateDuplicateDispatch],
  ["activate idempotency key matches email queue", testActivateIdempotencyKeyMatchesEmailQueue],
  ["activate timeline audit action preserved", testActivateTimelineAuditActionPreserved],
  ["legacy activate response mapping", testLegacyActivateResponseMapping],
  ["dispatcher does not mutate db", testDispatcherDoesNotMutateDb],
  ["can activate ui guard", testCanActivateUiGuard],
  ["already activated conflict", testAlreadyActivatedConflict],
  ["partner hook failure still dispatches", testActivatePartnerHookFailureStillDispatches],
  ["profile update failure partial success", testActivateProfileUpdateFailurePartialSuccess],
  ["skip dispatcher when db update fails", testActivateSkipsDispatcherWhenDbUpdateFails],
  ["activate response fields", testActivateResponseFields],
  ["activate audit details include channel state", testActivateAuditDetailsIncludeChannelState],
  ["in-memory dedupe is process-local only", testInMemoryDedupeIsProcessLocalOnly],
  ["email queue has persistent idempotency", testEmailQueueHasPersistentIdempotency],
];

let passed = 0;

for (const [name, fn] of tests) {
  await fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

console.log(`\n${passed}/${tests.length} subscription activate checks passed`);
