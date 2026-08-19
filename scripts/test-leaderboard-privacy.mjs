#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  toPublicLeaderboardEntry,
  assertPublicLeaderboardPayload,
} from "../lib/partner-center/leaderboard-dto.js";
import { LEADERBOARD_FORBIDDEN_PUBLIC_FIELDS } from "../lib/partner-center/leaderboard-public.js";

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

test("public DTO strips forbidden fields", () => {
  const row = toPublicLeaderboardEntry({
    rank: 1,
    display_label: "Partner ABCD***",
    metric_value: 5,
    ranking_metric: "qualified_referrals",
    period_key: "2026-08",
  });
  for (const key of LEADERBOARD_FORBIDDEN_PUBLIC_FIELDS) {
    assert.equal(key in row, false, `forbidden field leaked: ${key}`);
  }
  assert.equal(row.publicScore, 5);
});

test("assertPublicLeaderboardPayload rejects PII", () => {
  assert.throws(() =>
    assertPublicLeaderboardPayload([{ rank: 1, email: "secret@example.com" }])
  );
});

test("forbidden field list covers legacy API fields", () => {
  for (const key of ["email", "userId", "partnerId", "totalEarnings", "totalCommissions"]) {
    assert.ok(LEADERBOARD_FORBIDDEN_PUBLIC_FIELDS.includes(key));
  }
});

console.log(`\nLeaderboard privacy tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
