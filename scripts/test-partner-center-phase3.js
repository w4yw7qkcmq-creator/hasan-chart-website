#!/usr/bin/env node
/** Partner Center Phase 3 — unit tests (UI labels + service logic) */
import assert from "node:assert/strict";
import {
  missionStatusLabel,
  rewardStatusLabel,
  safePercent,
  maskPartnerDisplay,
} from "../lib/partner-center/ui-labels.js";
import { computeNextBestAction } from "../lib/partner-center/partner-ui-service.js";
import { validateMissionDefinition } from "../lib/partner-center/mission-engine.js";

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

test("mission status labels arabic", () => {
  assert.equal(missionStatusLabel("in_progress"), "قيد التنفيذ");
  assert.equal(missionStatusLabel("completed"), "مكتملة");
});

test("reward risk hold label", () => {
  assert.equal(rewardStatusLabel("earned", { payoutHold: true }), "قيد المراجعة");
});

test("safe percent zero denominator", () => {
  assert.equal(safePercent(5, 0), 0);
  assert.equal(safePercent(1, 4), 25);
});

test("mask partner display", () => {
  assert.match(maskPartnerDisplay("ABCD1234"), /Partner ABCD\*\*\*/);
});

test("next best action mission priority", () => {
  const nba = computeNextBestAction({
    overview: { level: {} },
    missions: [
      {
        id: "m1",
        title: "Test",
        remaining: 2,
        uiStatus: { key: "in_progress" },
        targetLabel: "إحالات",
      },
    ],
    entitlements: [],
  });
  assert.equal(nba.type, "mission");
  assert.match(nba.message, /بقي 2/);
});

test("streak still disabled", () => {
  const r = validateMissionDefinition({
    code: "s",
    name: "s",
    mission_type: "streak_period",
    target_metric: "x",
    target_value: 1,
    reward_amount: 1,
  });
  assert.equal(r.ok, false);
});

console.log(`\nPartner Center Phase 3 unit: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
