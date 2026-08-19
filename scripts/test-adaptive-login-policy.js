#!/usr/bin/env node
/**
 * Adaptive login policy: 3 failures → Turnstile on request #4, hard limit = 5.
 * Run: node --test scripts/test-adaptive-login-policy.js
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  peekLoginFailedAuthLimits,
  recordLoginFailedAuthAttempt,
  resetLoginFailedAuthCounters,
  normalizeFailedAuthLimiterPeek,
  LOGIN_FAILED_AUTH_CHALLENGE_COUNT,
  buildLoginFailedAuthKey,
  hashLoginAccountKey,
} from "../lib/auth-login-rate-limit.js";
import {
  evaluateLoginPreAuthRisk,
  LOGIN_RISK_CODES,
} from "../lib/security/login-risk-evaluator.js";
import {
  createLoginChallenge,
  verifyLoginChallenge,
  consumeLoginChallenge,
} from "../lib/security/login-challenge.js";
import { verifyTurnstileTokenServer } from "../lib/security/turnstile-server.js";
import {
  LOGIN_FAILED_AUTH_PAIR_MAX,
  loginFailedAuthLimiter,
  loginAccountFailedLimiter,
  loginFloodLimiter,
} from "../lib/rate-limit.js";

const ENV_KEYS = [
  "TURNSTILE_LOGIN_ADAPTIVE_ENABLED",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY",
  "SECURITY_SIGNAL_HMAC_SECRET",
];

function saveEnv() {
  return Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
}

function restoreEnv(snapshot) {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

async function resetAll(ip, email) {
  await loginFloodLimiter.reset(ip);
  if (email) {
    await loginFailedAuthLimiter.reset(buildLoginFailedAuthKey(ip, email));
    await loginAccountFailedLimiter.reset(hashLoginAccountKey(email));
  }
}

describe("failed-auth count/limit/remaining semantics", () => {
  const ip = "203.0.113.77";
  const email = "adaptive-policy@example.com";

  beforeEach(async () => {
    await resetAll(ip, email);
  });

  it("starts at count=0 remaining=limit", async () => {
    const peek = await peekLoginFailedAuthLimits({ clientIp: ip, email });
    assert.equal(peek.count, 0);
    assert.equal(peek.limit, LOGIN_FAILED_AUTH_PAIR_MAX);
    assert.equal(peek.remaining, LOGIN_FAILED_AUTH_PAIR_MAX);
    assert.equal(peek.limited, false);
  });

  it("increments count by one per recorded failure", async () => {
    for (let expected = 1; expected <= 3; expected += 1) {
      await recordLoginFailedAuthAttempt({ clientIp: ip, email });
      const peek = await peekLoginFailedAuthLimits({ clientIp: ip, email });
      assert.equal(peek.count, expected, `after failure #${expected}`);
      assert.equal(peek.remaining, LOGIN_FAILED_AUTH_PAIR_MAX - expected);
      assert.equal(peek.limit, LOGIN_FAILED_AUTH_PAIR_MAX);
    }
  });

  it("hard limits at LOGIN_FAILED_AUTH_PAIR_MAX", async () => {
    for (let i = 0; i < LOGIN_FAILED_AUTH_PAIR_MAX; i += 1) {
      await recordLoginFailedAuthAttempt({ clientIp: ip, email });
    }
    const peek = await peekLoginFailedAuthLimits({ clientIp: ip, email });
    assert.equal(peek.count, LOGIN_FAILED_AUTH_PAIR_MAX);
    assert.equal(peek.remaining, 0);
    assert.equal(peek.limited, true);
  });

  it("normalizeFailedAuthLimiterPeek matches remaining=max(0,limit-count)", () => {
    const normalized = normalizeFailedAuthLimiterPeek(
      { success: true, remaining: 2, count: 3, storage: "memory" },
      5
    );
    assert.equal(normalized.count, 3);
    assert.equal(normalized.remaining, 2);
    assert.equal(normalized.limit, 5);
    assert.equal(normalized.limited, false);
  });
});

describe("adaptive challenge threshold", () => {
  const ip = "203.0.113.78";
  const email = "challenge-threshold@example.com";
  let envSnapshot;

  beforeEach(async () => {
    envSnapshot = saveEnv();
    process.env.TURNSTILE_LOGIN_ADAPTIVE_ENABLED = "true";
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";
    process.env.SECURITY_SIGNAL_HMAC_SECRET = "adaptive-login-test-hmac-secret";
    await resetAll(ip, email);
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it("0-2 failures remain LOW", async () => {
    for (let failures = 0; failures < LOGIN_FAILED_AUTH_CHALLENGE_COUNT; failures += 1) {
      if (failures > 0) {
        await recordLoginFailedAuthAttempt({ clientIp: ip, email });
      }
      const risk = await evaluateLoginPreAuthRisk(
        { headers: { get: () => null } },
        { email, clientIp: ip, deviceToken: "device-token" }
      );
      assert.equal(risk.risk, LOGIN_RISK_CODES.LOW, `failures=${failures}`);
      assert.equal(risk.count, failures);
    }
  });

  it("3 failures require CHALLENGE on next request", async () => {
    for (let i = 0; i < LOGIN_FAILED_AUTH_CHALLENGE_COUNT; i += 1) {
      await recordLoginFailedAuthAttempt({ clientIp: ip, email });
    }

    const risk = await evaluateLoginPreAuthRisk(
      { headers: { get: () => null } },
      { email, clientIp: ip, deviceToken: "device-token" }
    );

    assert.equal(risk.count, LOGIN_FAILED_AUTH_CHALLENGE_COUNT);
    assert.equal(risk.risk, LOGIN_RISK_CODES.CHALLENGE);
    assert.ok(risk.reasons.includes("failed_auth_challenge_threshold"));
  });

  it("adaptive flag OFF keeps LOW even after failures", async () => {
    process.env.TURNSTILE_LOGIN_ADAPTIVE_ENABLED = "false";
    for (let i = 0; i < 4; i += 1) {
      await recordLoginFailedAuthAttempt({ clientIp: ip, email });
    }
    const risk = await evaluateLoginPreAuthRisk(
      { headers: { get: () => null } },
      { email, clientIp: ip, deviceToken: "device-token" }
    );
    assert.equal(risk.risk, LOGIN_RISK_CODES.LOW);
  });
});

describe("successful auth reset", () => {
  const ip = "203.0.113.79";
  const email = "reset-after-success@example.com";

  beforeEach(async () => {
    await resetAll(ip, email);
  });

  it("clears failed-auth counters after successful login reset", async () => {
    await recordLoginFailedAuthAttempt({ clientIp: ip, email });
    await recordLoginFailedAuthAttempt({ clientIp: ip, email });
    await recordLoginFailedAuthAttempt({ clientIp: ip, email });

    let peek = await peekLoginFailedAuthLimits({ clientIp: ip, email });
    assert.equal(peek.count, 3);

    await resetLoginFailedAuthCounters({ clientIp: ip, email });

    peek = await peekLoginFailedAuthLimits({ clientIp: ip, email });
    assert.equal(peek.count, 0);
    assert.equal(peek.limited, false);
  });
});

describe("Turnstile/challenge security contract", () => {
  let envSnapshot;

  beforeEach(() => {
    envSnapshot = saveEnv();
    process.env.SECURITY_SIGNAL_HMAC_SECRET = "adaptive-login-test-hmac-secret";
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";
    process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it("challenge replay is blocked", () => {
    const challenge = createLoginChallenge({
      email: "user@example.com",
      clientIp: "203.0.113.1",
      deviceHash: "dev-hash",
    });

    const ok = verifyLoginChallenge({
      challengeId: challenge.challengeId,
      email: "user@example.com",
      clientIp: "203.0.113.1",
      deviceHash: "dev-hash",
      consume: true,
    });
    assert.equal(ok.ok, true);

    const replay = verifyLoginChallenge({
      challengeId: challenge.challengeId,
      email: "user@example.com",
      clientIp: "203.0.113.1",
      deviceHash: "dev-hash",
      consume: false,
    });
    assert.equal(replay.ok, false);
    assert.equal(replay.reason, "challenge_replay");
  });

  it("challenge email mismatch is blocked", () => {
    const challenge = createLoginChallenge({
      email: "a@example.com",
      clientIp: "203.0.113.1",
    });
    const mismatch = verifyLoginChallenge({
      challengeId: challenge.challengeId,
      email: "b@example.com",
      clientIp: "203.0.113.1",
      consume: false,
    });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.reason, "challenge_email_mismatch");
  });

  it("invalid Turnstile token fails closed", async () => {
    const result = await verifyTurnstileTokenServer({
      token: "invalid-token",
      remoteIp: "203.0.113.1",
      expectedAction: "login",
    });
    assert.equal(result.ok, false);
  });

  it("Turnstile token replay fails closed", async () => {
    const token = "XXXX.DUMMY.TOKEN.XXXX";
    const first = await verifyTurnstileTokenServer({
      token,
      remoteIp: "203.0.113.1",
      expectedAction: "login",
    });
    const replay = await verifyTurnstileTokenServer({
      token,
      remoteIp: "203.0.113.1",
      expectedAction: "login",
    });
    assert.equal(first.ok, true);
    assert.equal(replay.ok, false);
  });

  it("consumeLoginChallenge marks challenge used", () => {
    const challenge = createLoginChallenge({
      email: "user@example.com",
      clientIp: "203.0.113.1",
    });
    assert.equal(consumeLoginChallenge(challenge.challengeId), true);
    assert.equal(consumeLoginChallenge(challenge.challengeId), false);
  });
});

describe("login route contract signals", () => {
  it("login route records failures and resets on success", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const route = readFileSync(join(process.cwd(), "app/api/auth/login/route.js"), "utf8");
    assert.match(route, /recordLoginFailedAuthAttempt/);
    assert.match(route, /resetLoginFailedAuthCounters/);
    assert.match(route, /evaluateLoginPreAuthRisk/);
    assert.match(route, /verifyTurnstileTokenServer/);
  });

  it("registration route remains separate from adaptive login policy", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const register = readFileSync(join(process.cwd(), "app/api/auth/register/route.js"), "utf8");
    assert.doesNotMatch(register, /evaluateLoginPreAuthRisk/);
  });
});

console.log("Adaptive login policy tests loaded");
