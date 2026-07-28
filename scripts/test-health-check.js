#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HEALTH_CHECK_CONSTANTS,
  classifyDatabaseProbeResult,
  classifyMarketStreamSnapshot,
  createDatabaseProbeState,
  resolveOverallStatus,
  resolveReadiness,
} from "../lib/health-check-status.js";
import { formatCoveragePercent } from "../lib/market-data/history/window-utils.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const healthSource = fs.readFileSync(path.join(rootDir, "lib/health-check.js"), "utf8");
const statusSource = fs.readFileSync(path.join(rootDir, "lib/health-check-status.js"), "utf8");
const routeSource = fs.readFileSync(path.join(rootDir, "app/api/health/route.js"), "utf8");

function baseChecks(overrides = {}) {
  return {
    app: { status: "ok" },
    database: { status: "ok" },
    redis: { status: "ok" },
    marketStream: { status: "ok" },
    memory: { status: "ok" },
    ...overrides,
  };
}

function testRedisLazyDoesNotDegradeOverall() {
  const checks = baseChecks({
    redis: {
      status: "ok",
      state: "lazy",
      connected: false,
      lazyClient: true,
    },
  });
  assert.equal(resolveOverallStatus(checks), "ok");
}

function testTransientDatabaseTimeoutWithRecentSuccess() {
  const probeState = createDatabaseProbeState();
  const now = Date.now();

  const withoutRecent = classifyDatabaseProbeResult(
    {
      status: "degraded",
      timedOut: true,
      latencyMs: 1800,
      message: "timeout",
    },
    probeState,
    now
  );
  assert.equal(withoutRecent.transient, undefined);

  probeState.lastSuccessAt = now - 5000;
  probeState.consecutiveFailures = 1;

  const withRecent = classifyDatabaseProbeResult(
    {
      status: "degraded",
      timedOut: true,
      latencyMs: 1800,
      message: "timeout",
    },
    probeState,
    now
  );
  assert.equal(withRecent.transient, true);
  assert.equal(withRecent.status, "degraded");

  const checks = baseChecks({
    database: { status: "degraded", transient: true },
  });
  assert.equal(resolveOverallStatus(checks), "ok");
}

function testDatabaseFailuresDegradeOverall() {
  const checks = baseChecks({
    database: { status: "degraded" },
  });
  assert.equal(resolveOverallStatus(checks), "degraded");

  const downChecks = baseChecks({
    database: { status: "down" },
  });
  assert.equal(resolveOverallStatus(downChecks), "down");
}

function testMarketStreamWarmupWithinGrace() {
  const snapshot = {
    status: "connecting",
    updatedAt: 0,
    stale: false,
    source: "shared-memory",
    wsReadyState: "connecting",
    reconnectAttempt: 0,
    messagesReceived: 0,
  };

  const result = classifyMarketStreamSnapshot(snapshot, {
    uptimeMs: 5000,
    warmupGraceMs: 20000,
  });

  assert.equal(result.status, "warming_up");
  assert.match(result.message, /warming up/i);

  const checks = baseChecks({ marketStream: result });
  assert.equal(resolveOverallStatus(checks), "ok");
  assert.equal(resolveReadiness(checks, "ok"), "warming_up");
}

function testMarketStreamConnectingAfterGraceDegraded() {
  const snapshot = {
    status: "connecting",
    updatedAt: 0,
    stale: false,
    source: "shared-memory",
    wsReadyState: "connecting",
    reconnectAttempt: 2,
    messagesReceived: 0,
  };

  const result = classifyMarketStreamSnapshot(snapshot, {
    uptimeMs: 25000,
    warmupGraceMs: 20000,
  });

  assert.equal(result.status, "degraded");
}

function testMarketStreamExplicitFailureNotWarmup() {
  const snapshot = {
    status: "connecting",
    updatedAt: 0,
    stale: false,
    lastError: "WebSocket failed",
    lastErrorAt: Date.now(),
    reconnectAttempt: 1,
    messagesReceived: 0,
  };

  const result = classifyMarketStreamSnapshot(snapshot, {
    uptimeMs: 3000,
    warmupGraceMs: 20000,
  });

  assert.equal(result.status, "degraded");
  assert.notEqual(result.status, "warming_up");
}

