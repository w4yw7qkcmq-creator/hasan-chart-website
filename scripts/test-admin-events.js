import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ADMIN_EVENT_TYPES,
  SUBSCRIPTION_ADMIN_EVENT_TYPES,
  __resetAdminEventDispatchForTests,
  buildAdminEventChannelIdempotencyKey,
  buildAdminEventIdempotencyKey,
  dispatchAdminEvent,
  mapAdminEventResultToLegacyActivateResponse,
  mapAdminEventResultToLegacyExtendResponse,
  mapAdminEventResultToLegacyRejectResponse,
  mapAdminEventResultToLegacyRemoveResponse,
  sanitizeAdminEventDetails,
} from "../lib/admin-events.js";

const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const USER_EMAIL = "user@example.com";

function createSupabaseStub() {
  return { from() { return { insert: async () => ({ error: null }) }; } };
}

function baseSubscriptionRejectedEvent(overrides = {}) {
  return {
    eventType: ADMIN_EVENT_TYPES.SUBSCRIPTION_REJECTED,
    actor: { id: "admin-id", email: "admin@example.com" },
    target: {
      type: "subscription_requests",
      id: REQUEST_ID,
      userId: "user-id",
      userEmail: USER_EMAIL,
    },
    context: {
      planName: "VIP Spot",
      previousStatus: "قيد المعالجة",
      newStatus: "مرفوض",
      rejectionReason: "سبب",
      rejectionNotes: "ملاحظة",
      rejectedAt: "2026-07-23T00:00:00.000Z",
    },
    notification: { enabled: true, title: "تم رفض طلب الاشتراك", message: "msg" },
    email: { enabled: true, template: "subscription_rejected" },
    audit: { enabled: true, action: "reject-subscription-request" },
    idempotencyKey: buildAdminEventIdempotencyKey(
      ADMIN_EVENT_TYPES.SUBSCRIPTION_REJECTED,
      REQUEST_ID
    ),
    ...overrides,
  };
}

function baseSubscriptionEndedEvent(overrides = {}) {
  return {
    eventType: ADMIN_EVENT_TYPES.SUBSCRIPTION_ENDED,
    actor: { id: "admin-id", email: "admin@example.com" },
    target: {
      type: "subscription_requests",
      id: REQUEST_ID,
      userId: "user-id",
      userEmail: USER_EMAIL,
    },
    context: {
      planName: "VIP Spot",
      previousStatus: "مفعل",
      newStatus: "منتهي",
      endedAt: "2026-07-23T00:00:00.000Z",
      profileReconciled: true,
      hasOtherActiveSameService: false,
      otherActiveSameServiceIds: [],
      serviceRemovedFromProfile: true,
      removalNotes: "note",
    },
    notification: { enabled: true, title: "تم إنهاء اشتراكك", message: "msg" },
    adminNotification: {
      enabled: true,
      title: "تم إنهاء اشتراك المستخدم",
      message: "msg",
    },
    email: { enabled: true, template: "subscription_ended" },
    audit: { enabled: true, action: "remove-subscription-request" },
    idempotencyKey: buildAdminEventIdempotencyKey(
      ADMIN_EVENT_TYPES.SUBSCRIPTION_ENDED,
      REQUEST_ID
    ),
    ...overrides,
  };
}

function createSuccessfulDeps(overrides = {}) {
  return {
    supabase: createSupabaseStub(),
    createAuditLog: async () => ({ ok: true, success: true }),
    createUserNotification: async () => ({
      success: true,
      notificationCreated: true,
      userNotificationCreated: true,
    }),
    createAdminNotification: async () => ({
      success: true,
      created: true,
      adminNotificationCreated: true,
    }),
    queueEmail: async () => ({ success: true, emailQueued: true }),
    ...overrides,
  };
}

function testSupportedEventTypeConstant() {
  assert.equal(ADMIN_EVENT_TYPES.SUBSCRIPTION_ENDED, "subscription.ended");
  console.log("✓ supported event type constant");
}

