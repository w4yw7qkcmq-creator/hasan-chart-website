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
          range: async () => ({
            data: [
              {
                id: "s1",
                user_email: "spot@example.com",
                plan_name: "VIP Spot",
                category: "",
                status: "مفعل",
                expires_at: new Date(Date.now() + 86400000).toISOString(),
                created_at: new Date().toISOString(),
              },
            ],
            error: null,
          }),
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
      dispatchUnifiedSiteAlerts: async () => {
        dispatchCalls.push("site");
        return { notificationCreated: true };
      },
      dispatchTemplateTransactionalEmail: async () => {
        dispatchCalls.push("email");
        return { sent: true };
      },
      sendTargetedPushNotification: async () => {
        dispatchCalls.push("push");
        return { sent: 1 };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.eligibleRecipients, 1);
  assert.ok(dispatchCalls.includes("site"));
  assert.ok(dispatchCalls.includes("email"));
  assert.ok(dispatchCalls.includes("push"));
});

test("retry skips delivered channels and respects max attempts constant", async () => {
  assert.equal(MAX_VIP_STATUS_DELIVERY_ATTEMPTS, 3);

  const supabase = buildSignalMockSupabase({
    rpcResult: null,
  });

  supabase.from = (table) => {
    const base = buildSignalMockSupabase().from(table);
    if (table === "vip_signal_status_deliveries") {
      return {
        ...base,
        select() {
          return this;
        },
        eq() {
          return this;
        },
        lt: async () => ({
          data: [{ user_email: "fail@example.com" }],
          error: null,
        }),
      };
    }
    return base;
  };

  const result = await retryFailedVipStatusDeliveries(supabase, {
    recommendationId: "sig-1",
    eventType: "target_1_hit",
    adminUser: { email: "admin@example.com", id: "admin-1" },
    deps: {
      dispatchUnifiedSiteAlerts: async () => ({ notificationCreated: true }),
      dispatchTemplateTransactionalEmail: async () => ({ sent: true }),
      sendTargetedPushNotification: async () => ({ sent: 0, skipped: 1 }),
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.retriedRecipients, 1);
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
        dispatchUnifiedSiteAlerts: async () => ({ notificationCreated: false }),
        dispatchTemplateTransactionalEmail: async () => ({ sent: false }),
        sendTargetedPushNotification: async () => ({ sent: 0 }),
      },
    }),
    sendVipRecommendationStatusUpdate(supabase, {
      recommendationId: "sig-1",
      eventType: "target_1_hit",
      adminUser: { email: "a@example.com", id: "1" },
      deps: {
        dispatchUnifiedSiteAlerts: async () => ({ notificationCreated: false }),
        dispatchTemplateTransactionalEmail: async () => ({ sent: false }),
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
