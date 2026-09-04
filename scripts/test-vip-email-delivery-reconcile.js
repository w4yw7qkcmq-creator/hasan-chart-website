#!/usr/bin/env node

/**
 * Regression tests: VIP email delivery ↔ outbox reconciliation (P0 fix).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { syncVipStatusDeliveryFromOutbox, VIP_STATUS_EMAIL_MESSAGE_TYPE } from "../lib/email-outbox-processor.js";
import {
  processVipStatusDeliveryRow,
  buildVipStatusDeliveryContext,
} from "../lib/vip-status-delivery-processor.js";
import {
  claimVipStatusDeliveryBatch,
  releaseStaleVipStatusDeliveries,
  runVipStatusDeliveryBatch,
} from "../lib/vip-status-delivery-queue.js";
import { reconcileVipEmailDeliveriesFromSentOutbox } from "../lib/vip-status-email-outbox-reconcile.js";

function buildDeliveryStore(initial = []) {
  const store = new Map();
  for (const row of initial) {
    store.set(row.idempotency_key || row.id, { ...row });
  }
  return store;
}

function buildReconcileSupabase({ deliveries = [], outboxRows = [] } = {}) {
  const deliveryStore = new Map(deliveries.map((row) => [row.id, { ...row }]));
  const outboxStore = new Map(outboxRows.map((row) => [row.id, { ...row }]));

  return {
    deliveryStore,
    outboxStore,
    supabase: {
      from(table) {
        if (table === "vip_signal_status_deliveries") {
          return {
            select() {
              this._select = true;
              return this;
            },
            eq(col, val) {
              this.filters = this.filters || [];
              this.filters.push([col, val]);
              return this;
            },
            in(col, vals) {
              this._in = { col, vals };
              return this;
            },
            order() {
              return this;
            },
            limit() {
              return this;
            },
            update(patch) {
              this._patch = patch;
              return this;
            },
            maybeSingle: async () => ({ data: null, error: null }),
            then(resolve) {
              if (this._patch) {
                const idFilter = this.filters?.find(([c]) => c === "id");
                if (idFilter) {
                  const row = deliveryStore.get(idFilter[1]);
                  if (row && (!this._in || this._in.vals.includes(row.status))) {
                    Object.assign(row, this._patch);
                    deliveryStore.set(row.id, row);
                  }
                }
                resolve({ error: null });
                return;
              }

              let rows = [...deliveryStore.values()];
              for (const [col, val] of this.filters || []) {
                rows = rows.filter((row) => row[col] === val);
              }
              if (this._in) {
                rows = rows.filter((row) => this._in.vals.includes(row[this._in.col]));
              }
              resolve({ data: rows, error: null });
            },
          };
        }

        if (table === "email_outbox") {
          return {
            select() {
              return this;
            },
            eq(col, val) {
              this.filters = this.filters || [];
              this.filters.push([col, val]);
              return this;
            },
            in(col, vals) {
              this._in = { col, vals };
              return this;
            },
            maybeSingle: async () => {
              let rows = [...outboxStore.values()];
              for (const [col, val] of this.filters || []) {
                rows = rows.filter((row) => row[col] === val);
              }
              return { data: rows[0] || null, error: null };
            },
            then(resolve) {
              let rows = [...outboxStore.values()];
              for (const [col, val] of this.filters || []) {
                rows = rows.filter((row) => row[col] === val);
              }
              if (this._in?.col === "id") {
                rows = rows.filter((row) => this._in.vals.includes(row.id));
              }
              if (this._in?.col === "metadata->>vipDeliveryId") {
                rows = rows.filter((row) =>
                  this._in.vals.includes(String(row.metadata?.vipDeliveryId || ""))
                );
              }
              resolve({ data: rows, error: null });
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
      rpc: async () => ({ error: null }),
    },
  };
}

test("sync: outbox sent maps VIP email delivery to delivered", async () => {
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
  };

  const sentAt = "2026-09-04T12:00:00.000Z";
  const sync = await syncVipStatusDeliveryFromOutbox(
    supabase,
    {
      message_type: VIP_STATUS_EMAIL_MESSAGE_TYPE,
      sent_at: sentAt,
      resend_id: "resend-xyz",
      metadata: { vipDeliveryId: "del-99" },
    },
    { outcome: "sent", providerMessageId: "resend-xyz" }
  );

  assert.equal(sync.synced, true);
  assert.equal(updated.status, "delivered");
  assert.notEqual(updated.status, "provider_accepted");
  assert.equal(updated.delivered_at, sentAt);
  assert.equal(updated.provider_message_id, "resend-xyz");
});

test("reconcile: sent outbox + pending VIP email becomes delivered (idempotent)", async () => {
  const { supabase, deliveryStore } = buildReconcileSupabase({
    deliveries: [
      {
        id: "del-1",
        signal_id: 42,
        event_type: "target_1_hit",
        channel: "email",
        status: "pending",
        provider_message_id: "outbox-1",
        idempotency_key: "k1",
      },
    ],
    outboxRows: [
      {
        id: "outbox-1",
        status: "sent",
        sent_at: "2026-09-04T10:00:00.000Z",
        resend_id: "re_abc",
        metadata: { vipDeliveryId: "del-1" },
        message_type: "vip_signal_status",
      },
    ],
  });

  const first = await reconcileVipEmailDeliveriesFromSentOutbox(supabase);
  assert.equal(first.reconciled, 1);
  assert.equal(deliveryStore.get("del-1").status, "delivered");

  const second = await reconcileVipEmailDeliveriesFromSentOutbox(supabase);
  assert.equal(second.reconciled, 0);
});

test("reconcile: sent outbox + failed VIP email becomes delivered", async () => {
  const { supabase, deliveryStore } = buildReconcileSupabase({
    deliveries: [
      {
        id: "del-2",
        signal_id: 43,
        event_type: "target_1_hit",
        channel: "email",
        status: "failed",
        provider_message_id: "outbox-2",
        idempotency_key: "k2",
      },
    ],
    outboxRows: [
      {
        id: "outbox-2",
        status: "sent",
        sent_at: "2026-09-04T11:00:00.000Z",
        resend_id: "re_def",
        metadata: { vipDeliveryId: "del-2" },
        message_type: "vip_signal_status",
      },
    ],
  });

  const result = await reconcileVipEmailDeliveriesFromSentOutbox(supabase);
  assert.equal(result.reconciled, 1);
  assert.equal(deliveryStore.get("del-2").status, "delivered");
  assert.equal(deliveryStore.get("del-2").error_code, null);
});

test("processor: sent outbox link does not re-enqueue email", async () => {
  const { supabase } = buildReconcileSupabase({
    outboxRows: [
      {
        id: "outbox-3",
        status: "sent",
        sent_at: "2026-09-04T12:00:00.000Z",
        resend_id: "re_sent",
        message_type: "vip_signal_status",
      },
    ],
  });

  let enqueueCalls = 0;
  const row = {
    id: "del-3",
    signal_id: "sig-1",
    event_type: "target_1_hit",
    user_email: "vip@example.com",
    channel: "email",
    provider_message_id: "outbox-3",
    status: "pending",
    error_code: "outbox-queued",
  };
  const ctx = buildVipStatusDeliveryContext(
    { id: "sig-1", signal_type: "spot", coin: "BTCUSDT" },
    "target_1_hit"
  );

  const result = await processVipStatusDeliveryRow(supabase, row, ctx, {
    enqueueEmail: async () => {
      enqueueCalls += 1;
      return { enqueued: true, record: { id: "new-outbox" } };
    },
  });

  assert.equal(enqueueCalls, 0);
  assert.equal(result.outcome, "delivered");
  assert.equal(result.reconciled, true);
});

test("claim: delivered rows are not reclaimed", async () => {
  const deliveryStore = buildDeliveryStore([
    {
      id: "del-delivered",
      idempotency_key: "k-delivered",
      status: "delivered",
      attempt_count: 1,
      channel: "email",
    },
    {
      id: "del-pending",
      idempotency_key: "k-pending",
      status: "pending",
      attempt_count: 0,
      channel: "site",
    },
  ]);

  const supabase = {
    rpc: async (name) => {
      if (name !== "claim_vip_status_deliveries") return { data: [], error: null };
      const eligible = [...deliveryStore.values()].filter((row) => row.status === "pending");
      for (const row of eligible) {
        row.status = "processing";
        row.attempt_count += 1;
      }
      return { data: eligible, error: null };
    },
    from: () => ({
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  };

  const claimed = await claimVipStatusDeliveryBatch(supabase, { workerId: "w1", batchSize: 10 });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].id, "del-pending");
});

test("stale processing: released after lease expiry, fresh processing untouched", async () => {
  const staleIso = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const freshIso = new Date().toISOString();
  const deliveryStore = buildDeliveryStore([
    {
      id: "stale",
      idempotency_key: "k-stale",
      status: "processing",
      attempt_count: 1,
      processing_started_at: staleIso,
    },
    {
      id: "fresh",
      idempotency_key: "k-fresh",
      status: "processing",
      attempt_count: 1,
      processing_started_at: freshIso,
    },
  ]);

  const supabase = {
    rpc: async (name, params) => {
      if (name !== "release_stale_vip_status_deliveries") return { data: null, error: null };
      const cutoff = Date.now() - (params.p_stale_minutes || 15) * 60 * 1000;
      let releasedPending = 0;
      for (const row of deliveryStore.values()) {
        if (row.status !== "processing") continue;
        if (new Date(row.processing_started_at).getTime() > cutoff) continue;
        row.status = "pending";
        row.processing_started_at = null;
        releasedPending += 1;
      }
      return { data: { releasedPending, markedFailed: 0 }, error: null };
    },
  };

  const result = await releaseStaleVipStatusDeliveries(supabase, { staleTimeoutMinutes: 15 });
  assert.equal(result.releasedPending, 1);
  assert.equal([...deliveryStore.values()].find((r) => r.id === "stale").status, "pending");
  assert.equal([...deliveryStore.values()].find((r) => r.id === "fresh").status, "processing");
});

test("batch: max attempts path still reconciles sent outbox before claim", async () => {
  process.env.VIP_STATUS_DELIVERY_WORKER_ENABLED = "1";
  let claimCount = 0;

  const supabase = {
    rpc: async (name) => {
      if (name === "claim_vip_status_deliveries") {
        claimCount += 1;
        return { data: [], error: null };
      }
      if (name === "release_stale_vip_status_deliveries") {
        return { data: { releasedPending: 0, markedFailed: 0 }, error: null };
      }
      if (name === "sync_vip_status_event_delivery_summary") {
        return { error: null };
      }
      return { data: null, error: null };
    },
    from(table) {
      if (table === "vip_signal_status_deliveries") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          in() {
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return this;
          },
          not() {
            return this;
          },
          lte() {
            return this;
          },
          maybeSingle: async () => ({ data: null, error: null }),
          then(resolve) {
            resolve({ data: [], error: null, count: 0 });
          },
        };
      }
      if (table === "email_outbox") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          in() {
            return this;
          },
          then(resolve) {
            resolve({ data: [], error: null });
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };

  await runVipStatusDeliveryBatch(supabase, { emitHealth: false });
  assert.equal(claimCount, 1);
});

test("site/push paths unchanged — no outbox reconcile on non-email rows", async () => {
  const { supabase } = buildReconcileSupabase({
    deliveries: [
      {
        id: "site-1",
        signal_id: 42,
        event_type: "target_1_hit",
        channel: "site",
        status: "pending",
        idempotency_key: "site-k",
      },
    ],
    outboxRows: [],
  });

  const result = await reconcileVipEmailDeliveriesFromSentOutbox(supabase);
  assert.equal(result.reconciled, 0);
});
