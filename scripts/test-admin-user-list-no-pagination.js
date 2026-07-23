import assert from "node:assert/strict";
import {
  isNewPendingSubscriptionRequest,
  SUBSCRIPTION_TERMINAL_STATUS_VALUES,
} from "../app/(app)/admin/admin-dashboard-helpers.js";
import {
  buildSubscriptionRequestCreatedNotificationId,
  buildSubscriptionEndedNotificationId,
  createAdminSubscriptionEndedNotifySession,
  markAdminSubscriptionEndedNotificationSent,
  resolveAdminSubscriptionEndedNotifyDecision,
} from "../lib/admin-subscription-remove-client.js";
import {
  ADMIN_USER_LIST_ALL_CAP,
  ADMIN_USER_LIST_HEAVY_FIELD_DENYLIST,
  ADMIN_USER_LIST_PROFILE_COLUMNS,
  ADMIN_USER_LIST_SUBSCRIPTION_FLAG_COLUMNS,
  assertAdminUserListRowIsLightweight,
  benchmarkAdminUserListResponse,
  buildAdminUserListTruncationMeta,
} from "../lib/admin-user-list-response-helpers.js";

function mapSubscriptionDisplayStatus(row) {
  const statusRaw = String(row?.status || "").trim();
  const adminDisabled = Boolean(row?.admin_disabled);
  if (statusRaw === "منتهي") {
    return adminDisabled ? "منتهي (إدارة)" : "منتهي";
  }
  if (["مفعل", "نشط", "active"].includes(statusRaw) && !adminDisabled) {
    return "نشط";
  }
  return statusRaw || "ملغى";
}

function isAdminSubscriptionActive(status) {
  return status === "نشط";
}

function testListAllCap() {
  assert.equal(ADMIN_USER_LIST_ALL_CAP, 1000);
}

function testListQueryFieldsAreLightweight() {
  assert.match(ADMIN_USER_LIST_PROFILE_COLUMNS, /id,email,username/);
  assert.doesNotMatch(ADMIN_USER_LIST_PROFILE_COLUMNS, /payment_proof|timeline|notes/);
  assert.match(ADMIN_USER_LIST_SUBSCRIPTION_FLAG_COLUMNS, /status,expires_at,admin_disabled/);
  assert.doesNotMatch(ADMIN_USER_LIST_SUBSCRIPTION_FLAG_COLUMNS, /payment_proof|base64/);
  assert.ok(ADMIN_USER_LIST_HEAVY_FIELD_DENYLIST.includes("payment_proof"));
}

function testListRowsHaveNoHeavyFields() {
  const benchmark = benchmarkAdminUserListResponse(96);
  benchmark.sampleUserKeys.forEach((key) => {
    assert.ok(!ADMIN_USER_LIST_HEAVY_FIELD_DENYLIST.includes(key), `unexpected heavy key ${key}`);
  });
  assert.equal(benchmark.userCount, 96);
  assert.ok(benchmark.responseBytes > 0);
  console.log(
    `  benchmark(96 users): durationMs=${benchmark.durationMs}, responseBytes=${benchmark.responseBytes}`
  );
}

function testTruncationMetadataWhenCapExceeded() {
  const meta = buildAdminUserListTruncationMeta({
    total: 1200,
    returned: 1000,
    cap: 1000,
    listAll: true,
  });

  assert.equal(meta.truncated, true);
  assert.equal(meta.total, 1200);
  assert.equal(meta.returned, 1000);
  assert.equal(meta.cap, 1000);
  assert.match(meta.warning, /1200/);
}

function testNoTruncationBelowCap() {
  const meta = buildAdminUserListTruncationMeta({
    total: 96,
    returned: 96,
    listAll: true,
  });

  assert.equal(meta.truncated, false);
  assert.equal(meta.total, 96);
  assert.equal(meta.returned, 96);
}