async function testUnsupportedEventTypeRejected() {
  __resetAdminEventDispatchForTests();
  await assert.rejects(
    () =>
      dispatchAdminEvent(
        { eventType: "user.random", target: { id: "1" } },
        { supabase: createSupabaseStub() }
      ),
    /Unsupported admin event type/
  );
  console.log("✓ unsupported event type rejected");
}

function baseSubscriptionActivatedEvent(overrides = {}) {
  return {
    eventType: ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED,
    actor: { id: "admin-id", email: "admin@example.com" },
    target: {
      type: "subscription_requests",
      id: REQUEST_ID,
      userId: "user-id",
      userEmail: USER_EMAIL,
    },
    context: {
      planName: "VIP Spot",
      previousStatus: "قيد المعالجة",
      newStatus: "مفعل",
      startedAt: "2026-07-23T00:00:00.000Z",
      expiresAt: "2026-08-23T00:00:00.000Z",
      activatedAt: "2026-07-23T00:00:00.000Z",
    },
    notification: { enabled: true, title: "تم تفعيل اشتراكك بنجاح 🎉", message: "msg" },
    email: { enabled: true, template: "subscription_activated" },
    audit: { enabled: true, action: "update-subscription-request" },
    idempotencyKey: buildAdminEventIdempotencyKey(
      ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED,
      REQUEST_ID
    ),
    ...overrides,
  };
}

async function testSubscriptionActivatedRunsUserEmailAuditOnly() {
  __resetAdminEventDispatchForTests();
  const calls = { audit: 0, user: 0, admin: 0, email: 0 };
  const result = await dispatchAdminEvent(baseSubscriptionActivatedEvent(), {
    ...createSuccessfulDeps({
      createAuditLog: async () => {
        calls.audit += 1;
        return { ok: true, success: true };
      },
      createUserNotification: async () => {
        calls.user += 1;
        return { success: true, userNotificationCreated: true, notificationCreated: true };
      },
      createAdminNotification: async () => {
        calls.admin += 1;
        return { success: true, created: true, adminNotificationCreated: true };
      },
      queueEmail: async () => {
        calls.email += 1;
        return { success: true, emailQueued: true };
      },
    }),
  });

  assert.equal(result.auditLogged, true);
  assert.equal(result.userNotificationCreated, true);
  assert.equal(result.emailQueued, true);
  assert.equal(result.adminNotificationCreated, false);
  assert.equal(calls.admin, 0);
  console.log("✓ subscription activated runs user email audit only");
}

async function testActivatedTimelineAuditActionPreserved() {
  __resetAdminEventDispatchForTests();
  let auditAction = "";
  let auditDetails = null;
  await dispatchAdminEvent(baseSubscriptionActivatedEvent(), {
    ...createSuccessfulDeps({
      createAuditLog: async (_client, payload) => {
        auditAction = payload.action;
        auditDetails = payload.details;
        return { ok: true, success: true };
      },
    }),
  });
  assert.equal(auditAction, "update-subscription-request");
  assert.equal(auditDetails.status, "مفعل");
  console.log("✓ activated timeline audit action preserved");
}

function testActivatedIdempotencyKey() {
  assert.equal(
    buildAdminEventIdempotencyKey(ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED, REQUEST_ID),
    `subscription_activated:${REQUEST_ID}`
  );
  console.log("✓ activated idempotency key");
}

function baseSubscriptionExtendedEvent(overrides = {}) {
  return {
    eventType: ADMIN_EVENT_TYPES.SUBSCRIPTION_EXTENDED,
    actor: { id: "admin-id", email: "admin@example.com" },
    target: {
      type: "subscription_requests",
      id: REQUEST_ID,
      userId: "user-id",
      userEmail: USER_EMAIL,
    },
    context: {
      planName: "VIP Spot",
      previousExpiresAt: "2026-07-01T00:00:00.000Z",
      expiresAt: "2026-08-23T00:00:00.000Z",
      days: 30,
      targetUserId: "user-id",
      beforeSnapshot: { id: REQUEST_ID, status: "مفعل", expires_at: "2026-07-01T00:00:00.000Z" },
      afterSnapshot: { id: REQUEST_ID, status: "مفعل", expires_at: "2026-08-23T00:00:00.000Z" },
      extendedAt: "2026-07-23T00:00:00.000Z",
    },
    notification: { enabled: false },
    email: { enabled: false },
    audit: { enabled: true, action: "extend_subscription" },
    idempotencyKey: buildAdminEventIdempotencyKey(
      ADMIN_EVENT_TYPES.SUBSCRIPTION_EXTENDED,
      REQUEST_ID
    ),
    ...overrides,
  };
}

