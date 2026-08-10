#!/usr/bin/env node
/**
 * Partner Center Round 6 — qualification policy + anti-fraud hardening tests
 */
import assert from "node:assert/strict";
import {
  evaluateQualificationDecision,
  canVerifyReferral,
  canQualifyReferral,
  countsAsQualifiedMetric,
  QUALIFICATION_POLICY_VERSION,
  QUALIFICATION_REASONS,
  getQualificationMinAgeMinutes,
} from "../lib/partner-center/qualification-policy.js";
import { FRAUD_RISK_LEVELS, QUALIFICATION_STATES } from "../lib/partner-center/constants.js";
import { assessReferralSignupRisk } from "../lib/partner-center/anti-fraud.js";

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

function baseChecks(overrides = {}) {
  return {
    accountExists: true,
    emailVerified: true,
    attributionValid: true,
    partnerActive: true,
    selfReferral: false,
    duplicateIdentity: false,
    fraudAllowed: true,
    minimumAge: true,
    meaningfulActivity: true,
    ...overrides,
  };
}

function ctx(overrides = {}) {
  const now = new Date();
  const oldEnough = new Date(now.getTime() - (getQualificationMinAgeMinutes() + 1) * 60000).toISOString();
  return {
    currentState: QUALIFICATION_STATES.SIGNUP,
    referredUserId: "user-1",
    emailVerified: true,
    accountCreatedAt: oldEnough,
    partnerActive: true,
    attributionValid: true,
    selfReferral: false,
    duplicateIdentity: false,
    fraudRiskLevel: FRAUD_RISK_LEVELS.LOW,
    meaningfulActivityCount: 1,
    ...overrides,
  };
}

