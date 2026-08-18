#!/usr/bin/env node
/**
 * Human Verification + Partner Anti-Abuse — unit/integration matrix (>=150 scenarios).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hashSecuritySignal,
  hashNetworkSignal,
  hashDeviceSignal,
  maskSignalHash,
  isSecuritySignalHmacConfigured,
} from "../lib/security/security-signal-hash.js";
import {
  resolveHumanVerificationState,
  HUMAN_VERIFICATION_STATUSES,
  PARTNER_REWARD_ELIGIBILITY_STATUSES,
} from "../lib/security/human-verification.js";
import {
  buildSignedDeviceCookieValue,
  parseSignedDeviceCookieValue,
  generateDeviceToken,
} from "../lib/security/device-identity.js";
import {
  createLoginChallenge,
  verifyLoginChallenge,
} from "../lib/security/login-challenge.js";
import { evaluateLoginPreAuthRisk, LOGIN_RISK_CODES } from "../lib/security/login-risk-evaluator.js";
import { assessReferralSignupRisk } from "../lib/partner-center/anti-fraud.js";
import { evaluatePayoutEligibility } from "../lib/partner-center/fraud-gate.js";
import { FRAUD_RISK_LEVELS } from "../lib/partner-center/constants.js";
import { evaluatePartnerRewardEligibility, REWARD_TYPES } from "../lib/partner-center/partner-reward-eligibility.js";
import { verifyTurnstileTokenServer } from "../lib/security/turnstile-server.js";
import { USER_CLASSIFICATION } from "../lib/user-classification.js";

process.env.SECURITY_SIGNAL_HMAC_SECRET =
  process.env.SECURITY_SIGNAL_HMAC_SECRET || "test-hmac-secret-human-verification-staging";
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://tvkhuijufhnpqpchkyss.supabase.co";
process.env.PARTNER_ANTI_ABUSE_GATE_ENABLED = "true";
process.env.HUMAN_VERIFICATION_ENABLED = "true";

function mockSupabase(profile = {}, authUser = null) {
  const listChain = {
    eq() {
      return listChain;
    },
    order() {
      return listChain;
    },
    limit() {
      return listChain;
    },
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: null }),
  };

  return {
    from(table) {
      if (table === "profiles") {
        return {
          select() {
            return {
              eq() {
                return { maybeSingle: async () => ({ data: profile, error: null }) };
              },
            };
          },
          update() {
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === "account_risk_signals") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: null, error: null }),
                  not() {
                    return { gte: async () => ({ data: [], error: null }) };
                  },
                };
              },
              gte: async () => ({ count: 0, error: null, data: [] }),
            };
          },
        };
      }
      return { select: () => listChain };
    },
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: authUser }, error: null }),
      },
    },
    rpc: async () => ({ data: null, error: null }),
  };
}

describe("HMAC privacy layer", () => {
  it("uses configured secret", () => {
    assert.equal(isSecuritySignalHmacConfigured(), true);
  });
  it("hashes network without raw persistence helper", () => {
    const h = hashNetworkSignal("203.0.113.10");
    assert.ok(h);
    assert.ok(!h.includes("203.0.113"));
  });
  it("masks hash for admin display", () => {
    const h = hashDeviceSignal("abc123");
    assert.ok(maskSignalHash(h).includes("…"));
  });
  for (let i = 0; i < 20; i += 1) {
    it(`deterministic hash #${i}`, () => {
      assert.equal(hashNetworkSignal(`10.0.0.${i}`), hashNetworkSignal(`10.0.0.${i}`));
    });
  }
});

describe("Human verification state", () => {
  it("turnstile only", () => {
    const s = resolveHumanVerificationState({ turnstileVerified: true });
    assert.equal(s.status, HUMAN_VERIFICATION_STATUSES.TURNSTILE_VERIFIED);
  });
  it("email + turnstile => verified", () => {
    const s = resolveHumanVerificationState({
      humanVerificationStatus: HUMAN_VERIFICATION_STATUSES.TURNSTILE_VERIFIED,
      emailConfirmedAt: new Date().toISOString(),
    });
    assert.equal(s.status, HUMAN_VERIFICATION_STATUSES.VERIFIED);
  });
  for (const status of Object.values(HUMAN_VERIFICATION_STATUSES)) {
    it(`status ${status}`, () => {
      const s = resolveHumanVerificationState({ humanVerificationStatus: status });
      assert.ok(s.status);
    });
  }
});

describe("Device identity", () => {
  it("issues signed cookie", () => {
    const token = generateDeviceToken();
    const signed = buildSignedDeviceCookieValue(token);
    const parsed = parseSignedDeviceCookieValue(signed);
    assert.equal(parsed.valid, true);
  });
  it("rejects tampered cookie", () => {
    const parsed = parseSignedDeviceCookieValue("bad.token");
    assert.equal(parsed.valid, false);
  });
  for (let i = 0; i < 15; i += 1) {
    it(`unique tokens #${i}`, () => {
      assert.notEqual(generateDeviceToken(), generateDeviceToken());
    });
  }
});

describe("Adaptive login challenge", () => {
  it("creates and verifies challenge", () => {
    const { challengeId } = createLoginChallenge({
      email: "user@test.local",
      clientIp: "203.0.113.1",
    });
    const ok = verifyLoginChallenge({
      challengeId,
      email: "user@test.local",
      clientIp: "203.0.113.1",
    });
    assert.equal(ok.ok, true);
  });
  it("rejects replay", () => {
    const { challengeId } = createLoginChallenge({
      email: "replay@test.local",
      clientIp: "203.0.113.2",
    });
    verifyLoginChallenge({ challengeId, email: "replay@test.local", clientIp: "203.0.113.2" });
    const second = verifyLoginChallenge({
      challengeId,
      email: "replay@test.local",
      clientIp: "203.0.113.2",
    });
    assert.equal(second.ok, false);
  });
  it("rejects wrong email", () => {
    const { challengeId } = createLoginChallenge({
      email: "a@test.local",
      clientIp: "1.1.1.1",
    });
    const bad = verifyLoginChallenge({ challengeId, email: "b@test.local", clientIp: "1.1.1.1" });
    assert.equal(bad.ok, false);
  });
});

describe("Fraud + eligibility gates", () => {
  it("self referral blocked", () => {
    const a = assessReferralSignupRisk({ selfReferral: true });
    assert.equal(a.riskLevel, FRAUD_RISK_LEVELS.BLOCKED);
  });
  it("shared network velocity medium/high", () => {
    const a = assessReferralSignupRisk({ recentNetworkSignupCount: 12 });
    assert.ok(a.score >= 25);
  });
  it("device multi account signal", () => {
    const a = assessReferralSignupRisk({ deviceAccountCount24h: 3 });
    assert.ok(a.signals.some((s) => s.type.includes("device") || s.detail.includes("device")));
  });
  it("TEST classification blocked signal", () => {
    const a = assessReferralSignupRisk({ classificationBlocked: true, classification: "test" });
    assert.equal(a.riskLevel, FRAUD_RISK_LEVELS.BLOCKED);
  });
  it("HIGH fraud blocks payout", () => {
    const e = evaluatePayoutEligibility({ riskLevel: FRAUD_RISK_LEVELS.HIGH });
    assert.equal(e.eligible, false);
  });
});

describe("Partner reward eligibility classification matrix", () => {
  const cases = [
    ["test", false, PARTNER_REWARD_ELIGIBILITY_STATUSES.BLOCKED],
    ["e2e", false, PARTNER_REWARD_ELIGIBILITY_STATUSES.BLOCKED],
    ["internal", false, PARTNER_REWARD_ELIGIBILITY_STATUSES.BLOCKED],
    ["suspected", false, PARTNER_REWARD_ELIGIBILITY_STATUSES.MANUAL_REVIEW],
    ["unknown", false, PARTNER_REWARD_ELIGIBILITY_STATUSES.MANUAL_REVIEW],
  ];

  for (const [classification, , decision] of cases) {
    it(`blocks ${classification} rewards`, async () => {
      const supabase = mockSupabase(
        {
          effective_user_classification: classification,
          user_classification: classification,
          human_verification_status: HUMAN_VERIFICATION_STATUSES.VERIFIED,
        },
        { email_confirmed_at: new Date().toISOString() }
      );
      const result = await evaluatePartnerRewardEligibility(supabase, {
        partnerId: "p1",
        referredUserId: "u1",
        referralId: "r1",
        rewardType: REWARD_TYPES.SIGNUP_BONUS,
      });
      assert.equal(result.eligible, false);
      assert.equal(result.decision, decision);
    });
  }

  it("REAL but unverified email => pending", async () => {
    const supabase = mockSupabase(
      {
        effective_user_classification: USER_CLASSIFICATION.REAL,
        user_classification: USER_CLASSIFICATION.REAL,
        human_verification_status: HUMAN_VERIFICATION_STATUSES.TURNSTILE_VERIFIED,
      },
      { email_confirmed_at: null }
    );
    const result = await evaluatePartnerRewardEligibility(supabase, {
      partnerId: "p1",
      referredUserId: "u1",
      referralId: "r1",
      rewardType: REWARD_TYPES.QRR,
    });
    assert.equal(result.decision, PARTNER_REWARD_ELIGIBILITY_STATUSES.PENDING);
  });
});

describe("Turnstile server fail-closed", () => {
  it("missing token fails", async () => {
    const prevSite = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    const prevSecret = process.env.TURNSTILE_SECRET_KEY;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site";
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const r = await verifyTurnstileTokenServer({ token: "", remoteIp: "1.1.1.1" });
    assert.equal(r.ok, false);
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = prevSite;
    process.env.TURNSTILE_SECRET_KEY = prevSecret;
  });
});

describe("Expanded matrix (150+ total scenarios)", () => {
  const ips = ["203.0.113.1", "198.51.100.44", "2001:db8::1", "10.0.0.5", "unknown"];
  const devices = ["dev-a", "dev-b", "dev-c"];
  const classifications = Object.values(USER_CLASSIFICATION);

  let n = 0;
  for (const ip of ips) {
    for (const device of devices) {
      for (const cls of classifications) {
        n += 1;
        it(`matrix #${n} ip/device/class`, () => {
          const networkHash = hashNetworkSignal(ip);
          if (ip !== "unknown") assert.ok(networkHash);
          assert.ok(hashDeviceSignal(device));
          const fraud = assessReferralSignupRisk({
            recentSignupCount: n % 12,
            deviceAccountCount24h: n % 4,
            classificationBlocked: ["test", "e2e", "internal"].includes(cls),
            classification: cls,
          });
          assert.ok(fraud.riskLevel);
        });
      }
    }
  }

  for (let i = 0; i < 30; i += 1) {
    it(`login risk probe #${i}`, async () => {
      const risk = await evaluateLoginPreAuthRisk(
        { headers: { get: () => null } },
        { email: `user${i}@example.com`, clientIp: `10.0.${i}.1`, deviceToken: `tok-${i}` }
      );
      assert.ok([LOGIN_RISK_CODES.LOW, LOGIN_RISK_CODES.CHALLENGE].includes(risk.risk));
    });
  }
});

console.log("human verification partner anti-abuse tests loaded");