async function testSubscriptionExtendedRunsAuditOnlyByDefault() {
  __resetAdminEventDispatchForTests();
  const calls = { audit: 0, user: 0, admin: 0, email: 0 };
  const result = await dispatchAdminEvent(baseSubscriptionExtendedEvent(), {
    ...createSuccessfulDeps({
      createAuditLog: async () => {
        calls.audit += 1;
        return { ok: true, success: true };
      },
      createUserNotification: async () => {
        calls.user += 1;
        return { success: true, userNotificationCreated: true, notificationCreated: true };
      },
      createAdminNotification: async () => {
        calls.admin += 1;
        return { success: true, created: true, adminNotificationCreated: true };
      },
      queueEmail: async () => {
        calls.email += 1;
        return { success: true, emailQueued: true };
      },
    }),
  });

  assert.equal(result.auditLogged, true);
  assert.equal(result.userNotificationCreated, false);
  assert.equal(result.emailQueued, false);
  assert.equal(result.adminNotificationCreated, false);
  assert.equal(calls.audit, 1);
  assert.equal(calls.user, 0);
  assert.equal(calls.email, 0);
  assert.equal(calls.admin, 0);
  console.log("✓ subscription extended runs audit only by default");
}

async function testExtendedTimelineAuditActionPreserved() {
  __resetAdminEventDispatchForTests();
  let auditAction = "";
  let auditDetails = null;
  await dispatchAdminEvent(baseSubscriptionExtendedEvent(), {
    ...createSuccessfulDeps({
      createAuditLog: async (_client, payload) => {
        auditAction = payload.action;
        auditDetails = payload.details;
        return { ok: true, success: true };
      },
    }),
  });
  assert.equal(auditAction, "extend_subscription");
  assert.equal(auditDetails.days, 30);
  assert.equal(auditDetails.before?.id, REQUEST_ID);
  assert.equal(auditDetails.after?.expires_at, "2026-08-23T00:00:00.000Z");
  console.log("✓ extended timeline audit action preserved");
}

function testExtendedIdempotencyKey() {
  assert.equal(
    buildAdminEventIdempotencyKey(ADMIN_EVENT_TYPES.SUBSCRIPTION_EXTENDED, REQUEST_ID),
    `subscription_extended:${REQUEST_ID}`
  );
  assert.equal(
    buildAdminEventChannelIdempotencyKey(
      ADMIN_EVENT_TYPES.SUBSCRIPTION_EXTENDED,
      REQUEST_ID,
      "user"
    ),
    `subscription_extended:user:${REQUEST_ID}`
  );
  console.log("✓ extended idempotency key");
}

async function testExtendedNoDuplicateDispatch() {
  __resetAdminEventDispatchForTests();
  let auditCalls = 0;
  const deps = createSuccessfulDeps({
    createAuditLog: async () => {
      auditCalls += 1;
      return { ok: true, success: true };
    },
  });
  const event = baseSubscriptionExtendedEvent();

  await dispatchAdminEvent(event, deps);
  const second = await dispatchAdminEvent(event, deps);

  assert.equal(auditCalls, 1);
  assert.equal(second.duplicate, true);
  assert.equal(second.auditLogged, true);
  console.log("✓ extended no duplicate dispatch");
}

