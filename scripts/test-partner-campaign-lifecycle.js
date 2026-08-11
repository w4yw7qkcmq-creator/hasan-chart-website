#!/usr/bin/env node
/**
 * Round 9 — campaign lifecycle transition matrix unit tests
 */
import assert from "node:assert/strict";
import {
  assertTransition,
  normalizeStatus,
  isTerminalStatus,
  canCampaignAcceptProgress,
  CAMPAIGN_TRANSITION_MATRIX,
} from "../lib/partner-center/campaign-lifecycle.js";
import { CAMPAIGN_PROGRAM_STATUSES } from "../lib/partner-center/phase2-constants.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL ${name}`, e.message);
  }
}

test("normalizeStatus maps ended to completed", () => {
  assert.equal(normalizeStatus("ended"), CAMPAIGN_PROGRAM_STATUSES.COMPLETED);
  assert.equal(normalizeStatus("active"), "active");
});

test("terminal statuses are completed and cancelled", () => {
  assert.equal(isTerminalStatus("completed"), true);
  assert.equal(isTerminalStatus("cancelled"), true);
  assert.equal(isTerminalStatus("ended"), true);
  assert.equal(isTerminalStatus("active"), false);
});

test("draft can schedule", () => {
  const t = assertTransition("draft", "schedule");
  assert.equal(t.ok, true);
  assert.equal(t.toStatus, CAMPAIGN_PROGRAM_STATUSES.SCHEDULED);
});

test("draft can activate directly", () => {
  const t = assertTransition("draft", "activate");
  assert.equal(t.ok, true);
  assert.equal(t.toStatus, CAMPAIGN_PROGRAM_STATUSES.ACTIVE);
});

test("scheduled can activate", () => {
  const t = assertTransition("scheduled", "activate");
  assert.equal(t.ok, true);
  assert.equal(t.toStatus, CAMPAIGN_PROGRAM_STATUSES.ACTIVE);
});

test("active can pause", () => {
  const t = assertTransition("active", "pause");
  assert.equal(t.ok, true);
  assert.equal(t.toStatus, CAMPAIGN_PROGRAM_STATUSES.PAUSED);
});

test("paused can resume", () => {
  const t = assertTransition("paused", "resume");
  assert.equal(t.ok, true);
  assert.equal(t.toStatus, CAMPAIGN_PROGRAM_STATUSES.ACTIVE);
});

test("active can complete", () => {
  const t = assertTransition("active", "complete");
  assert.equal(t.ok, true);
  assert.equal(t.toStatus, CAMPAIGN_PROGRAM_STATUSES.COMPLETED);
});

test("draft can cancel", () => {
  const t = assertTransition("draft", "cancel");
  assert.equal(t.ok, true);
  assert.equal(t.toStatus, CAMPAIGN_PROGRAM_STATUSES.CANCELLED);
});

test("completed cannot transition", () => {
  assert.equal(assertTransition("completed", "activate").ok, false);
  assert.equal(assertTransition("completed", "pause").ok, false);
  assert.equal(assertTransition("cancelled", "resume").ok, false);
});

test("invalid action rejected", () => {
  assert.equal(assertTransition("active", "bogus").ok, false);
});

test("canCampaignAcceptProgress requires active status in window", () => {
  const ok = canCampaignAcceptProgress(
    {
      id: "x",
      status: "active",
      start_at: "2026-08-01T00:00:00Z",
      end_at: "2026-08-31T23:59:59Z",
    },
    { at: new Date("2026-08-15T12:00:00Z") }
  );
  assert.equal(ok.ok, true);

  const paused = canCampaignAcceptProgress(
    { id: "x", status: "paused", start_at: null, end_at: null },
    { at: new Date() }
  );
  assert.equal(paused.ok, false);
});

test("transition matrix covers all lifecycle actions", () => {
  const actions = ["schedule", "activate", "pause", "resume", "complete", "cancel"];
  for (const action of actions) {
    assert.ok(CAMPAIGN_TRANSITION_MATRIX[action], `missing action ${action}`);
  }
});

console.log(`\nPartner campaign lifecycle: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