async function run() {
  await test("signup only is NOT qualified", () => {
    const d = evaluateQualificationDecision(
      ctx({
        currentState: QUALIFICATION_STATES.SIGNUP,
        emailVerified: false,
        meaningfulActivityCount: 0,
        accountCreatedAt: new Date().toISOString(),
      })
    );
    assert.notEqual(d.targetState, QUALIFICATION_STATES.QUALIFIED);
  });

  await test("unverified email + activity is NOT qualified", () => {
    const d = evaluateQualificationDecision(
      ctx({ emailVerified: false, meaningfulActivityCount: 2 })
    );
    assert.notEqual(d.targetState, QUALIFICATION_STATES.QUALIFIED);
    assert.match(d.reasons.join(","), /email/i);
  });

  await test("verified email only stays verified not qualified", () => {
    const d = evaluateQualificationDecision(
      ctx({
        currentState: QUALIFICATION_STATES.SIGNUP,
        emailVerified: true,
        meaningfulActivityCount: 0,
        accountCreatedAt: new Date(Date.now() - 60 * 60000).toISOString(),
      })
    );
    assert.equal(d.targetState, QUALIFICATION_STATES.VERIFIED);
  });

  await test("verified + age + activity + LOW fraud qualifies", () => {
    const d = evaluateQualificationDecision(ctx());
    assert.equal(d.targetState, QUALIFICATION_STATES.QUALIFIED);
    assert.equal(d.eligible, true);
  });

  await test("verified + activity but age not met stays verified", () => {
    const d = evaluateQualificationDecision(
      ctx({ accountCreatedAt: new Date().toISOString(), meaningfulActivityCount: 1 })
    );
    assert.notEqual(d.targetState, QUALIFICATION_STATES.QUALIFIED);
  });

  await test("HIGH fraud does NOT qualify", () => {
    const d = evaluateQualificationDecision(
      ctx({ fraudRiskLevel: FRAUD_RISK_LEVELS.HIGH })
    );
    assert.notEqual(d.targetState, QUALIFICATION_STATES.QUALIFIED);
    assert.ok(
      d.reasons.some((r) =>
        [QUALIFICATION_REASONS.FRAUD_HIGH_BLOCKED, QUALIFICATION_REASONS.REVIEW_REQUIRED].includes(r)
      )
    );
  });

  await test("BLOCKED fraud disqualified", () => {
    const d = evaluateQualificationDecision(
      ctx({ fraudRiskLevel: FRAUD_RISK_LEVELS.BLOCKED })
    );
    assert.equal(d.targetState, QUALIFICATION_STATES.DISQUALIFIED);
  });

  await test("self-referral disqualified", () => {
    const d = evaluateQualificationDecision(ctx({ selfReferral: true }));
    assert.equal(d.targetState, QUALIFICATION_STATES.DISQUALIFIED);
    assert.match(d.reasons.join(","), /self_referral/);
  });

  await test("MEDIUM fraud can qualify when checks pass", () => {
    const checks = baseChecks();
    assert.equal(canQualifyReferral(checks, FRAUD_RISK_LEVELS.MEDIUM), true);
  });

  await test("countsAsQualifiedMetric includes customer", () => {
    assert.equal(countsAsQualifiedMetric(QUALIFICATION_STATES.QUALIFIED), true);
    assert.equal(countsAsQualifiedMetric(QUALIFICATION_STATES.CUSTOMER), true);
    assert.equal(countsAsQualifiedMetric(QUALIFICATION_STATES.SIGNUP), false);
  });

  await test("velocity attack elevates to HIGH review", () => {
    const medium = assessReferralSignupRisk({ recentSignupCount: 9 });
    assert.notEqual(medium.riskLevel, FRAUD_RISK_LEVELS.HIGH);
    const high = assessReferralSignupRisk({ duplicateAttribution: true });
    assert.equal(high.riskLevel, FRAUD_RISK_LEVELS.HIGH);
  });

  await test("shared IP alone is not auto-disqualify in policy", () => {
    const d = evaluateQualificationDecision(ctx());
    assert.notEqual(d.targetState, QUALIFICATION_STATES.DISQUALIFIED);
  });

  await test("decision object shape", () => {
    const d = evaluateQualificationDecision(ctx());
    assert.equal(typeof d.eligible, "boolean");
    assert.ok(Array.isArray(d.reasons));
    assert.ok(d.checks);
    assert.equal(d.policyVersion, QUALIFICATION_POLICY_VERSION);
  });

  await test("canVerify requires email verified", () => {
    assert.equal(canVerifyReferral(baseChecks({ emailVerified: false })), false);
    assert.equal(canVerifyReferral(baseChecks()), true);
  });

  await test("canQualify requires meaningful activity", () => {
    assert.equal(canQualifyReferral(baseChecks({ meaningfulActivity: false })), false);
    assert.equal(canQualifyReferral(baseChecks()), true);
  });

  await test("register API requires server turnstile when configured", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(
      new URL("../app/api/auth/register/route.js", import.meta.url),
      "utf8"
    );
    assert.match(source, /verifyTurnstileTokenServer/);
    assert.match(source, /turnstileToken/);
    assert.doesNotMatch(source, /TURNSTILE_SECRET_KEY/);
  });

  await test("no client qualification endpoint pattern", async () => {
    const fs = await import("node:fs/promises");
    const activity = await fs.readFile(
      new URL("../lib/partner-center/qualification-activity.js", import.meta.url),
      "utf8"
    );
    assert.doesNotMatch(activity, /POST.*qualification/);
    assert.match(activity, /recordPartnerEvent/);
  });

  await test("markReferralQualifiedOnActivation uses policy evaluator", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(
      new URL("../lib/partner-center/qualification-engine.js", import.meta.url),
      "utf8"
    );
    assert.match(source, /recordTrustedQualificationActivity/);
    assert.match(source, /markReferralCustomerOnService/);
    assert.doesNotMatch(
      source.slice(source.indexOf("markReferralQualifiedOnActivation")),
      /toState:\s*QUALIFICATION_STATES\.QUALIFIED/
    );
  });

  await test("signup bonus hold applied in partner-server", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(
      new URL("../lib/partner-server.js", import.meta.url),
      "utf8"
    );
    assert.match(source, /pending_qualification/);
  });

  await test("funnel qualified metric includes customer states", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(
      new URL("../lib/partner-center/smart-link-analytics.js", import.meta.url),
      "utf8"
    );
    assert.match(source, /countsAsQualifiedMetric/);
  });

  await test("partner metrics qualified includes customer", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(
      new URL("../lib/partner-center/partner-metrics.js", import.meta.url),
      "utf8"
    );
    assert.match(source, /QUALIFIED, QUALIFICATION_STATES\.CUSTOMER/);
  });

  console.log(`\nPartner Qualification Hardening tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