function testLegacyExtendResponseMapping() {
  const mapped = mapAdminEventResultToLegacyExtendResponse({
    eventType: ADMIN_EVENT_TYPES.SUBSCRIPTION_EXTENDED,
    auditLogged: true,
    warnings: [],
  });
  assert.equal(mapped.auditLogged, true);
  console.log("✓ legacy extend response mapping");
}

async function testSubscriptionExtendedFullHandlerCycle() {
  __resetAdminEventDispatchForTests();
  const calls = { audit: 0, user: 0, email: 0 };
  const result = await dispatchAdminEvent(
    baseSubscriptionExtendedEvent({
      notification: { enabled: true, title: "تم تمديد اشتراكك", message: "msg" },
      email: { enabled: true, template: "subscription_extended" },
    }),
    createSuccessfulDeps({
      createAuditLog: async () => {
        calls.audit += 1;
        return { ok: true, success: true };
      },
      createUserNotification: async () => {
        calls.user += 1;
        return { success: true, userNotificationCreated: true, notificationCreated: true };
      },
      queueEmail: async () => {
        calls.email += 1;
        return { success: true, emailQueued: true };
      },
    })
  );

  assert.equal(result.auditLogged, true);
  assert.equal(result.userNotificationCreated, true);
  assert.equal(result.emailQueued, true);
  assert.equal(calls.audit, 1);
  assert.equal(calls.user, 1);
  assert.equal(calls.email, 1);
  console.log("✓ subscription extended full handler cycle");
}

function testSubscriptionRegistryCoversAllSubscriptionEvents() {
  assert.deepEqual(SUBSCRIPTION_ADMIN_EVENT_TYPES, [
    ADMIN_EVENT_TYPES.SUBSCRIPTION_ENDED,
    ADMIN_EVENT_TYPES.SUBSCRIPTION_REJECTED,
    ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED,
    ADMIN_EVENT_TYPES.SUBSCRIPTION_EXTENDED,
  ]);

  const source = readFileSync(fileURLToPath(new URL("../lib/admin-events.js", import.meta.url)), "utf8");
  for (const eventType of SUBSCRIPTION_ADMIN_EVENT_TYPES) {
    const handlerKey = eventType.replace("subscription.", "SUBSCRIPTION_").toUpperCase();
    assert.match(source, new RegExp(`\\[ADMIN_EVENT_TYPES\\.${handlerKey}\\]:`));
    assert.match(source, new RegExp(`${handlerKey}: "`));
  }
  console.log("✓ subscription registry covers all subscription events");
}

