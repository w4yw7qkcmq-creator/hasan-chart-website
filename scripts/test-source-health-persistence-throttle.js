#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  flushSourceHealthStates,
  resetSourceHealthPersistMemoryForTests,
  SOURCE_HEALTH_PERSIST_INTERVAL_MS,
} = require("../worker/lib/news-intelligence/autonomy/source-health-persistence");
const {
  getSourceHealthEngine,
  resetSourceHealthEngineForTests,
  HEALTH_STATES,
} = require("../worker/lib/news-intelligence/autonomy/source-health");

function createFakeSupabase() {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        upsert(rows) {
          calls.push({ table, rows: Array.isArray(rows) ? rows : [rows] });
          return Promise.resolve({ error: calls.failNext ? { message: "upsert_failed" } : null });
        },
      };
    },
  };
}

function reset() {
  resetSourceHealthEngineForTests();
  resetSourceHealthPersistMemoryForTests();
  const engine = getSourceHealthEngine({ reset: true });
  engine.hydrateSourceHealth("rss", "forexlive", { state: HEALTH_STATES.HEALTHY });
  engine.hydrateSourceHealth("telegram_economic", "channel-a", { state: HEALTH_STATES.HEALTHY });
  return engine;
}

async function testSteadyStateIsThrottledAndBatched() {
  const engine = reset();
  void engine;
  const supabase = createFakeSupabase();
  const first = await flushSourceHealthStates(supabase, { now: 1_000_000 });
  assert.equal(first.requests, 1);
  assert.equal(first.flushed, 2);
  assert.equal(supabase.calls.length, 1);
  assert.equal(supabase.calls[0].rows.length, 2);

  const steady = await flushSourceHealthStates(supabase, { now: 1_000_000 + 14_000 });
  assert.equal(steady.requests, 0);
  assert.equal(supabase.calls.length, 1, "HEALTHY sources must not be written on the fast poll");

  const due = await flushSourceHealthStates(supabase, {
    now: 1_000_000 + SOURCE_HEALTH_PERSIST_INTERVAL_MS,
  });
  assert.equal(due.requests, 1);
  assert.equal(due.flushed, 2);
  assert.equal(supabase.calls.length, 2);
}

async function testImportantTransitionPersistsImmediately() {
  const engine = reset();
  const supabase = createFakeSupabase();
  await flushSourceHealthStates(supabase, { now: 5_000_000 });
  engine.hydrateSourceHealth("rss", "forexlive", { state: HEALTH_STATES.DEGRADED });

  const changed = await flushSourceHealthStates(supabase, { now: 5_000_000 + 1_000 });
  assert.equal(changed.requests, 1);
  assert.equal(changed.flushed, 1);
  assert.equal(supabase.calls[1].rows[0].source_id, "forexlive");
  assert.equal(supabase.calls[1].rows[0].state, HEALTH_STATES.DEGRADED);
}

async function testFailedFlushDoesNotAdvanceThrottle() {
  reset();
  const supabase = createFakeSupabase();
  supabase.calls.failNext = true;
  const failed = await flushSourceHealthStates(supabase, { now: 9_000_000 });
  assert.equal(failed.flushed, 0);
  assert.equal(failed.requests, 1);
  supabase.calls.failNext = false;
  const retried = await flushSourceHealthStates(supabase, { now: 9_000_000 + 1_000 });
  assert.equal(retried.flushed, 2);
  assert.equal(supabase.calls.length, 2);
}

const tests = [
  ["steady health is batched on the throttle interval", testSteadyStateIsThrottledAndBatched],
  ["state transitions persist immediately", testImportantTransitionPersistsImmediately],
  ["failed flush retries instead of marking the state saved", testFailedFlushDoesNotAdvanceThrottle],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`  ✔ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✖ ${name}: ${error.stack || error.message}`);
  }
}

if (failed > 0) process.exit(1);
console.log(`source health persistence throttle PASS (${tests.length})`);
