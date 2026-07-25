import assert from "node:assert/strict";
import {
  VIP_NOTIFICATION_BATCH_SIZE,
  extractEligibleEmailsFromProfileRows,
  extractEligibleEmailsFromSubscriptionRows,
  isActiveSubscriptionRow,
  matchesSignalSubscription,
  notifyVipSubscribers,
} from "../lib/vip-subscriber-notify.js";

const FUTURE_EXPIRY = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const PAST_EXPIRY = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

function makeSubscriptionRow(index, overrides = {}) {
  return {
    id: `sub-${index}`,
    user_email: `user${index}@example.com`,
    plan_name: "VIP Spot Pro",
    category: "crypto",
    status: "مفعل",
    expires_at: FUTURE_EXPIRY,
    created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    ...overrides,
  };
}

function makeProfileRow(index, overrides = {}) {
  return {
    id: `profile-${index}`,
    email: `profile${index}@example.com`,
    subscription_plan: "VIP Spot Monthly",
    subscription_status: "نشط",
    created_at: new Date(Date.UTC(2026, 0, 2, 0, 0, index)).toISOString(),
    ...overrides,
  };
}

function createPaginatedSupabase({
  subscriptionRows = [],
  profileRows = [],
  subscriptionErrorAtOffset = null,
  dispatchFailures = new Set(),
  duplicateEmails = new Set(),
} = {}) {
  const dispatchCalls = [];

  const supabase = {
    from(table) {
      const state = { table, filters: {}, orders: [], rangeArgs: null };

      const api = {
        select() {
          return api;
        },
        eq(column, value) {
          state.filters[column] = value;
          return api;
        },
        not(column, operator, value) {
          state.filters[`${column}:${operator}`] = value;
          return api;
        },
        order(column, { ascending }) {
          state.orders.push({ column, ascending });
          return api;
        },
        range(from, to) {
          state.rangeArgs = { from, to };

          if (table === "subscription_requests") {
            if (subscriptionErrorAtOffset !== null && from >= subscriptionErrorAtOffset) {
              return Promise.resolve({ data: null, error: { message: "batch fetch failed" } });
            }

            const filtered = subscriptionRows.filter((row) => row.status === state.filters.status);
            const sorted = filtered.sort((a, b) => {
              const createdDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
              if (createdDiff !== 0) return createdDiff;
              return String(a.id).localeCompare(String(b.id));
            });

            return Promise.resolve({ data: sorted.slice(from, to + 1), error: null });
          }

          if (table === "profiles") {
            const sorted = [...profileRows].sort((a, b) => {
              const createdDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
              if (createdDiff !== 0) return createdDiff;
              return String(a.id).localeCompare(String(b.id));
            });

            return Promise.resolve({ data: sorted.slice(from, to + 1), error: null });
          }

          return Promise.resolve({ data: [], error: null });
        },
      };

      return api;
    },
  };

  const deps = {
    dispatchVipSignalEmail: async ({ recipientEmail, signalId }) => {
      dispatchCalls.push({ recipientEmail, signalId, channel: "email" });
      if (dispatchFailures.has(recipientEmail)) {
        throw new Error("dispatch failed");
      }
      return {
        sent: false,
        queued: !duplicateEmails.has(recipientEmail),
        duplicate: duplicateEmails.has(recipientEmail),
      };
    },
    dispatchUnifiedSiteAlerts: async (_supabase, { userEmail, metadata }) => {
      dispatchCalls.push({ recipientEmail: userEmail, signalId: metadata?.signalId, channel: "alert" });
      if (dispatchFailures.has(userEmail)) {
        throw new Error("alert failed");
      }
      return {
        notificationCreated: !duplicateEmails.has(userEmail),
        pushResult: { sent: 0, failed: 0, skipped: 1 },
        emailResult: { sent: false, skipped: true },
      };
    },
  };

  return { supabase, dispatchCalls, deps };
}

async function runNotifyWithMocks(options, signalOverrides = {}) {
  const { supabase, deps } = createPaginatedSupabase(options);

  return notifyVipSubscribers(
    supabase,
    {
      signalType: "spot",
      coin: "BTC",
      entry: "1",
      targets: "2",
      stopLoss: "0.5",
      notes: "test",
      signalId: "signal-1",
      ...signalOverrides,
    },
    {
      batchSize: options.batchSize || 100,
      dispatchVipSignalEmail: deps.dispatchVipSignalEmail,
      dispatchUnifiedSiteAlerts: deps.dispatchUnifiedSiteAlerts,
    }
  );
}

function testEligibilityRules() {
  assert.equal(isActiveSubscriptionRow({ status: "مفعل", expires_at: FUTURE_EXPIRY }), true);
  assert.equal(isActiveSubscriptionRow({ status: "مفعل", expires_at: PAST_EXPIRY }), false);
  assert.equal(isActiveSubscriptionRow({ status: "مرفوض", expires_at: FUTURE_EXPIRY }), false);
  assert.equal(matchesSignalSubscription("VIP Spot Monthly", "spot"), true);
  assert.equal(matchesSignalSubscription("VIP Futures Pro", "spot"), false);
}

function testZeroSubscribers() {
  const seen = new Set();
  assert.deepEqual(extractEligibleEmailsFromSubscriptionRows([], "spot", seen), []);
  assert.deepEqual(extractEligibleEmailsFromProfileRows([], "spot", seen), []);
}

function testSingleSubscriberExtraction() {
  const seen = new Set();
  const rows = [makeSubscriptionRow(1)];
  const emails = extractEligibleEmailsFromSubscriptionRows(rows, "spot", seen);
  assert.deepEqual(emails, ["user1@example.com"]);
}