function testAdminEventHandlersRegistry() {
  const source = readFileSync(fileURLToPath(new URL("../lib/admin-events.js", import.meta.url)), "utf8");
  assert.match(source, /const ADMIN_EVENT_HANDLERS = \{/);
  assert.match(source, /\[ADMIN_EVENT_TYPES\.SUBSCRIPTION_ENDED\]: dispatchSubscriptionEndedEvent/);
  assert.match(source, /\[ADMIN_EVENT_TYPES\.SUBSCRIPTION_REJECTED\]: dispatchSubscriptionRejectedEvent/);
  assert.match(source, /\[ADMIN_EVENT_TYPES\.SUBSCRIPTION_ACTIVATED\]: dispatchSubscriptionActivatedEvent/);
  assert.match(source, /\[ADMIN_EVENT_TYPES\.SUBSCRIPTION_EXTENDED\]: dispatchSubscriptionExtendedEvent/);
  assert.match(source, /const handler = ADMIN_EVENT_HANDLERS\[eventType\]/);
  console.log("✓ admin event handlers registry");
}

function testLegacyActivateResponseMappingInEvents() {
  const mapped = mapAdminEventResultToLegacyActivateResponse({
    eventType: ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED,
    userNotificationCreated: true,
    emailQueued: true,
    auditLogged: true,
    warnings: [],
  });
  assert.equal(mapped.notificationCreated, true);
  console.log("✓ legacy activate response mapping in events");
}

async function testSubscriptionRejectedRunsUserEmailAuditOnly() {
  __resetAdminEventDispatchForTests();
  const calls = { audit: 0, user: 0, admin: 0, email: 0 };
  const result = await dispatchAdminEvent(baseSubscriptionRejectedEvent(), {
    ...createSuccessfulDeps({
      createAuditLog: async () => {
        calls.audit += 1;
        return { ok: true, success: true };
      },
      createUserNotification: async () => {
        calls.user += 1;
        return { success: true, userNotificationCreated: true, notificationCreated: true };
      },
      createAdminNotification: async () => {
        calls.admin += 1;
        return { success: true, created: true, adminNotificationCreated: true };
      },
      queueEmail: async () => {
        calls.email += 1;
        return { success: true, emailQueued: true };
      },
    }),
  });

  assert.equal(result.success, true);
  assert.equal(result.auditLogged, true);
  assert.equal(result.userNotificationCreated, true);
  assert.equal(result.emailQueued, true);
  assert.equal(result.adminNotificationCreated, false);
  assert.equal(calls.audit, 1);
  assert.equal(calls.user, 1);
  assert.equal(calls.email, 1);
  assert.equal(calls.admin, 0);
  console.log("✓ subscription rejected runs user email audit only");
}

async function testRejectedTimelineAuditActionPreserved() {
  __resetAdminEventDispatchForTests();
  let auditAction = "";
  await dispatchAdminEvent(baseSubscriptionRejectedEvent(), {
    ...createSuccessfulDeps({
      createAuditLog: async (_client, payload) => {
        auditAction = payload.action;
        return { ok: true, success: true };
      },
    }),
  });
  assert.equal(auditAction, "reject-subscription-request");
  console.log("✓ rejected timeline audit action preserved");
}

function testRejectedIdempotencyKey() {
  assert.equal(
    buildAdminEventIdempotencyKey(ADMIN_EVENT_TYPES.SUBSCRIPTION_REJECTED, REQUEST_ID),
    `subscription_rejected:${REQUEST_ID}`
  );
  assert.equal(
    buildAdminEventChannelIdempotencyKey(
      ADMIN_EVENT_TYPES.SUBSCRIPTION_REJECTED,
      REQUEST_ID,
      "user"
    ),
    `subscription_rejected:user:${REQUEST_ID}`
  );
  console.log("✓ rejected idempotency key");
}

async function testRejectedNoDuplicateDispatch() {
  __resetAdminEventDispatchForTests();
  let auditCalls = 0;
  const deps = createSuccessfulDeps({
    createAuditLog: async () => {
      auditCalls += 1;
      return { ok: true, success: true };
    },
  });
  const event = baseSubscriptionRejectedEvent();

  await dispatchAdminEvent(event, deps);
  const second = await dispatchAdminEvent(event, deps);

  assert.equal(auditCalls, 1);
  assert.equal(second.duplicate, true);
  assert.equal(second.auditLogged, true);
  console.log("✓ rejected no duplicate dispatch");
}

function testLegacyRejectResponseMapping() {
  const mapped = mapAdminEventResultToLegacyRejectResponse({
    eventType: ADMIN_EVENT_TYPES.SUBSCRIPTION_REJECTED,
    userNotificationCreated: true,
    adminNotificationCreated: false,
    emailQueued: true,
    auditLogged: true,
    warnings: ["warn"],
  });

  assert.equal(mapped.notificationCreated, true);
  assert.equal(mapped.adminNotificationCreated, false);
  assert.equal(mapped.emailQueued, true);
  assert.equal(mapped.auditLogged, true);
  assert.equal(mapped.eventType, ADMIN_EVENT_TYPES.SUBSCRIPTION_REJECTED);
  assert.deepEqual(mapped.warnings, ["warn"]);
  console.log("✓ legacy reject response mapping");
}

async function testSubscriptionEndedRunsAllChannels() {
  __resetAdminEventDispatchForTests();
  const calls = { audit: 0, user: 0, admin: 0, email: 0 };
  const result = await dispatchAdminEvent(baseSubscriptionEndedEvent(), {
    ...createSuccessfulDeps({
      createAuditLog: async () => {
        calls.audit += 1;
        return { ok: true, success: true };
      },
      createUserNotification: async () => {
        calls.user += 1;
        return { success: true, userNotificationCreated: true, notificationCreated: true };
      },
      createAdminNotification: async () => {
        calls.admin += 1;
        return { success: true, created: true, adminNotificationCreated: true };
      },
      queueEmail: async () => {
        calls.email += 1;
        return { success: true, emailQueued: true };
      },
    }),
  });

  assert.equal(result.success, true);
  assert.equal(result.auditLogged, true);
  assert.equal(result.userNotificationCreated, true);
  assert.equal(result.adminNotificationCreated, true);
  assert.equal(result.emailQueued, true);
  assert.equal(calls.audit, 1);
  assert.equal(calls.user, 1);
  assert.equal(calls.admin, 1);
  assert.equal(calls.email, 1);
  console.log("✓ subscription ended runs all channels");
}

async function testAuditFailureDoesNotStopOthers() {
  __resetAdminEventDispatchForTests();
  const result = await dispatchAdminEvent(baseSubscriptionEndedEvent(), {
    ...createSuccessfulDeps({
      createAuditLog: async () => {
        throw new Error("audit failed");
      },
    }),
  });

  assert.equal(result.userNotificationCreated, true);
  assert.equal(result.adminNotificationCreated, true);
  assert.equal(result.emailQueued, true);
  assert.equal(result.auditLogged, false);
  assert.ok(result.warnings.some((item) => item.includes("سجل الإدارة")));
  console.log("✓ audit failure does not stop others");
}

async function testUserNotificationFailureIsolated() {
  __resetAdminEventDispatchForTests();
  const result = await dispatchAdminEvent(baseSubscriptionEndedEvent(), {
    ...createSuccessfulDeps({
      createUserNotification: async () => ({ success: false, notificationCreated: false }),
    }),
  });

  assert.equal(result.userNotificationCreated, false);
  assert.equal(result.adminNotificationCreated, true);
  assert.equal(result.emailQueued, true);
  assert.equal(result.auditLogged, true);
  console.log("✓ user notification failure isolated");
}

async function testAdminNotificationFailureIsolated() {
  __resetAdminEventDispatchForTests();
  const result = await dispatchAdminEvent(baseSubscriptionEndedEvent(), {
    ...createSuccessfulDeps({
      createAdminNotification: async () => ({ success: false, created: false }),
    }),
  });

  assert.equal(result.adminNotificationCreated, false);
  assert.equal(result.userNotificationCreated, true);
  assert.equal(result.emailQueued, true);
  console.log("✓ admin notification failure isolated");
}

async function testEmailFailureIsolated() {
  __resetAdminEventDispatchForTests();
  const result = await dispatchAdminEvent(baseSubscriptionEndedEvent(), {
    ...createSuccessfulDeps({
      queueEmail: async () => ({ success: false, emailQueued: false }),
    }),
  });

  assert.equal(result.emailQueued, false);
  assert.equal(result.userNotificationCreated, true);
  assert.equal(result.auditLogged, true);
  console.log("✓ email failure isolated");
}

async function testWarningsUnified() {
  __resetAdminEventDispatchForTests();
  const result = await dispatchAdminEvent(baseSubscriptionEndedEvent(), {
    ...createSuccessfulDeps({
      createUserNotification: async () => ({ success: false, notificationCreated: false }),
      queueEmail: async () => ({ success: false, emailQueued: false }),
    }),
  });

  assert.ok(result.warnings.length >= 2);
  console.log("✓ warnings unified");
}

async function testResultContainsChannelStates() {
  __resetAdminEventDispatchForTests();
  const result = await dispatchAdminEvent(baseSubscriptionEndedEvent(), createSuccessfulDeps());
  assert.equal(typeof result.auditLogged, "boolean");
  assert.equal(typeof result.userNotificationCreated, "boolean");
  assert.equal(typeof result.adminNotificationCreated, "boolean");
  assert.equal(typeof result.emailQueued, "boolean");
  console.log("✓ result contains channel states");
}

function testIdempotencyKey() {
  assert.equal(
    buildAdminEventIdempotencyKey(ADMIN_EVENT_TYPES.SUBSCRIPTION_ENDED, REQUEST_ID),
    `subscription_ended:${REQUEST_ID}`
  );
  assert.equal(
    buildAdminEventChannelIdempotencyKey(
      ADMIN_EVENT_TYPES.SUBSCRIPTION_ENDED,
      REQUEST_ID,
      "admin"
    ),
    `subscription_ended:admin:${REQUEST_ID}`
  );
  console.log("✓ idempotency key");
}

async function testNoDuplicateDispatch() {
  __resetAdminEventDispatchForTests();
  let auditCalls = 0;
  const deps = createSuccessfulDeps({
    createAuditLog: async () => {
      auditCalls += 1;
      return { ok: true, success: true };
    },
  });
  const event = baseSubscriptionEndedEvent();

  await dispatchAdminEvent(event, deps);
  const second = await dispatchAdminEvent(event, deps);

  assert.equal(auditCalls, 1);
  assert.equal(second.duplicate, true);
  assert.equal(second.auditLogged, true);
  console.log("✓ no duplicate dispatch");
}

function testSanitizeRemovesPaymentProof() {
  const sanitized = sanitizeAdminEventDetails({
    requestId: REQUEST_ID,
    payment_proof: "data:image/png;base64,abc",
  });
  assert.equal(sanitized.payment_proof, undefined);
  assert.equal(sanitized.requestId, REQUEST_ID);
  console.log("✓ sanitize removes payment_proof");
}

function testSanitizeRemovesSecrets() {
  const sanitized = sanitizeAdminEventDetails({
    token: "secret-token",
    apiKey: "abc",
    secretKey: "xyz",
    requestId: REQUEST_ID,
  });
  assert.equal(sanitized.token, undefined);
  assert.equal(sanitized.apiKey, undefined);
  assert.equal(sanitized.secretKey, undefined);
  console.log("✓ sanitize removes token secret apiKey");
}

async function testTimelineAuditActionPreserved() {
  __resetAdminEventDispatchForTests();
  let auditAction = "";
  await dispatchAdminEvent(baseSubscriptionEndedEvent(), {
    ...createSuccessfulDeps({
      createAuditLog: async (_client, payload) => {
        auditAction = payload.action;
        return { ok: true, success: true };
      },
    }),
  });
  assert.equal(auditAction, "remove-subscription-request");
  console.log("✓ timeline audit action preserved");
}

function testLegacyRemoveResponseMapping() {
  const mapped = mapAdminEventResultToLegacyRemoveResponse({
    eventType: ADMIN_EVENT_TYPES.SUBSCRIPTION_ENDED,
    userNotificationCreated: true,
    adminNotificationCreated: true,
    emailQueued: true,
    auditLogged: true,
    warnings: ["warn"],
  });

  assert.equal(mapped.notificationCreated, true);
  assert.equal(mapped.adminNotificationCreated, true);
  assert.equal(mapped.emailQueued, true);
  assert.equal(mapped.auditLogged, true);
  assert.equal(mapped.eventType, ADMIN_EVENT_TYPES.SUBSCRIPTION_ENDED);
  assert.deepEqual(mapped.warnings, ["warn"]);
  console.log("✓ legacy remove response mapping");
}

async function testProfileReconciledInAuditDetails() {
  __resetAdminEventDispatchForTests();
  let auditDetails = null;
  await dispatchAdminEvent(
    baseSubscriptionEndedEvent({
      context: {
        ...baseSubscriptionEndedEvent().context,
        profileReconciled: true,
        hasOtherActiveSameService: true,
        otherActiveSameServiceIds: ["other-id"],
      },
    }),
    {
      ...createSuccessfulDeps({
        createAuditLog: async (_client, payload) => {
          auditDetails = payload.details;
          return { ok: true, success: true };
        },
      }),
    }
  );

  assert.equal(auditDetails.profileReconciled, true);
  assert.equal(auditDetails.hasOtherActiveSameService, true);
  assert.deepEqual(auditDetails.otherActiveSameServiceIds, ["other-id"]);
  console.log("✓ profileReconciled in audit details");
}

function testServerOnlyModule() {
  const source = readFileSync(fileURLToPath(new URL("../lib/admin-events.js", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /from "react"/);
  assert.doesNotMatch(source, /window\./);
  assert.doesNotMatch(source, /page\.js/);
  console.log("✓ server-only module");
}

function testNoDbMutationInsideDispatcher() {
  const source = readFileSync(fileURLToPath(new URL("../lib/admin-events.js", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /\.update\(/);
  assert.doesNotMatch(source, /\.delete\(/);
  console.log("✓ no db mutation inside dispatcher");
}

function testFutureEventTypesDefined() {
  assert.equal(typeof ADMIN_EVENT_TYPES.SUBSCRIPTION_REJECTED, "string");
  assert.equal(typeof ADMIN_EVENT_TYPES.USER_BANNED, "string");
  console.log("✓ future event types defined");
}

const tests = [
  ["supported event type constant", testSupportedEventTypeConstant],
  ["unsupported event type rejected", testUnsupportedEventTypeRejected],
  ["subscription activated runs user email audit only", testSubscriptionActivatedRunsUserEmailAuditOnly],
  ["activated timeline audit action preserved", testActivatedTimelineAuditActionPreserved],
  ["activated idempotency key", testActivatedIdempotencyKey],
  ["admin event handlers registry", testAdminEventHandlersRegistry],
  ["subscription registry covers all subscription events", testSubscriptionRegistryCoversAllSubscriptionEvents],
  ["subscription extended runs audit only by default", testSubscriptionExtendedRunsAuditOnlyByDefault],
  ["extended timeline audit action preserved", testExtendedTimelineAuditActionPreserved],
  ["extended idempotency key", testExtendedIdempotencyKey],
  ["extended no duplicate dispatch", testExtendedNoDuplicateDispatch],
  ["legacy extend response mapping", testLegacyExtendResponseMapping],
  ["subscription extended full handler cycle", testSubscriptionExtendedFullHandlerCycle],
  ["legacy activate response mapping in events", testLegacyActivateResponseMappingInEvents],
  ["subscription rejected runs user email audit only", testSubscriptionRejectedRunsUserEmailAuditOnly],
  ["rejected timeline audit action preserved", testRejectedTimelineAuditActionPreserved],
  ["rejected idempotency key", testRejectedIdempotencyKey],
  ["rejected no duplicate dispatch", testRejectedNoDuplicateDispatch],
  ["legacy reject response mapping", testLegacyRejectResponseMapping],
  ["subscription ended runs all channels", testSubscriptionEndedRunsAllChannels],
  ["audit failure does not stop others", testAuditFailureDoesNotStopOthers],
  ["user notification failure isolated", testUserNotificationFailureIsolated],
  ["admin notification failure isolated", testAdminNotificationFailureIsolated],
  ["email failure isolated", testEmailFailureIsolated],
  ["warnings unified", testWarningsUnified],
  ["result contains channel states", testResultContainsChannelStates],
  ["idempotency key", testIdempotencyKey],
  ["no duplicate dispatch", testNoDuplicateDispatch],
  ["sanitize removes payment_proof", testSanitizeRemovesPaymentProof],
  ["sanitize removes token secret apiKey", testSanitizeRemovesSecrets],
  ["timeline audit action preserved", testTimelineAuditActionPreserved],
  ["legacy remove response mapping", testLegacyRemoveResponseMapping],
  ["profileReconciled in audit details", testProfileReconciledInAuditDetails],
  ["server-only module", testServerOnlyModule],
  ["no db mutation inside dispatcher", testNoDbMutationInsideDispatcher],
  ["future event types defined", testFutureEventTypesDefined],
];

let passed = 0;

for (const [name, fn] of tests) {
  await fn();
  passed += 1;
}

console.log(`\n${passed}/${tests.length} admin events checks passed`);
