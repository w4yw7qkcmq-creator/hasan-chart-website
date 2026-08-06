#!/usr/bin/env node

/**
 * VIP status async delivery worker — integration tests (mock-only).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  sendVipRecommendationStatusUpdate,
  retryFailedVipStatusDeliveries,
  buildStatusDeliveryIdempotencyKey,
} from "../lib/vip-recommendation-status-dispatch.js";
import { createVipStatusDeliveryJobs } from "../lib/vip-status-delivery-jobs.js";
import {
  claimVipStatusDeliveryBatch,
  releaseStaleVipStatusDeliveries,
  runVipStatusDeliveryBatch,
} from "../lib/vip-status-delivery-queue.js";
import {
  processVipStatusDeliveryRow,
  buildVipStatusDeliveryContext,
} from "../lib/vip-status-delivery-processor.js";
import { isVipStatusDeliveryWorkerEnabled } from "../lib/vip-status-delivery-worker-flag.js";
import { calculateVipStatusRetryDelay } from "../lib/vip-status-delivery-config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationSql = readFileSync(
  join(__dirname, "../supabase/migrations/20260807_vip_status_async_delivery_worker.sql"),
  "utf8"
);

function buildMockSupabase({ rpcResult, deliveryStore = new Map(), emails = ["vip@example.com"] } = {}) {
  return {
    rpc: async (name, params = {}) => {
      if (name === "claim_vip_status_deliveries") {
        const limit = params.p_limit || 25;
        const now = Date.now();
        const eligible = [...deliveryStore.values()]
          .filter(
            (row) =>
              row.status === "pending" ||
              (row.status === "failed" &&
                row.attempt_count < (params.p_max_attempts || 3) &&
                (!row.next_retry_at || new Date(row.next_retry_at).getTime() <= now))
          )
          .slice(0, limit);

        const claimed = eligible.map((row) => {
          const updated = {
            ...row,
            status: "processing",
            attempt_count: (row.attempt_count || 0) + 1,
            processing_started_at: new Date().toISOString(),
            processing_worker_id: params.p_worker_id || "test-worker",
          };
          deliveryStore.set(row.idempotency_key, updated);
          return updated;
        });
        return { data: claimed, error: null };
      }

      if (name === "release_stale_vip_status_deliveries") {
        let releasedPending = 0;
        let markedFailed = 0;
        const cutoff = Date.now() - (params.p_stale_minutes || 15) * 60 * 1000;

        for (const [key, row] of deliveryStore) {
          if (row.status !== "processing" || !row.processing_started_at) continue;
          if (new Date(row.processing_started_at).getTime() > cutoff) continue;
          if (row.attempt_count >= (params.p_max_attempts || 3)) {
            deliveryStore.set(key, { ...row, status: "failed" });
            markedFailed += 1;
          } else {
            deliveryStore.set(key, { ...row, status: "pending", processing_started_at: null });
            releasedPending += 1;
          }
        }
        return { data: { releasedPending, markedFailed }, error: null };
      }

      if (rpcResult !== undefined) {
        return { data: rpcResult, error: null };
      }
      return { data: null, error: null };
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
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }

      if (table === "vip_signal_status_deliveries") {
        return {
          select(_cols, opts = {}) {
            this._head = opts.head;
            this._count = 0;
            return this;
          },
          eq(_col, val) {
            this._eqVal = val;
            return this;
          },
          lt: async () => ({ data: [], error: null }),
          upsert(rows, { ignoreDuplicates } = {}) {
            const created = [];
            for (const row of rows) {
              if (deliveryStore.has(row.idempotency_key)) {
                if (!ignoreDuplicates) throw Object.assign(new Error("dup"), { code: "23505" });
                continue;
              }
              const id = `d-${deliveryStore.size + 1}`;
              const stored = { ...row, id };
              deliveryStore.set(row.idempotency_key, stored);
              created.push({ id });
            }
            return {
              select: () => Promise.resolve({ data: created, error: null }),
            };
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
          maybeSingle: async () => {
            if (this._head) {
              const count = [...deliveryStore.values()].filter((r) => r.status === this._eqVal).length;
              return { count, error: null };
            }
            return { data: null, error: null };
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
            const slice = emails.slice(from, to + 1);
            return {
              data: slice.map((user_email, i) => ({
                id: `s${from + i}`,
                user_email,
                plan_name: "VIP Spot",
                category: "",
                status: "مفعل",
                expires_at: new Date(Date.now() + 86400000).toISOString(),
                created_at: new Date().toISOString(),
              })),
              error: null,
            };
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

test("migration static: SKIP LOCKED claim + service_role grants", () => {
  assert.match(migrationSql, /FOR UPDATE SKIP LOCKED/);
  assert.match(migrationSql, /claim_vip_status_deliveries/);
  assert.match(migrationSql, /release_stale_vip_status_deliveries/);
  assert.match(migrationSql, /REVOKE ALL.*claim_vip_status_deliveries/s);
  assert.match(migrationSql, /GRANT EXECUTE ON FUNCTION public.claim_vip_status_deliveries/);
  assert.match(migrationSql, /processing_started_at/);
  assert.match(migrationSql, /processing_worker_id/);
});

test("API: 1 recipient creates 3 jobs with zero provider calls", async () => {
  const providerCalls = [];
  const deliveryStore = new Map();
  const supabase = buildMockSupabase({
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

  assert.equal(result.ok, true);
  assert.equal(result.accepted, true);
  assert.equal(result.deliveryStatus, "processing");
  assert.equal(result.status, 202);
  assert.equal(result.summary.eligibleRecipients, 1);
  assert.equal(result.summary.deliveryJobsRequested, 3);
  assert.equal(providerCalls.length, 0);
  assert.equal(deliveryStore.size, 3);
});

test("API: 100 recipients → 300 jobs, fast response", async () => {
  const emails = Array.from({ length: 100 }, (_, i) => `user${i}@example.com`);
  const deliveryStore = new Map();
  const supabase = buildMockSupabase({
    rpcResult: [
      {
        event_id: "ev-100",
        previous_status: "active",
        new_status: "target_1_hit",
        duplicate: false,
      },
    ],
    deliveryStore,
    emails,
  });

  const started = Date.now();
  const result = await sendVipRecommendationStatusUpdate(supabase, {
    recommendationId: "sig-1",
    eventType: "target_1_hit",
    adminUser: { email: "admin@example.com", id: "admin-1" },
  });
  const durationMs = Date.now() - started;

  assert.equal(result.summary.deliveryJobsRequested, 300);
  assert.equal(deliveryStore.size, 300);
  assert.ok(durationMs < 1000, `API took ${durationMs}ms — expected <1000ms`);
});

test("worker claim: two workers do not claim same row", async () => {
  const deliveryStore = new Map();
  const row = {
    id: "d-1",
    idempotency_key: "k-1",
    signal_id: "sig-1",
    event_type: "target_1_hit",
    user_email: "a@example.com",
    channel: "site",
    status: "pending",
    attempt_count: 0,
  };
  deliveryStore.set(row.idempotency_key, { ...row });

  const supabase = buildMockSupabase({ deliveryStore });
  const first = await claimVipStatusDeliveryBatch(supabase, { workerId: "w1", batchSize: 5, maxAttempts: 3 });
  const second = await claimVipStatusDeliveryBatch(supabase, { workerId: "w2", batchSize: 5, maxAttempts: 3 });

  assert.equal(first.length, 1);
  assert.equal(second.length, 0);
});

test("worker: site channel only — no push/email", async () => {
  const deliveryStore = new Map();
  const calls = [];
  const supabase = buildMockSupabase({ deliveryStore });

  const row = {
    id: "d-site",
    signal_id: "sig-1",
    event_type: "target_1_hit",
    user_email: "vip@example.com",
    channel: "site",
    attempt_count: 1,
  };

  const signal = {
    id: "sig-1",
    signal_type: "spot",
    coin: "BTCUSDT",
  };
  const ctx = buildVipStatusDeliveryContext(signal, "target_1_hit");

  const result = await processVipStatusDeliveryRow(supabase, row, ctx, {
    dispatchSiteNotification: async () => {
      calls.push("site");
      return { data: { id: "notif-1" } };
    },
    sendTargetedPushNotification: async () => {
      calls.push("push");
      return { sent: 1 };
    },
    enqueueEmail: async () => {
      calls.push("email");
      return { enqueued: true, record: { id: "ob-1" } };
    },
  });

  assert.equal(result.outcome, "delivered");
  assert.deepEqual(calls, ["site"]);
});

test("worker: push once, 404 unavailable", async () => {
  const deliveryStore = new Map();
  const supabase = buildMockSupabase({ deliveryStore });
  let pushCalls = 0;

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

  const result = await processVipStatusDeliveryRow(supabase, row, ctx, {
    dispatchSiteNotification: async () => ({ data: { id: "n" } }),
    sendTargetedPushNotification: async () => {
      pushCalls += 1;
      return { sent: 0, skipped: 1, skipReason: "no-subscription" };
    },
  });

  assert.equal(pushCalls, 1);
  assert.equal(result.outcome, "unavailable");
});

test("worker: email enqueues outbox — no direct Resend", async () => {
  const deliveryStore = new Map();
  const supabase = buildMockSupabase({ deliveryStore });
  let resendCalls = 0;

  const row = {
    id: "d-email",
    signal_id: "sig-1",
    event_type: "target_1_hit",
    user_email: "vip@example.com",
    channel: "email",
    attempt_count: 1,
  };

  const ctx = buildVipStatusDeliveryContext(
    { id: "sig-1", signal_type: "spot", coin: "BTCUSDT" },
    "target_1_hit"
  );

  const result = await processVipStatusDeliveryRow(supabase, row, ctx, {
    enqueueEmail: async () => {
      resendCalls += 1;
      return { enqueued: true, record: { id: "outbox-1" } };
    },
  });

  assert.equal(resendCalls, 1);
  assert.equal(result.outcome, "queued");
  assert.equal(result.outboxId, "outbox-1");
});

test("feature flags: worker disabled skips batch", async () => {
  const prev = process.env.VIP_STATUS_DELIVERY_WORKER_ENABLED;
  delete process.env.VIP_STATUS_DELIVERY_WORKER_ENABLED;

  const supabase = buildMockSupabase({});
  const summary = await runVipStatusDeliveryBatch(supabase);
  assert.equal(summary.skipped, true);

  if (prev) process.env.VIP_STATUS_DELIVERY_WORKER_ENABLED = prev;
});

test("retry backoff schedule", () => {
  assert.equal(calculateVipStatusRetryDelay(1), 60 * 1000);
  assert.equal(calculateVipStatusRetryDelay(2), 5 * 60 * 1000);
  assert.equal(calculateVipStatusRetryDelay(3), 15 * 60 * 1000);
});

test("admin retry requeues failed without provider calls", async () => {
  const deliveryStore = new Map();
  deliveryStore.set("k-fail", {
    id: "d-fail",
    idempotency_key: "k-fail",
    signal_id: "sig-1",
    event_type: "target_1_hit",
    user_email: "vip@example.com",
    channel: "push",
    status: "failed",
    attempt_count: 1,
  });

  const supabase = buildMockSupabase({ deliveryStore });
  const result = await retryFailedVipStatusDeliveries(supabase, {
    recommendationId: "sig-1",
    eventType: "target_1_hit",
    adminUser: { email: "admin@example.com", id: "admin-1" },
  });

  assert.equal(result.ok, true);
  assert.equal(result.accepted, true);
  assert.equal(result.summary.requeued, 1);
  assert.equal(deliveryStore.get("k-fail").status, "pending");
});

test("load mock: 1000 recipients job creation under 1s", async () => {
  const emails = Array.from({ length: 1000 }, (_, i) => `u${i}@example.com`);
  const deliveryStore = new Map();
  const supabase = buildMockSupabase({ deliveryStore, emails: [] });

  const started = Date.now();
  const stats = await createVipStatusDeliveryJobs(supabase, {
    signalId: "sig-1",
    eventType: "target_1_hit",
    emails,
  });
  const durationMs = Date.now() - started;

  assert.equal(stats.deliveryJobsRequested, 3000);
  assert.equal(stats.deliveryJobsCreated, 3000);
  assert.ok(durationMs < 1000, `job insert took ${durationMs}ms`);
});

test("duplicate jobs blocked by idempotency key", async () => {
  const deliveryStore = new Map();
  const supabase = buildMockSupabase({ deliveryStore, emails: ["a@example.com"] });

  const first = await createVipStatusDeliveryJobs(supabase, {
    signalId: "sig-1",
    eventType: "target_1_hit",
    emails: ["a@example.com"],
  });
  const second = await createVipStatusDeliveryJobs(supabase, {
    signalId: "sig-1",
    eventType: "target_1_hit",
    emails: ["a@example.com"],
  });

  assert.equal(first.deliveryJobsCreated, 3);
  assert.equal(second.deliveryJobsCreated, 0);
  assert.equal(deliveryStore.size, 3);
});

test("stale processing recovery releases rows", async () => {
  const deliveryStore = new Map();
  deliveryStore.set("k-stale", {
    id: "d-stale",
    idempotency_key: "k-stale",
    status: "processing",
    attempt_count: 1,
    processing_started_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
  });

  const supabase = buildMockSupabase({ deliveryStore });
  const result = await releaseStaleVipStatusDeliveries(supabase, { staleTimeoutMinutes: 15, maxAttempts: 3 });

  assert.equal(result.releasedPending, 1);
  assert.equal(deliveryStore.get("k-stale").status, "pending");
});

test("idempotency keys stable per channel", () => {
  const site = buildStatusDeliveryIdempotencyKey("1", "target_1_hit", "a@b.com", "site");
  const push = buildStatusDeliveryIdempotencyKey("1", "target_1_hit", "a@b.com", "push");
  const email = buildStatusDeliveryIdempotencyKey("1", "target_1_hit", "a@b.com", "email");
  assert.notEqual(site, push);
  assert.notEqual(push, email);
});

test("worker flag defaults to disabled", () => {
  const prev = process.env.VIP_STATUS_DELIVERY_WORKER_ENABLED;
  delete process.env.VIP_STATUS_DELIVERY_WORKER_ENABLED;
  assert.equal(isVipStatusDeliveryWorkerEnabled(), false);
  if (prev) process.env.VIP_STATUS_DELIVERY_WORKER_ENABLED = prev;
});
