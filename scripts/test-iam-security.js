import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  hashServiceSecret,
  verifyServiceSecret,
  isPlaceholderHash,
  isServiceAccountConfigured,
  generateServiceSecret,
} from "../lib/iam/service-accounts.js";
import { clearMemoryRevocations, revokeSessionToken, isSessionRevoked } from "../lib/iam/session-revocation.js";
import { validateIamFlagCombination } from "../lib/iam/feature-flags.js";
import {
  checkBootstrapRateLimit,
  clearBootstrapRateLimits,
  getBootstrapTokenFromRequest,
} from "../lib/iam/bootstrap.js";

describe("Service account secrets", () => {
  it("rejects placeholder hashes", () => {
    assert.equal(isPlaceholderHash("0000000000000000000000000000000000000000000000000000000000000000"), true);
    assert.equal(isServiceAccountConfigured({ enabled: true, secret_hash: "0000" }), false);
  });

  it("unconfigured account rejected", () => {
    assert.equal(isServiceAccountConfigured({ enabled: false, secret_hash: null }), false);
  });

  it("hash and verify roundtrip", () => {
    const secret = generateServiceSecret();
    const hash = hashServiceSecret(secret, "cron");
    assert.equal(verifyServiceSecret(secret, hash, "cron"), true);
    assert.equal(verifyServiceSecret("wrong", hash, "cron"), false);
  });

  it("rotation invalidates old secret", () => {
    const old = generateServiceSecret();
    const oldHash = hashServiceSecret(old, "news-worker");
    const next = generateServiceSecret();
    const nextHash = hashServiceSecret(next, "news-worker");
    assert.equal(verifyServiceSecret(old, nextHash, "news-worker"), false);
    assert.equal(verifyServiceSecret(next, nextHash, "news-worker"), true);
    assert.notEqual(oldHash, nextHash);
  });
});

describe("Session revocation", () => {
  beforeEach(() => clearMemoryRevocations());

  it("revoked token rejected", async () => {
    const token = "test.jwt.token";
    await revokeSessionToken(null, { token, userId: "u1" });
    const check = await isSessionRevoked(null, { token });
    assert.equal(check.revoked, true);
  });
});

describe("Feature flag combinations", () => {
  it("IAM_API requires IAM_DB", () => {
    const r = validateIamFlagCombination({ IAM_DB: false, IAM_API: true, IAM_UI: false, IAM_RLS: false });
    assert.equal(r.ok, false);
  });

  it("all off is valid", () => {
    const r = validateIamFlagCombination({ IAM_DB: false, IAM_API: false, IAM_UI: false, IAM_RLS: false });
    assert.equal(r.ok, true);
  });

  it("IAM_RLS requires DB and API", () => {
    const r = validateIamFlagCombination({ IAM_DB: true, IAM_API: false, IAM_UI: false, IAM_RLS: true });
    assert.equal(r.ok, false);
  });
});

describe("Bootstrap hardening", () => {
  beforeEach(() => clearBootstrapRateLimits());

  it("bootstrap token not read from authorization header", () => {
    const req = { headers: { get: (k) => (k === "authorization" ? "Bearer secret" : "") } };
    assert.equal(getBootstrapTokenFromRequest(req), "");
  });

  it("rate limit blocks excessive attempts", () => {
    const req = { headers: { get: () => "1.2.3.4" } };
    for (let i = 0; i < 5; i += 1) checkBootstrapRateLimit(req);
    const blocked = checkBootstrapRateLimit(req);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.status, 429);
  });
});

console.log("IAM security tests loaded");
