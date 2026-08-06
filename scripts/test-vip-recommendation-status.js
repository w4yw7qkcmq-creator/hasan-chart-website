#!/usr/bin/env node
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isCombinedVipPlan,
  matchesSignalSubscription,
  countEligibleVipRecipients,
} from "../lib/vip-recommendation-eligibility.js";
import {
  buildVipStatusNotificationCopy,
  normalizeTradeStatus,
  validateStatusTransition,
  VIP_STATUS_EVENT_TYPES,
} from "../lib/vip-recommendation-status-copy.js";
import {
  buildStatusDeliveryIdempotencyKey,
  buildStatusEventIdempotencyKey,
  buildVipStatusSiteNotificationKey,
  buildVipStatusPushTag,
  sendVipRecommendationStatusUpdate,
  retryFailedVipStatusDeliveries,
  MAX_VIP_STATUS_DELIVERY_ATTEMPTS,
} from "../lib/vip-recommendation-status-dispatch.js";
import {
  isVipStatusNotificationsEnabled,
  vipStatusFeatureDisabledResponse,
} from "../lib/vip-status-feature-flag.js";

function buildSignalMockSupabase({ rpcResult, rpcError, deliveryRows = [] } = {}) {
  const deliveryStore = new Map(deliveryRows.map((r) => [r.idempotency_key, { ...r }]));

  return {
    rpc: async () => {
      if (rpcError) return { data: null, error: rpcError };
      return { data: rpcResult, error: null };
    },
    from(table) {
      if (table === "vip_signals") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({
            data: {
              id: "sig-1",
              signal_type: "spot",
              coin: "BTCUSDT",
              trade_status: "active",
              status: "نشطة",
            },
            error: null,
          }),
        };
      }

      if (table === "vip_signal_status_events") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({ data: { id: "ev-1" }, error: null }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }

      if (table === "vip_signal_status_deliveries") {
        return {
          select() {
            return this;
          },
          eq(_col, key) {
            this._key = key;
            return this;
          },
          maybeSingle: async () => ({
            data: deliveryStore.get(this._key) || null,
            error: null,
          }),
          insert(row) {
            return {
              select() {
                return this;
              },
              single: async () => {
                if (deliveryStore.has(row.idempotency_key)) {
                  return { data: null, error: { code: "23505", message: "duplicate" } };
                }
                const id = `d-${deliveryStore.size + 1}`;
                deliveryStore.set(row.idempotency_key, { ...row, id });
                return { data: { id }, error: null };
              },
            };
          },
          upsert(rows, { ignoreDuplicates } = {}) {
            const created = [];
            for (const row of rows) {
              if (deliveryStore.has(row.idempotency_key)) {
                if (!ignoreDuplicates) {
                  return { select: () => Promise.resolve({ data: null, error: { code: "23505" } }) };
                }
                continue;
              }
              const id = `d-${deliveryStore.size + 1}`;
              deliveryStore.set(row.idempotency_key, { ...row, id });
              created.push({ id });
            }
            return {
              select: () => Promise.resolve({ data: created, error: null }),
            };
          },
          update(patch) {
            return {
              eq(_c, id) {
                for (const [k, v] of deliveryStore) {
                  if (v.id === id) deliveryStore.set(k, { ...v, ...patch });
                }
                return Promise.resolve({ error: null });
              },
            };
          },
          in: async () => ({ data: [], error: null }),
          lt: async () => ({ data: [], error: null }),
        };
      }

      if (table === "subscription_requests") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          order() {
            return this;
          },
          range: async (from = 0, to = 999) => {
            const slice = [
              {
                id: "s1",
                user_email: "spot@example.com",
                plan_name: "VIP Spot",
                category: "",
                status: "مفعل",
                expires_at: new Date(Date.now() + 86400000).toISOString(),
                created_at: new Date().toISOString(),
              },
            ].slice(from, to + 1);
            return { data: slice, error: null };
          },
        };
      }

      if (table === "profiles") {
        return {
          select() {
            return this;
          },
          not() {
            return this;
          },
          order() {
            return this;
          },
          range: async () => ({ data: [], error: null }),
        };
      }

      if (table === "admin_logs") {
        return { insert: async () => ({ error: null }) };
      }

      return { insert: async () => ({ error: null }), update: async () => ({ error: null }) };
    },
  };
}

test("eligibility: spot subscriber receives spot only", () => {
  assert.equal(matchesSignalSubscription("VIP Spot Monthly", "spot"), true);
  assert.equal(matchesSignalSubscription("VIP Spot Monthly", "futures"), false);
});