function testTerminalStatusesAreNotPending() {
  for (const status of SUBSCRIPTION_TERMINAL_STATUS_VALUES) {
    assert.equal(
      isNewPendingSubscriptionRequest(status),
      false,
      `status ${status} should not be pending`
    );
  }

  assert.equal(isNewPendingSubscriptionRequest("ended"), false);
  assert.equal(isNewPendingSubscriptionRequest("rejected"), false);
  assert.equal(isNewPendingSubscriptionRequest("cancelled"), false);
  assert.equal(isNewPendingSubscriptionRequest("قيد المراجعة"), true);
}

function testNotificationIds() {
  assert.equal(
    buildSubscriptionRequestCreatedNotificationId("abc-123"),
    "subscription_request_created:abc-123"
  );
  assert.equal(buildSubscriptionEndedNotificationId("abc-123"), "subscription_ended:abc-123");
}

function testSubscriptionEndedNotifyDedupe() {
  const session = createAdminSubscriptionEndedNotifySession();
  const acknowledged = new Set();
  const rendered = new Set();

  const first = resolveAdminSubscriptionEndedNotifyDecision("req-1", {
    isAcknowledged: (id) => acknowledged.has(id),
    isRendered: (id) => rendered.has(id),
    sessionSentIds: session,
  });

  assert.equal(first.shouldNotify, true);
  assert.equal(first.id, "subscription_ended:req-1");
  markAdminSubscriptionEndedNotificationSent("req-1", session);

  const second = resolveAdminSubscriptionEndedNotifyDecision("req-1", {
    isAcknowledged: (id) => acknowledged.has(id),
    isRendered: (id) => rendered.has(id),
    sessionSentIds: session,
  });

  assert.equal(second.shouldNotify, false);
  assert.equal(second.reason, "session-sent");

  rendered.add("subscription_ended:req-2");
  const renderedOnly = resolveAdminSubscriptionEndedNotifyDecision("req-2", {
    isAcknowledged: (id) => acknowledged.has(id),
    isRendered: (id) => rendered.has(id),
    sessionSentIds: createAdminSubscriptionEndedNotifySession(),
  });
  assert.equal(renderedOnly.shouldNotify, false);
  assert.equal(renderedOnly.reason, "rendered");
}

function testMapSubscriptionRowAfterAdminRemove() {
  const mappedStatus = mapSubscriptionDisplayStatus({
    status: "منتهي",
    admin_disabled: true,
  });

  assert.equal(mappedStatus, "منتهي (إدارة)");
  assert.equal(isAdminSubscriptionActive(mappedStatus), false);
}

function testAlternativeActiveSubscriptionStaysActive() {
  const ended = mapSubscriptionDisplayStatus({ id: "a", status: "منتهي", admin_disabled: true });
  const active = mapSubscriptionDisplayStatus({ id: "b", status: "مفعل", admin_disabled: false });

  assert.equal(ended, "منتهي (إدارة)");
  assert.equal(active, "نشط");
  assert.equal(isAdminSubscriptionActive(ended), false);
  assert.equal(isAdminSubscriptionActive(active), true);
}

function testLightweightRowGuard() {
  assert.equal(assertAdminUserListRowIsLightweight({ id: "1", email: "a@b.com" }), true);
  assert.throws(() => assertAdminUserListRowIsLightweight({ payment_proof: "data:image/png;base64,abc" }));
}

const tests = [
  ["list all cap", testListAllCap],
  ["list query fields are lightweight", testListQueryFieldsAreLightweight],
  ["list rows have no heavy fields", testListRowsHaveNoHeavyFields],
  ["truncation metadata when cap exceeded", testTruncationMetadataWhenCapExceeded],
  ["no truncation below cap", testNoTruncationBelowCap],
  ["terminal statuses are not pending", testTerminalStatusesAreNotPending],
  ["notification ids", testNotificationIds],
  ["subscription ended notify dedupe", testSubscriptionEndedNotifyDedupe],
  ["map subscription row after admin remove", testMapSubscriptionRowAfterAdminRemove],
  ["alternative active subscription stays active", testAlternativeActiveSubscriptionStaysActive],
  ["lightweight row guard", testLightweightRowGuard],
];

let passed = 0;
let failed = 0;

for (const [name, fn] of tests) {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${name}`);
    console.error(error);
  }
}

console.log(`\n${passed}/${tests.length} passed`);

if (failed > 0) {
  process.exit(1);
}
