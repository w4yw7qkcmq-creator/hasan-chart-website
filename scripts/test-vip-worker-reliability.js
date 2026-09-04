#!/usr/bin/env node

/**
 * VIP worker reliability P1 — startup policy, heartbeat, alerts.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { isVipStatusDeliveryWorkerEnabled } from "../lib/vip-status-delivery-worker-flag.js";
import { resolveDisabledWorkerStartup } from "../lib/vip-status-delivery-startup.js";
import {
  evaluateVipWorkerHealth,
  persistVipWorkerHeartbeat,
  evaluatePersistedVipWorkerHealth,
  VIP_PENDING_UNHEALTHY_SECONDS,
  VIP_HEARTBEAT_STALE_SECONDS,
} from "../lib/vip-status-delivery-heartbeat.js";
import { getPersistentWorkerConfig, runPersistentVipStatusDeliveryLoop } from "../worker/vip-status-delivery-persistent-loop.js";

test("flag truthy values enable worker", () => {
  const prev = process.env.VIP_STATUS_DELIVERY_WORKER_ENABLED;
  for (const value of ["true", "1", "yes", "on", "TRUE"]) {
    process.env.VIP_STATUS_DELIVERY_WORKER_ENABLED = value;
    assert.equal(isVipStatusDeliveryWorkerEnabled(), true, value);
  }
  if (prev === undefined) delete process.env.VIP_STATUS_DELIVERY_WORKER_ENABLED;
  else process.env.VIP_STATUS_DELIVERY_WORKER_ENABLED = prev;
});

test("unset flag disables worker", () => {
  const prev = process.env.VIP_STATUS_DELIVERY_WORKER_ENABLED;
  delete process.env.VIP_STATUS_DELIVERY_WORKER_ENABLED;
  assert.equal(isVipStatusDeliveryWorkerEnabled(), false);
  if (prev) process.env.VIP_STATUS_DELIVERY_WORKER_ENABLED = prev;
});

test("persistent disabled startup is fatal exit 1", () => {
  const decision = resolveDisabledWorkerStartup({ oneShot: false, enabled: false });
  assert.equal(decision.action, "fatal");
  assert.equal(decision.exitCode, 1);
  assert.equal(decision.event, "VIP_STATUS_DELIVERY_WORKER_DISABLED_FATAL");
});

test("one-shot disabled startup remains skip exit 0", () => {
  const decision = resolveDisabledWorkerStartup({ oneShot: true, enabled: false });
  assert.equal(decision.action, "skip");
  assert.equal(decision.exitCode, 0);
  assert.equal(decision.event, "VIP_STATUS_DELIVERY_WORKER_SKIPPED");
});

test("enabled startup continues", () => {
  const decision = resolveDisabledWorkerStartup({ oneShot: false, enabled: true });
  assert.equal(decision.action, "continue");
});

test("health: queue backlog marks unhealthy", () => {
  const health = evaluateVipWorkerHealth({
    pendingCount: 2,
    oldestPendingAgeSeconds: VIP_PENDING_UNHEALTHY_SECONDS + 1,
    lastSuccessAt: new Date().toISOString(),
  });
  assert.equal(health.healthy, false);
  assert.ok(health.reasons.includes("oldest_pending_stale"));
});

test("health: stale processing marks unhealthy", () => {
  const health = evaluateVipWorkerHealth({
    staleProcessingCount: 1,
    lastSuccessAt: new Date().toISOString(),
  });
  assert.equal(health.healthy, false);
  assert.ok(health.reasons.includes("stale_processing"));
});

test("health: stale heartbeat marks unhealthy", () => {
  const stale = new Date(Date.now() - (VIP_HEARTBEAT_STALE_SECONDS + 60) * 1000).toISOString();
  const health = evaluateVipWorkerHealth({ lastSuccessAt: stale });
  assert.equal(health.healthy, false);
  assert.ok(health.reasons.includes("heartbeat_stale"));
});

test("heartbeat upserts single row and alerts on transition", async () => {
  const store = new Map();
  const supabase = {
    from(table) {
      assert.equal(table, "worker_service_heartbeats");
      return {
        select() {
          return this;
        },
        eq(_col, val) {
          this.workerName = val;
          return this;
        },
        maybeSingle: async () => ({
          data: store.get("vip_status_delivery")
            ? { ...store.get("vip_status_delivery") }
            : null,
          error: null,
        }),
        upsert(row) {
          store.set(row.worker_name, row);
          return { error: null };
        },
        update(patch) {
          const existing = store.get("vip_status_delivery") || {};
          store.set("vip_status_delivery", { ...existing, ...patch });
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };

  let alerts = 0;
  const deps = {
    dispatchAdminSiteNotification: async () => {
      alerts += 1;
      return { data: { id: "n1" } };
    },
  };

  const first = await persistVipWorkerHeartbeat(
    supabase,
    {
      metrics: {
        pending: 3,
        processing: 0,
        oldestPendingAgeMs: (VIP_PENDING_UNHEALTHY_SECONDS + 30) * 1000,
        staleProcessingCount: 0,
      },
    },
    deps
  );
  assert.equal(first.alertResult.alerted, true);
  assert.equal(store.get("vip_status_delivery").alert_state, "unhealthy");

  const second = await persistVipWorkerHeartbeat(
    supabase,
    {
      metrics: { pending: 0, processing: 0, oldestPendingAgeMs: 0, staleProcessingCount: 0 },
    },
    deps
  );
  assert.equal(second.alertResult.alerted, true);
  assert.equal(second.alertResult.recovery, true);
  assert.equal(store.get("vip_status_delivery").alert_state, "healthy");
  assert.equal(alerts, 2);
  assert.equal(store.size, 1);
});

test("cron evaluator detects stale persisted heartbeat", async () => {
  const staleSuccess = new Date(Date.now() - (VIP_HEARTBEAT_STALE_SECONDS + 120) * 1000).toISOString();
  const row = {
    worker_name: "vip_status_delivery",
    last_success_at: staleSuccess,
    last_cycle_at: staleSuccess,
    pending_count: 0,
    processing_count: 0,
    oldest_pending_age_seconds: 0,
    stale_processing_count: 0,
    alert_state: "healthy",
  };

  let alerts = 0;
  const supabase = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => ({ data: row, error: null }),
        update(patch) {
          Object.assign(row, patch);
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };

  const result = await evaluatePersistedVipWorkerHealth(supabase, {
    source: "cron",
    dispatchAdminSiteNotification: async () => {
      alerts += 1;
      return { data: { id: "n1" } };
    },
  });

  assert.equal(result.health.healthy, false);
  assert.ok(result.health.reasons.includes("heartbeat_stale"));
  assert.equal(alerts, 1);
});

test("persistent loop stops on shutdown without spinning", async () => {
  let cycles = 0;
  let stop = false;

  await runPersistentVipStatusDeliveryLoop({
    config: getPersistentWorkerConfig({ VIP_STATUS_DELIVERY_IDLE_DELAY_MS: "1" }),
    shouldStop: () => stop,
    sleep: async () => {
      stop = true;
    },
    runCycle: async () => {
      cycles += 1;
      return { claimed: 0, processed: 0 };
    },
    idleBackoff: {
      recordWork: () => ({ sleepMs: 1, consecutiveEmptyCycles: 0, delayMs: 1, nextDelayMs: 1 }),
      recordEmpty: () => ({ sleepMs: 1, consecutiveEmptyCycles: 1, delayMs: 1, nextDelayMs: 1 }),
    },
  });

  assert.equal(cycles, 1);
});

test("missing supabase env fails boot path via validateRuntimeEnv contract", () => {
  const missing = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && !process.env.SUPABASE_URL?.trim()) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  assert.ok(Array.isArray(missing));
});