test("eligibility: futures subscriber receives futures only", () => {
  assert.equal(matchesSignalSubscription("VIP Futures Pro", "futures"), true);
  assert.equal(matchesSignalSubscription("VIP Futures Pro", "spot"), false);
});

test("eligibility: combined subscriber receives both", () => {
  assert.equal(isCombinedVipPlan("VIP Signals Combined"), true);
  assert.equal(matchesSignalSubscription("VIP Signals Combined", "spot"), true);
  assert.equal(matchesSignalSubscription("VIP Signals Combined", "futures"), true);
});

test("countEligibleVipRecipients excludes wrong package", async () => {
  const supabase = buildSignalMockSupabase();
  const count = await countEligibleVipRecipients(supabase, "futures");
  assert.equal(count, 0);
});

test("status transitions block duplicates and enforce target order", () => {
  assert.equal(validateStatusTransition("active", "target_1_hit").allowed, true);
  assert.equal(validateStatusTransition("target_1_hit", "target_1_hit").allowed, false);
  assert.equal(validateStatusTransition("active", "target_2_hit").allowed, false);
  assert.equal(validateStatusTransition("target_1_hit", "target_2_hit").allowed, true);
  assert.equal(validateStatusTransition("closed_immediately", "close_now").allowed, false);
});

test("notification copy uses professional Arabic templates", () => {
  const copy = buildVipStatusNotificationCopy("target_1_hit", {
    coin: "btcusdt",
    signal_type: "spot",
  });
  assert.match(copy.title, /الهدف الأول/);
  assert.match(copy.message, /BTCUSDT/);
  assert.match(copy.subject, /HasaN CharT World/);
});

test("idempotency keys are stable per signal/event/user/channel", () => {
  const key = buildStatusDeliveryIdempotencyKey("sig-1", "target_1_hit", "user@example.com", "email");
  assert.match(key, /^vip_status:sig-1:target_1_hit:/);
  assert.equal(
    buildStatusEventIdempotencyKey("sig-1", "target_1_hit"),
    "vip_status_event:sig-1:target_1_hit"
  );
  assert.match(
    buildVipStatusSiteNotificationKey("sig-1", "target_1_hit", "user@example.com"),
    /^vip_status:sig-1:target_1_hit:/
  );
  assert.equal(buildVipStatusPushTag("sig-1", "target_1_hit"), "vip-sig-1-target_1_hit");
});

test("feature flag defaults to disabled", () => {
  const prev = process.env.VIP_STATUS_NOTIFICATIONS_ENABLED;
  delete process.env.VIP_STATUS_NOTIFICATIONS_ENABLED;
  assert.equal(isVipStatusNotificationsEnabled(), false);
  assert.equal(vipStatusFeatureDisabledResponse().status, 503);
  if (prev) process.env.VIP_STATUS_NOTIFICATIONS_ENABLED = prev;
});

