#!/usr/bin/env node

/**
 * VIP Status notification delivery architecture tests.
 * Mock-only — validates async split: Web enqueues jobs, worker delivers.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mapVipStatusEmailDeliveryOutcome,
  mapTransactionalEmailDispatchResult,
} from "../lib/transactional-email-dispatch-result.js";
import {
  syncVipStatusDeliveryFromOutbox,
  VIP_STATUS_EMAIL_MESSAGE_TYPE,
} from "../lib/vip-status-email-outbox-sync.js";
import {
  buildVipStatusPushTag,
  buildStatusDeliveryIdempotencyKey,
  sendVipRecommendationStatusUpdate,
} from "../lib/vip-recommendation-status-dispatch.js";
import {
  processVipStatusDeliveryRow,
  buildVipStatusDeliveryContext,
} from "../lib/vip-status-delivery-processor.js";
import { processSingleOutboxEmail } from "../lib/email-outbox-processor.js";

function buildSignalMockSupabase({ rpcResult, deliveryStore = new Map() } = {}) {
  return {
    rpc: async () => ({ data: rpcResult, error: null }),
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
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }

      if (table === "vip_signal_status_deliveries") {
        return {
          upsert(rows, { ignoreDuplicates } = {}) {
            const created = [];
            for (const row of rows) {
              if (deliveryStore.has(row.idempotency_key)) {
                if (!ignoreDuplicates) continue;
                continue;
              }
              const id = `d-${deliveryStore.size + 1}`;
              deliveryStore.set(row.idempotency_key, { ...row, id });
              created.push({ id });
            }
            return { select: () => Promise.resolve({ data: created, error: null }) };
          },
          update(patch) {
            return { eq: async () => ({ error: null }) };
          },
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
                user_email: "vip@example.com",
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

test("email mapping: direct success → delivered", () => {
  const outcome = mapVipStatusEmailDeliveryOutcome({
    success: true,
    mode: "direct",
    id: "resend-abc",
  });
  assert.equal(outcome.delivered, true);
  assert.equal(outcome.failed, false);
});

test("email mapping: outbox enqueue → queued, not failed", () => {
  const outcome = mapVipStatusEmailDeliveryOutcome({
    success: true,
    mode: "outbox",
    enqueued: true,
    record: { id: "outbox-1" },
  });
  assert.equal(outcome.queued, true);
  assert.equal(outcome.failed, false);
});

test("Web API: zero provider calls, jobs created", async () => {
  const providerCalls = [];
  const deliveryStore = new Map();
  const supabase = buildSignalMockSupabase({
    rpcResult: [
      {
        event_id: "ev-1",
        previous_status: "active",
        new_status: "target_1_hit",
        duplicate: false,
      },
    ],
    deliveryStore,
  });

  const result = await sendVipRecommendationStatusUpdate(supabase, {
    recommendationId: "sig-1",
    eventType: "target_1_hit",
    adminUser: { email: "admin@example.com", id: "admin-1" },
    deps: {
      dispatchSiteNotification: async () => {
        providerCalls.push("site");
        return { data: { id: "n-1" } };
      },
      sendTargetedPushNotification: async () => {
        providerCalls.push("push");
        return { sent: 1 };
      },
      dispatchTemplateTransactionalEmail: async () => {
        providerCalls.push("email");
        return { success: true };
      },
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(providerCalls.length, 0);
  assert.equal(deliveryStore.size, 3);
});

test("worker push uses vip tag once", async () => {
  const tags = [];
  const row = {
    id: "d-push",
    signal_id: "sig-1",
    event_type: "target_1_hit",
    user_email: "vip@example.com",
    channel: "push",
    attempt_count: 1,
  };
  const ctx = buildVipStatusDeliveryContext(
    { id: "sig-1", signal_type: "spot", coin: "BTCUSDT" },
    "target_1_hit"
  );

  await processVipStatusDeliveryRow(
    { from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) },
    row,
    ctx,
    {
      sendTargetedPushNotification: async (opts) => {
        tags.push(opts.tag);
        return { sent: 1 };
      },
    }
  );

  assert.deepEqual(tags, [buildVipStatusPushTag("sig-1", "target_1_hit")]);
});

test("worker sync: outbox sent updates VIP delivery", async () => {
  let updated = null;
  const supabase = {
    from(table) {
      assert.equal(table, "vip_signal_status_deliveries");
      return {
        update(patch) {
          updated = patch;
          return { eq: async () => ({ error: null }) };
        },
      };
    },
    rpc: async () => ({ error: null }),
  };

  const sync = await syncVipStatusDeliveryFromOutbox(
    supabase,
    {
      message_type: VIP_STATUS_EMAIL_MESSAGE_TYPE,
      metadata: { vipDeliveryId: "del-99", signalId: 1, eventType: "target_1_hit" },
    },
    { outcome: "provider_accepted", providerMessageId: "resend-xyz" }
  );

  assert.equal(sync.synced, true);
  assert.equal(updated.status, "provider_accepted");
});

test("email-queue-worker sync after mock Resend", async () => {
  let resendCalls = 0;
  const supabase = {
    from(table) {
      if (table === "email_outbox") {
        const api = {
          eq() {
            return api;
          },
          in() {
            return api;
          },
          then(resolve) {
            resolve({ error: null });
          },
        };
        return {
          update: () => api,
        };
      }
      if (table === "email_messages") {
        return {
          upsert: async () => ({ error: null }),
        };
      }
      if (table === "vip_signal_status_deliveries") {
        return { update: () => ({ eq: async () => ({ error: null }) }) };
      }
      return {};
    },
    rpc: async () => ({ error: null }),
  };

  const status = await processSingleOutboxEmail(
    supabase,
    {
      id: "ob-1",
      message_type: VIP_STATUS_EMAIL_MESSAGE_TYPE,
      recipient_email: "vip@example.com",
      subject: "Test",
      html: "<p>Hi</p>",
      attempts: 1,
      metadata: { vipDeliveryId: "del-1", signalId: 1, eventType: "target_1_hit" },
    },
    {
      sendOutboxEmail: async () => {
        resendCalls += 1;
        return { success: true, id: "resend-1" };
      },
    }
  );

  assert.equal(status, "sent");
  assert.equal(resendCalls, 1);
});

test("mapTransactionalEmailDispatchResult contract", () => {
  assert.equal(
    mapTransactionalEmailDispatchResult({ success: true, mode: "direct", id: "x" }).providerId,
    "x"
  );
});
