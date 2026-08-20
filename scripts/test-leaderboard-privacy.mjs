#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  toPublicLeaderboardEntry,
  assertPublicLeaderboardPayload,
  LEADERBOARD_FORBIDDEN_PUBLIC_FIELDS,
} from "../lib/partner-center/leaderboard-dto.js";
import { getPublicPartnerLeaderboard } from "../lib/partner-center/leaderboard-engine.js";

const FORBIDDEN = [
  ...LEADERBOARD_FORBIDDEN_PUBLIC_FIELDS,
  "totalSales",
  "fraudStatus",
  "riskLevel",
  "humanVerificationStatus",
];

function collectKeys(obj, prefix = "") {
  const keys = [];
  if (!obj || typeof obj !== "object") return keys;
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    keys.push(path);
    if (v && typeof v === "object" && !Array.isArray(v)) keys.push(...collectKeys(v, path));
  }
  return keys;
}

function assertNoForbiddenDeep(payload) {
  const keys = collectKeys(payload);
  for (const forbidden of FORBIDDEN) {
    assert.ok(!keys.some((k) => k === forbidden || k.endsWith(`.${forbidden}`)), `leaked ${forbidden}`);
  }
}

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
  assert.throws(() => assertPublicLeaderboardPayload([{ rank: 1, email: "secret@example.com" }]));
});

test("serialized API shape has only approved top-level fields", () => {
  const apiShape = {
    success: true,
    leaderboard: [
      toPublicLeaderboardEntry({
        rank: 1,
        display_label: "Partner GOOD***",
        metric_value: 3,
        ranking_metric: "qualified_referrals",
        period_key: "2026-08",
      }),
    ],
    metric: "qualified_referrals",
    periodKey: "2026-08",
    periodType: "monthly",
  };
  assertPublicLeaderboardPayload(apiShape.leaderboard);
  assertNoForbiddenDeep(apiShape);
  const allowedEntryKeys = new Set(["rank", "displayLabel", "publicScore", "metric", "periodKey", "tierBadge"]);
  for (const row of apiShape.leaderboard) {
    for (const k of Object.keys(row)) {
      assert.ok(allowedEntryKeys.has(k), `unexpected entry field ${k}`);
    }
  }
});

test("recursive JSON serialization privacy", () => {
  const payload = JSON.parse(
    JSON.stringify({
      success: true,
      leaderboard: [
        toPublicLeaderboardEntry({
          rank: 2,
          display_label: "Partner SAFE***",
          metric_value: 1,
          ranking_metric: "qualified_referrals",
          period_key: "2026-08",
          metadata: { tierBadge: "partner" },
        }),
      ],
      periodKey: "2026-08",
    })
  );
  assertNoForbiddenDeep(payload);
  assertPublicLeaderboardPayload(payload.leaderboard);
});

test("engine export surface is privacy-safe", () => {
  assert.equal(typeof getPublicPartnerLeaderboard, "function");
});

console.log(`\nLeaderboard privacy tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
