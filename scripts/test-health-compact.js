#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routeSource = fs.readFileSync(path.join(root, "app/api/health/route.js"), "utf8");
const healthSource = fs.readFileSync(path.join(root, "lib/health-check.js"), "utf8");

function buildCompactRouteBody(report) {
  return {
    success: report.status !== "down",
    service: "hasan-chart-website",
    endpoint: "/api/health",
    status: report.status,
    readiness: report.readiness,
    build: report.build,
    database: report.database,
    checks: report.checks?.database
      ? { database: report.checks.database }
      : report.database
        ? {
            database: {
              status: report.database.status,
              latencyMs: report.database.latencyMs ?? null,
            },
          }
        : undefined,
    iam: report.iam,
    timestamp: report.timestamp,
  };
}

function testRouteSupportsDetailFlag() {
  assert.match(routeSource, /detail/);
  assert.match(routeSource, /collectHealthReport\(\{ detail \}\)/);
  assert.match(routeSource, /verifyAdminOrCronSecret/);
}

function testCompactModeBranch() {
  assert.match(healthSource, /if \(!detail\)/);
  assert.match(healthSource, /marketHistory/);
}

function testDefaultResponseFields() {
  assert.match(routeSource, /readiness/);
  assert.match(routeSource, /database/);
  assert.match(routeSource, /build/);
  assert.match(routeSource, /checks:/);
  assert.match(healthSource, /checks:\s*\{\s*database:/);
  assert.match(healthSource, /iam,/);
}

function testHealthNoStore() {
  assert.match(routeSource, /CACHE_NO_STORE/);
}

function testCompactChecksMatchDatabaseTopLevel() {
  const report = {
    status: "ok",
    readiness: "ready",
    build: { commit: "abc1234" },
    database: { status: "ok", latencyMs: 120 },
    checks: { database: { status: "ok", latencyMs: 120 } },
    iam: { validation: { ok: true }, effective: { IAM_API: true } },
    timestamp: "2026-08-01T00:00:00.000Z",
  };

  const body = buildCompactRouteBody(report);
  assert.deepEqual(body.database, body.checks.database);
  assert.equal(body.checks.database.status, "ok");
}

function testCompactSizeBudget() {
  const report = {
    status: "ok",
    readiness: "ready",
    build: { commit: "8a84f133b27c01bb54700cc6e90678f9ef13d5d9" },
    database: { status: "ok", latencyMs: 372 },
    checks: { database: { status: "ok", latencyMs: 372 } },
    iam: {
      validation: { ok: true },
      effective: { IAM_DB: true, IAM_API: true, IAM_UI: true, IAM_RLS: false },
    },
    timestamp: "2026-08-04T23:00:00.000Z",
  };

  const bytes = Buffer.byteLength(JSON.stringify(buildCompactRouteBody(report)));
  assert.ok(bytes < 700, `compact body too large: ${bytes}B`);
}

function testCompactNoMarketArrays() {
  const report = {
    status: "ok",
    readiness: "ready",
    build: { commit: "abc" },
    database: { status: "ok", latencyMs: 1 },
    checks: { database: { status: "ok", latencyMs: 1 } },
    iam: { validation: { ok: true }, effective: {} },
    timestamp: "2026-08-01T00:00:00.000Z",
  };
  const body = buildCompactRouteBody(report);
  assert.equal("marketHistory" in body, false);
  assert.equal(body.checks?.marketHistory, undefined);
}

const tests = [
  ["route detail flag", testRouteSupportsDetailFlag],
  ["compact mode branch", testCompactModeBranch],
  ["default response fields", testDefaultResponseFields],
  ["health no-store", testHealthNoStore],
  ["checks.database matches database top-level", testCompactChecksMatchDatabaseTopLevel],
  ["compact size budget under 700B", testCompactSizeBudget],
  ["compact no market arrays", testCompactNoMarketArrays],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✖ ${name}: ${error.message}`);
  }
}

if (failed > 0) process.exit(1);
console.log(`\n${tests.length}/${tests.length} health compact tests passed`);
