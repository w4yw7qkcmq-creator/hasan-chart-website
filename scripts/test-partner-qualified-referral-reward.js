#!/usr/bin/env node
/**
 * Partner Center Round 7 — qualified referral reward + admin control tests
 */
import assert from "node:assert/strict";
import {
  validateQualifiedReferralRewardAmount,
  QUALIFIED_REFERRAL_REWARD_MIN,
  QUALIFIED_REFERRAL_REWARD_MAX,
} from "../lib/partner-center/qualified-referral-reward-policy.js";

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL ${name}`, e.message);
  }
}

async function run() {
  await test("valid amount 1.00 accepted", () => {
    const r = validateQualifiedReferralRewardAmount("1.00");
    assert.equal(r.ok, true);
    assert.equal(r.amount, 1);
  });

  await test("valid amount 0.50 accepted", () => {
    const r = validateQualifiedReferralRewardAmount("0.50");
    assert.equal(r.ok, true);
    assert.equal(r.amount, 0.5);
  });

  await test("valid amount 0.01 accepted (min)", () => {
    const r = validateQualifiedReferralRewardAmount("0.01");
    assert.equal(r.ok, true);
    assert.equal(r.amount, QUALIFIED_REFERRAL_REWARD_MIN);
  });

  await test("invalid 0.005 rejected (3 decimals)", () => {
    const r = validateQualifiedReferralRewardAmount("0.005");
    assert.equal(r.ok, false);
  });

  await test("negative rejected", () => {
    const r = validateQualifiedReferralRewardAmount("-1");
    assert.equal(r.ok, false);
  });

  await test("zero rejected", () => {
    const r = validateQualifiedReferralRewardAmount("0");
    assert.equal(r.ok, false);
  });

  await test("huge amount rejected", () => {
    const r = validateQualifiedReferralRewardAmount("999");
    assert.equal(r.ok, false);
  });

  await test("max amount 100 accepted", () => {
    const r = validateQualifiedReferralRewardAmount("100");
    assert.equal(r.ok, true);
    assert.equal(r.amount, QUALIFIED_REFERRAL_REWARD_MAX);
  });

  await test("scientific notation rejected", () => {
    const r = validateQualifiedReferralRewardAmount("1e2");
    assert.equal(r.ok, false);
  });

  await test("NaN string rejected", () => {
    const r = validateQualifiedReferralRewardAmount("abc");
    assert.equal(r.ok, false);
  });

  await test("empty rejected", () => {
    const r = validateQualifiedReferralRewardAmount("");
    assert.equal(r.ok, false);
  });

  console.log(`\nRound 7 unit: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
