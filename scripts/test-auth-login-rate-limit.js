#!/usr/bin/env node
/**
 * Auth login rate-limit matrix (local/memory mode).
 * Run: node --test scripts/test-auth-login-rate-limit.js
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  normalizeLoginEmail,
  hashLoginAccountKey,
  buildLoginFailedAuthKey,
  buildAuthRateLimitPayload,
  enforceLoginFloodLimit,
  peekLoginFailedAuthLimits,
  recordLoginFailedAuthAttempt,
  resetLoginFailedAuthCounters,
  AUTH_RATE_LIMITED_CODE,
} from "../lib/auth-login-rate-limit.js";
import {
  getClientIp,
  hashNetworkKey,
  loginFloodLimiter,
  loginFailedAuthLimiter,
  loginAccountFailedLimiter,
} from "../lib/rate-limit.js";

function makeRequest(headers = {}) {
  return {
    headers: {
      get(name) {
        const key = String(name || "").toLowerCase();
        return headers[key] ?? headers[name] ?? null;
      },
    },
  };
}

async function resetLoginPairLimitersForIp(ip, email) {
  await loginFloodLimiter.reset(ip);
  if (email) {
    const pairKey = buildLoginFailedAuthKey(ip, email);
    await loginFailedAuthLimiter.reset(pairKey);
  }
}

async function resetLoginLimitersForIp(ip, email) {
  await resetLoginPairLimitersForIp(ip, email);
  if (email) {
    await loginAccountFailedLimiter.reset(hashLoginAccountKey(email));
  }
}

const TEST_HMAC_SECRET = "test-only-security-signal-hmac-secret-not-for-production";
const ENV_KEYS = ["SECURITY_SIGNAL_HMAC_SECRET", "AUTH_RATE_LIMIT_PEPPER"];

function saveEnvSnapshot() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnvSnapshot(snapshot) {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

function withTestHmacSecret(fn) {
  const snapshot = saveEnvSnapshot();
  process.env.SECURITY_SIGNAL_HMAC_SECRET = TEST_HMAC_SECRET;
  delete process.env.AUTH_RATE_LIMIT_PEPPER;
  try {
    return fn();
  } finally {
    restoreEnvSnapshot(snapshot);
  }
}

describe("client IP extraction", () => {
  it("prefers x-real-ip over x-forwarded-for", () => {
    const ip = getClientIp(
      makeRequest({
        "x-real-ip": "203.0.113.10",
        "x-forwarded-for": "198.51.100.5, 10.0.0.1",
      })
    );
    assert.equal(ip, "203.0.113.10");
  });

  it("uses first plausible x-forwarded-for hop as fallback", () => {
    const ip = getClientIp(
      makeRequest({
        "x-forwarded-for": "198.51.100.8, 10.0.0.2",
      })
    );
    assert.equal(ip, "198.51.100.8");
  });

  it("returns unknown when headers missing", () => {
    assert.equal(getClientIp(makeRequest({})), "unknown");
  });

  it("hashes network key without exposing raw ip in logs helper", () => {
    withTestHmacSecret(() => {
      const hash = hashNetworkKey("203.0.113.10");
      assert.match(hash, /^[a-f0-9]{16}$/);
      assert.doesNotMatch(hash, /203/);
      const again = hashNetworkKey("203.0.113.10");
      assert.equal(hash, again);
    });
  });

  it("returns unknown when HMAC secret is missing (fail-closed)", () => {
    const snapshot = saveEnvSnapshot();
    delete process.env.SECURITY_SIGNAL_HMAC_SECRET;
    delete process.env.AUTH_RATE_LIMIT_PEPPER;
    try {
      assert.equal(hashNetworkKey("203.0.113.10"), "unknown");
    } finally {
      restoreEnvSnapshot(snapshot);
    }
  });
});

describe("email normalization", () => {
  it("trims and lowercases email", () => {
    assert.equal(normalizeLoginEmail("  User@Example.COM "), "user@example.com");
  });

  it("builds stable hashed account keys", () => {
    const a = hashLoginAccountKey("User@Example.com");
    const b = hashLoginAccountKey("user@example.com");
    assert.equal(a, b);
    assert.doesNotMatch(a, /@/);
  });
});

describe("429 response contract", () => {
  it("includes AUTH_RATE_LIMITED code and Retry-After", () => {
    const resetTime = Date.now() + 45_000;
    const payload = buildAuthRateLimitPayload({ layer: "flood", resetTime });

    assert.equal(payload.status, 429);
    assert.equal(payload.body.code, AUTH_RATE_LIMITED_CODE);
    assert.equal(payload.body.success, false);
    assert.ok(payload.body.retryAfterSeconds >= 1);
    assert.equal(payload.headers["Retry-After"], String(payload.body.retryAfterSeconds));
    assert.match(payload.body.error, /محاولات/);
  });
});

describe("layer 1 — request flood", () => {
  const ip = "10.20.30.40";

  beforeEach(async () => {
    await resetLoginLimitersForIp(ip);
  });

  it("allows many successful login requests without failed-auth penalty", async () => {
    for (let i = 0; i < 8; i += 1) {
      const result = await enforceLoginFloodLimit(makeRequest({ "x-real-ip": ip }));
      assert.equal(result.limited, false, `request ${i + 1} should pass flood layer`);
    }
  });

  it("blocks flood layer with structured 429", async () => {
    for (let i = 0; i < 40; i += 1) {
      const ok = await enforceLoginFloodLimit(makeRequest({ "x-real-ip": ip }));
      assert.equal(ok.limited, false, `flood request ${i + 1}`);
    }

    const blocked = await enforceLoginFloodLimit(makeRequest({ "x-real-ip": ip }));
    assert.equal(blocked.limited, true);
    assert.equal(blocked.body.code, AUTH_RATE_LIMITED_CODE);
    assert.ok(blocked.headers["Retry-After"]);
  });
});

describe("layer 2 — failed authentication", () => {
  const ip = "10.20.30.41";
  const email = "user-a@example.com";

  beforeEach(async () => {
    await resetLoginLimitersForIp(ip, email);
  });

  it("does not block before failed attempts are recorded", async () => {
    const peek = await peekLoginFailedAuthLimits({ clientIp: ip, email });
    assert.equal(peek.limited, false);
  });

  it("blocks after repeated wrong-password attempts", async () => {
    for (let i = 0; i < 5; i += 1) {
      await recordLoginFailedAuthAttempt({ clientIp: ip, email });
    }

    const blocked = await peekLoginFailedAuthLimits({ clientIp: ip, email });
    assert.equal(blocked.limited, true);
    assert.equal(blocked.count, 5);
    assert.equal(blocked.remaining, 0);
    assert.equal(blocked.body.code, AUTH_RATE_LIMITED_CODE);
  });

  it("resets pair counter after successful login semantics", async () => {
    await recordLoginFailedAuthAttempt({ clientIp: ip, email });
    await recordLoginFailedAuthAttempt({ clientIp: ip, email });

    await resetLoginFailedAuthCounters({ clientIp: ip, email });

    const peek = await peekLoginFailedAuthLimits({ clientIp: ip, email });
    assert.equal(peek.limited, false);
  });

  it("different users on same IP are not blocked by one user's failures", async () => {
    const emailB = "user-b@example.com";
    await resetLoginLimitersForIp(ip, emailB);

    for (let i = 0; i < 5; i += 1) {
      await recordLoginFailedAuthAttempt({ clientIp: ip, email });
    }

    const blockedA = await peekLoginFailedAuthLimits({ clientIp: ip, email });
    const allowedB = await peekLoginFailedAuthLimits({ clientIp: ip, email: emailB });

    assert.equal(blockedA.limited, true);
    assert.equal(allowedB.limited, false);

    await resetLoginLimitersForIp(ip, emailB);
  });
});

describe("account-wide distributed protection", () => {
  it("limits same account from multiple IPs", async () => {
    const email = "target@example.com";

    for (let i = 0; i < 20; i += 1) {
      const ip = `10.1.${Math.floor(i / 256)}.${i % 256}`;
      await resetLoginPairLimitersForIp(ip, email);
      await recordLoginFailedAuthAttempt({ clientIp: ip, email });
    }

    const blocked = await peekLoginFailedAuthLimits({
      clientIp: "10.0.0.99",
      email,
    });

    assert.equal(blocked.limited, true);
    assert.equal(blocked.layer, "failed_auth_account");
  });
});

describe("login UI hardening signals", () => {
  it("login page disables duplicate submit while loading", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const page = readFileSync(join(process.cwd(), "app/(app)/login/page.js"), "utf8");

    assert.match(page, /if \(loading\) return/);
    assert.match(page, /AUTH_RATE_LIMITED/);
    assert.match(page, /retryAfterSeconds/);
  });

  it("login route does not count 401 as flood-only bypass", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const route = readFileSync(
      join(process.cwd(), "app/api/auth/login/route.js"),
      "utf8"
    );

    assert.match(route, /recordLoginFailedAuthAttempt/);
    assert.match(route, /resetLoginFailedAuthCounters/);
    assert.doesNotMatch(route, /loginIpLimiter/);
  });
});

describe("concurrency — failed attempts remain atomic in memory mode", () => {
  it("parallel failures increment safely", async () => {
    const ip = "10.99.1.1";
    const email = "concurrent@example.com";
    await resetLoginLimitersForIp(ip, email);

    await Promise.all(
      Array.from({ length: 12 }, () =>
        recordLoginFailedAuthAttempt({ clientIp: ip, email })
      )
    );

    const blocked = await peekLoginFailedAuthLimits({ clientIp: ip, email });
    assert.equal(blocked.limited, true);
  });
});

console.log("Auth login rate-limit tests loaded");