test("sendVipRecommendationStatusUpdate rejects duplicate RPC event", async () => {
  const supabase = buildSignalMockSupabase({
    rpcResult: [{ event_id: "ev-dup", previous_status: "active", new_status: "target_1_hit", duplicate: true }],
  });

  const result = await sendVipRecommendationStatusUpdate(supabase, {
    recommendationId: "sig-1",
    eventType: "target_1_hit",
    adminUser: { email: "admin@example.com", id: "admin-1" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
});

test("sendVipRecommendationStatusUpdate dispatches with atomic RPC success", async () => {
  const dispatchCalls = [];
  const supabase = buildSignalMockSupabase({
    rpcResult: [
      {
        event_id: "ev-1",
        previous_status: "active",
        new_status: "target_1_hit",
        duplicate: false,
        signal_coin: "ETHUSDT",
        signal_type: "spot",
      },
    ],
  });

  const result = await sendVipRecommendationStatusUpdate(supabase, {
    recommendationId: "sig-2",
    eventType: "target_1_hit",
    adminUser: { email: "admin@example.com", id: "admin-1" },
    deps: {
      dispatchSiteNotification: async () => {
        dispatchCalls.push("site");
        return { data: { id: "notif-1" } };
      },
      dispatchTemplateTransactionalEmail: async () => {
        dispatchCalls.push("email");
        return { success: true, mode: "direct", id: "resend-1" };
      },
      sendTargetedPushNotification: async () => {
        dispatchCalls.push("push");
        return { sent: 1 };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.accepted, true);
  assert.equal(result.deliveryStatus, "processing");
  assert.equal(result.summary.eligibleRecipients, 1);
  assert.equal(result.summary.deliveryJobsRequested, 3);
  assert.ok(dispatchCalls.length === 0 || result.status === 202);
});

test("retry requeues failed deliveries for async worker", async () => {
  assert.equal(MAX_VIP_STATUS_DELIVERY_ATTEMPTS, 3);

  const deliveryStore = new Map();
  deliveryStore.set("k1", {
    id: "d1",
    idempotency_key: "k1",
    signal_id: "sig-1",
    event_type: "target_1_hit",
    status: "failed",
    attempt_count: 1,
  });

  const supabase = buildSignalMockSupabase({ rpcResult: null });
  supabase.from = (table) => {
    const base = buildSignalMockSupabase().from(table);
    if (table === "vip_signal_status_deliveries") {
      return {
        select() {
          return this;
        },
        eq(col, val) {
          this._filters = this._filters || [];
          this._filters.push([col, val]);
          return this;
        },
        lt(col, val) {
          this._lt = [col, val];
          return this;
        },
        update(patch) {
          const filters = [];
          const chain = {
            eq(col, val) {
              filters.push([col, val]);
              return chain;
            },
            lt(col, val) {
              filters.push(["__lt__", col, val]);
              return chain;
            },
            select() {
              const matched = [...deliveryStore.values()].filter((row) =>
                filters.every((entry) => {
                  if (entry[0] === "__lt__") return row[entry[1]] < entry[2];
                  return row[entry[0]] == entry[1] || row[entry[0]] === entry[1];
                })
              );
              for (const row of matched) {
                deliveryStore.set(row.idempotency_key, { ...row, ...patch });
              }
              return Promise.resolve({ data: matched.map((r) => ({ id: r.id })), error: null });
            },
          };
          return chain;
        },
      };
    }
    return base;
  };

  const result = await retryFailedVipStatusDeliveries(supabase, {
    recommendationId: "sig-1",
    eventType: "target_1_hit",
    adminUser: { email: "admin@example.com", id: "admin-1" },
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.requeued, 1);
  assert.equal(deliveryStore.get("k1").status, "pending");
});

test("concurrent duplicate RPC: only one success path", async () => {
  let rpcCalls = 0;
  const supabase = buildSignalMockSupabase({
    rpcResult: [
      {
        event_id: "ev-1",
        previous_status: "active",
        new_status: "target_1_hit",
        duplicate: false,
      },
    ],
  });

  supabase.rpc = async () => {
    rpcCalls += 1;
    if (rpcCalls === 1) {
      return {
        data: [
          {
            event_id: "ev-1",
            previous_status: "active",
            new_status: "target_1_hit",
            duplicate: false,
          },
        ],
        error: null,
      };
    }
    return {
      data: [{ duplicate: true, event_id: "ev-1" }],
      error: null,
    };
  };

  const [first, second] = await Promise.all([
    sendVipRecommendationStatusUpdate(supabase, {
      recommendationId: "sig-1",
      eventType: "target_1_hit",
      adminUser: { email: "a@example.com", id: "1" },
      deps: {
        dispatchSiteNotification: async () => ({ data: { id: "notif-1" } }),
        dispatchTemplateTransactionalEmail: async () => ({
          success: true,
          mode: "direct",
          id: "resend-1",
        }),
        sendTargetedPushNotification: async () => ({ sent: 0 }),
      },
    }),
    sendVipRecommendationStatusUpdate(supabase, {
      recommendationId: "sig-1",
      eventType: "target_1_hit",
      adminUser: { email: "a@example.com", id: "1" },
      deps: {
        dispatchSiteNotification: async () => ({ data: { id: "notif-2" } }),
        dispatchTemplateTransactionalEmail: async () => ({
          success: true,
          mode: "direct",
          id: "resend-2",
        }),
        sendTargetedPushNotification: async () => ({ sent: 0 }),
      },
    }),
  ]);

  const successes = [first, second].filter((r) => r.ok).length;
  const duplicates = [first, second].filter((r) => r.status === 409).length;
  assert.equal(successes, 1);
  assert.equal(duplicates, 1);
});

test("allowed event types are fixed server-side", () => {
  assert.deepEqual([...VIP_STATUS_EVENT_TYPES], [
    "target_1_hit",
    "target_2_hit",
    "close_now",
  ]);
  assert.equal(normalizeTradeStatus("نشطة"), "active");
});

console.log("test-vip-recommendation-status: all tests registered");