function testExpiredAndInactiveFiltered() {
  const seen = new Set();
  const rows = [
    makeSubscriptionRow(1, { expires_at: PAST_EXPIRY }),
    makeSubscriptionRow(2, { status: "مرفوض" }),
    makeSubscriptionRow(3, { plan_name: "Academy", category: "course" }),
  ];
  assert.deepEqual(extractEligibleEmailsFromSubscriptionRows(rows, "spot", seen), []);
}

function testDuplicateAcrossSources() {
  const seen = new Set();
  const subscriptionEmails = extractEligibleEmailsFromSubscriptionRows(
    [makeSubscriptionRow(1, { user_email: "same@example.com" })],
    "spot",
    seen
  );
  const profileEmails = extractEligibleEmailsFromProfileRows(
    [makeProfileRow(1, { email: "same@example.com" })],
    "spot",
    seen
  );

  assert.deepEqual(subscriptionEmails, ["same@example.com"]);
  assert.deepEqual(profileEmails, []);
}

async function testZeroDispatchSummary() {
  const summary = await runNotifyWithMocks({});
  assert.equal(summary.totalEligible, 0);
  assert.equal(summary.processed, 0);
  assert.equal(summary.notificationsCreated, 0);
  assert.equal(summary.success, true);
}

async function testSingleRecipientDispatch() {
  const summary = await runNotifyWithMocks({
    subscriptionRows: [makeSubscriptionRow(1)],
  });

  assert.equal(summary.totalEligible, 1);
  assert.equal(summary.processed, 1);
  assert.equal(summary.notificationsCreated, 1);
  assert.equal(summary.batches, 1);
}

async function testLessThanBatchSize() {
  const rows = Array.from({ length: 50 }, (_, index) => makeSubscriptionRow(index + 1));
  const summary = await runNotifyWithMocks({ subscriptionRows: rows, batchSize: 100 });

  assert.equal(summary.totalEligible, 50);
  assert.equal(summary.processed, 50);
  assert.equal(summary.batches, 1);
}

async function testExactBatchSize() {
  const rows = Array.from({ length: 100 }, (_, index) => makeSubscriptionRow(index + 1));
  const summary = await runNotifyWithMocks({ subscriptionRows: rows, batchSize: 100 });

  assert.equal(summary.totalEligible, 100);
  assert.equal(summary.processed, 100);
  assert.equal(summary.batches, 1);
}

async function testMultipleBatches() {
  const rows = Array.from({ length: 250 }, (_, index) => makeSubscriptionRow(index + 1));
  const summary = await runNotifyWithMocks({ subscriptionRows: rows, batchSize: 100 });

  assert.equal(summary.totalEligible, 250);
  assert.equal(summary.processed, 250);
  assert.equal(summary.batches, 3);
}

async function testPartialDispatchFailure() {
  const rows = [
    makeSubscriptionRow(1, { user_email: "ok@example.com" }),
    makeSubscriptionRow(2, { user_email: "bad@example.com" }),
  ];

  const summary = await runNotifyWithMocks({
    subscriptionRows: rows,
    dispatchFailures: new Set(["bad@example.com"]),
  });

  assert.equal(summary.totalEligible, 2);
  assert.equal(summary.processed, 2);
  assert.equal(summary.failed, 1);
  assert.equal(summary.partial, true);
}

async function testIdempotentEmailDuplicate() {
  const rows = [makeSubscriptionRow(1, { user_email: "dup@example.com" })];
  const first = await runNotifyWithMocks({
    subscriptionRows: rows,
    duplicateEmails: new Set(["dup@example.com"]),
  });
  const second = await runNotifyWithMocks({
    subscriptionRows: rows,
    duplicateEmails: new Set(["dup@example.com"]),
  });

  assert.equal(first.processed, 1);
  assert.equal(first.notificationsCreated, 0);
  assert.equal(second.processed, 1);
}

async function testBatchFetchFailure() {
  const rows = Array.from({ length: 150 }, (_, index) => makeSubscriptionRow(index + 1));
  const summary = await runNotifyWithMocks({
    subscriptionRows: rows,
    subscriptionErrorAtOffset: 100,
    batchSize: 100,
  });

  assert.equal(summary.success, false);
  assert.equal(summary.partial, true);
  assert.equal(summary.batchErrors.length, 1);
  assert.equal(summary.processed, 100);
}

function testDefaultBatchSizeConstant() {
  assert.equal(VIP_NOTIFICATION_BATCH_SIZE, 100);
}

const tests = [
  ["eligibility rules", testEligibilityRules],
  ["zero subscribers extraction", testZeroSubscribers],
  ["single subscriber extraction", testSingleSubscriberExtraction],
  ["expired/inactive filtered", testExpiredAndInactiveFiltered],
  ["duplicate across sources", testDuplicateAcrossSources],
  ["zero dispatch summary", testZeroDispatchSummary],
  ["single recipient dispatch", testSingleRecipientDispatch],
  ["less than batch size", testLessThanBatchSize],
  ["exact batch size", testExactBatchSize],
  ["multiple batches (250)", testMultipleBatches],
  ["partial dispatch failure", testPartialDispatchFailure],
  ["duplicate email idempotency path", testIdempotentEmailDuplicate],
  ["batch fetch failure", testBatchFetchFailure],
  ["default batch size constant", testDefaultBatchSizeConstant],
];

let passed = 0;

for (const [name, fn] of tests) {
  await fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

console.log(`\n${passed}/${tests.length} VIP subscriber notify checks passed`);