function testMarketStreamLiveOk() {
  const now = Date.now();
  const result = classifyMarketStreamSnapshot(
    {
      status: "live",
      updatedAt: now - 1000,
      stale: false,
      source: "shared-memory",
      wsReadyState: "open",
      reconnectAttempt: 0,
      messagesReceived: 10,
    },
    { uptimeMs: 60000, now }
  );

  assert.equal(result.status, "ok");
}

function testHealthRouteKeeps200ForDegraded() {
  assert.match(routeSource, /report\.status === "down" \? 503 : 200/);
  assert.doesNotMatch(routeSource, /degraded.*503/);
}

function testPayloadDoesNotExposeSecrets() {
  assert.doesNotMatch(healthSource, /SUPABASE_SERVICE_ROLE_KEY.*jsonResponse/);
  assert.doesNotMatch(healthSource, /UPSTASH_REDIS_REST_TOKEN/);
  assert.match(healthSource, /select=id&limit=1/);
}

function testDatabaseConstantsDocumented() {
  assert.equal(HEALTH_CHECK_CONSTANTS.HEALTH_DB_TIMEOUT_MS, 1800);
  assert.equal(HEALTH_CHECK_CONSTANTS.HEALTH_DB_CACHE_TTL_MS, 8000);
  assert.equal(HEALTH_CHECK_CONSTANTS.MARKET_STREAM_WARMUP_GRACE_MS, 20000);
  assert.match(statusSource, /HEALTH_DB_TIMEOUT_MS: 1800/);
}

function testCacheAndInflightPresentInSource() {
  assert.match(healthSource, /cacheExpiresAt/);
  assert.match(healthSource, /inFlight/);
  assert.match(healthSource, /HEALTH_DB_CACHE_TTL_MS/);
  assert.match(statusSource, /HEALTH_DB_CACHE_TTL_MS/);
}

function testReadinessFieldAddedWithoutBreakingStatusContract() {
  assert.match(healthSource, /readiness:/);
  assert.match(healthSource, /status,/);
  assert.doesNotMatch(healthSource, /status:\s*"warming_up"/);
}

function testMarketHistoryMetricsExposure() {
  assert.match(healthSource, /tradesReceived/);
  assert.match(healthSource, /flushFailures/);
  assert.match(healthSource, /lastErrorSafe/);
  assert.match(healthSource, /rowsWrittenFlow/);
  assert.match(healthSource, /droppedEvents/);
  assert.match(healthSource, /function checkMarketHistoryHealth\(\)/);
  assert.match(healthSource, /status:\s*"ok"/);
}

function testCoveragePercentFormattingForUi() {
  assert.equal(formatCoveragePercent(0.34), "0.3");
  assert.equal(formatCoveragePercent(14.17), "14");
  assert.notEqual(formatCoveragePercent(14.17), "97");
}

const tests = [
  ["redis lazy does not degrade overall", testRedisLazyDoesNotDegradeOverall],
  ["transient database timeout keeps overall ok", testTransientDatabaseTimeoutWithRecentSuccess],
  ["database failures degrade overall", testDatabaseFailuresDegradeOverall],
  ["market stream warmup within grace", testMarketStreamWarmupWithinGrace],
  ["market stream connecting after grace degraded", testMarketStreamConnectingAfterGraceDegraded],
  ["market stream explicit failure not warmup", testMarketStreamExplicitFailureNotWarmup],
  ["market stream live ok", testMarketStreamLiveOk],
  ["health route keeps HTTP 200 for degraded", testHealthRouteKeeps200ForDegraded],
  ["payload does not expose secrets", testPayloadDoesNotExposeSecrets],
  ["database constants documented", testDatabaseConstantsDocumented],
  ["cache and in-flight dedup present", testCacheAndInflightPresentInSource],
  ["readiness field without breaking status contract", testReadinessFieldAddedWithoutBreakingStatusContract],
  ["market history metrics exposure", testMarketHistoryMetricsExposure],
  ["coverage percent formatting for ui", testCoveragePercentFormattingForUi],
];

for (const [name, run] of tests) {
  run();
  console.log(`✓ ${name}`);
}

console.log(`\n${tests.length}/${tests.length} health check tests passed`);
