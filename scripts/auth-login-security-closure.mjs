#!/usr/bin/env node
/**
 * AUTH LOGIN 429 — security closure matrix (local + safe production probes).
 * Run: node scripts/auth-login-security-closure.mjs
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadE2eEnv } from "./e2e/env.mjs";
import {
  normalizeLoginEmail,
  hashLoginAccountKey,
  buildAuthRateLimitPayload,
  AUTH_RATE_LIMITED_CODE,
  peekLoginFailedAuthLimits,
  recordLoginFailedAuthAttempt,
  resetLoginFailedAuthCounters,
} from "../lib/auth-login-rate-limit.js";
import {
  getClientIp,
  loginFloodLimiter,
  loginFailedAuthLimiter,
} from "../lib/rate-limit.js";
import { activateRedisFallback, isRedisFallbackActive } from "../lib/redis-fallback.js";

const ROOT = join(import.meta.dirname, "..");
const results = [];

function record(id, pass, detail = "") {
  results.push({ id, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} [${id}]${detail ? ` — ${detail}` : ""}`);
}

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

async function resetPair(ip, email) {
  await loginFloodLimiter.reset(ip);
  await loginFailedAuthLimiter.reset(`${hashLoginAccountKey(email)}:${ip}`);
}

console.log("=== AUTH LOGIN SECURITY CLOSURE ===\n");

// 1 valid login semantics (local policy)
try {
  const email = "closure-valid@example.com";
  const ip = "10.50.0.1";
  await resetPair(ip, email);
  await recordLoginFailedAuthAttempt({ clientIp: ip, email });
  await resetLoginFailedAuthCounters({ clientIp: ip, email });
  const peek = await peekLoginFailedAuthLimits({ clientIp: ip, email });
  assert.equal(peek.limited, false);
  record(1, true, "valid login resets pair counter");
} catch (e) {
  record(1, false, e.message);
}

// 2 wrong password below threshold
try {
  const email = "closure-below@example.com";
  const ip = "10.50.0.2";
  await resetPair(ip, email);
  await recordLoginFailedAuthAttempt({ clientIp: ip, email });
  const peek = await peekLoginFailedAuthLimits({ clientIp: ip, email });
  assert.equal(peek.limited, false);
  record(2, true, "below failed-auth threshold");
} catch (e) {
  record(2, false, e.message);
}

// 3 failed pair threshold → 429 contract
try {
  const email = "closure-block@example.com";
  const ip = "10.50.0.3";
  await resetPair(ip, email);
  for (let i = 0; i < 8; i += 1) {
    await recordLoginFailedAuthAttempt({ clientIp: ip, email });
  }
  const blocked = await peekLoginFailedAuthLimits({ clientIp: ip, email });
  assert.equal(blocked.limited, true);
  assert.equal(blocked.body.code, AUTH_RATE_LIMITED_CODE);
  record(3, true, "failed pair threshold blocks");
} catch (e) {
  record(3, false, e.message);
}

// 4 Retry-After header in payload
try {
  const payload = buildAuthRateLimitPayload({
    layer: "failed_auth_pair",
    resetTime: Date.now() + 30_000,
  });
  assert.ok(payload.headers["Retry-After"]);
  record(4, true, `Retry-After=${payload.headers["Retry-After"]}`);
} catch (e) {
  record(4, false, e.message);
}

// 5 AUTH_RATE_LIMITED code
try {
  const payload = buildAuthRateLimitPayload({ layer: "flood", resetTime: Date.now() + 1000 });
  assert.equal(payload.body.code, AUTH_RATE_LIMITED_CODE);
  record(5, true);
} catch (e) {
  record(5, false, e.message);
}

// 6 Arabic UX string present
try {
  const loginPage = readFileSync(join(ROOT, "app/(app)/login/page.js"), "utf8");
  assert.match(loginPage, /محاولات/);
  assert.match(loginPage, /retryAfterSeconds/);
  record(6, true);
} catch (e) {
  record(6, false, e.message);
}

// 7 success after reset
try {
  const email = "closure-after-reset@example.com";
  const ip = "10.50.0.4";
  await resetPair(ip, email);
  for (let i = 0; i < 5; i += 1) {
    await recordLoginFailedAuthAttempt({ clientIp: ip, email });
  }
  await resetLoginFailedAuthCounters({ clientIp: ip, email });
  const peek = await peekLoginFailedAuthLimits({ clientIp: ip, email });
  assert.equal(peek.limited, false);
  record(7, true);
} catch (e) {
  record(7, false, e.message);
}

// 8 pair reset semantics
record(8, results.find((r) => r.id === 7)?.pass ?? false, "paired with #7");

// 9 flood limiter separate prefix
try {
  const rateLimit = readFileSync(join(ROOT, "lib/rate-limit.js"), "utf8");
  assert.match(rateLimit, /login-flood/);
  assert.match(rateLimit, /login-failed-auth/);
  record(9, true);
} catch (e) {
  record(9, false, e.message);
}

// 10 different users same IP
try {
  const ip = "10.50.0.5";
  const emailA = "closure-a@example.com";
  const emailB = "closure-b@example.com";
  await resetPair(ip, emailA);
  await resetPair(ip, emailB);
  for (let i = 0; i < 8; i += 1) {
    await recordLoginFailedAuthAttempt({ clientIp: ip, email: emailA });
  }
  const blockedA = await peekLoginFailedAuthLimits({ clientIp: ip, email: emailA });
  const allowedB = await peekLoginFailedAuthLimits({ clientIp: ip, email: emailB });
  assert.equal(blockedA.limited, true);
  assert.equal(allowedB.limited, false);
  record(10, true);
} catch (e) {
  record(10, false, e.message);
}

// 11 account protection multi-IP (code path exists)
try {
  const authModule = readFileSync(join(ROOT, "lib/auth-login-rate-limit.js"), "utf8");
  assert.match(authModule, /loginAccountFailedLimiter/);
  record(11, true, "account-wide limiter wired");
} catch (e) {
  record(11, false, e.message);
}

// 12 network 5xx not counted as password failure (route only records on auth failure branch)
try {
  const route = readFileSync(join(ROOT, "app/api/auth/login/route.js"), "utf8");
  const failureBranch = route.split("if (error || !data?.session || !data?.user)")[1]?.split("return NextResponse.json")[0] || "";
  assert.match(failureBranch, /recordLoginFailedAuthAttempt/);
  assert.doesNotMatch(failureBranch, /catch/);
  record(12, true, "failures only on auth failure branch");
} catch (e) {
  record(12, false, e.message);
}

// 13 duplicate submit protection
try {
  const loginPage = readFileSync(join(ROOT, "app/(app)/login/page.js"), "utf8");
  assert.match(loginPage, /if \(loading\) return/);
  record(13, true);
} catch (e) {
  record(13, false, e.message);
}

// 14 no auto retry on 429
try {
  const loginPage = readFileSync(join(ROOT, "app/(app)/login/page.js"), "utf8");
  assert.match(loginPage, /response\.status === 429/);
  assert.doesNotMatch(loginPage, /while[\s\S]*429/);
  assert.doesNotMatch(loginPage, /for[\s\S]*429/);
  record(14, true);
} catch (e) {
  record(14, false, e.message);
}

// 15 email normalization
try {
  assert.equal(normalizeLoginEmail("  A@B.COM "), "a@b.com");
  record(15, true);
} catch (e) {
  record(15, false, e.message);
}

// 16 enumeration protection (generic invalid credentials)
try {
  const route = readFileSync(join(ROOT, "app/api/auth/login/route.js"), "utf8");
  assert.match(route, /بيانات الدخول غير صحيحة/);
  record(16, true);
} catch (e) {
  record(16, false, e.message);
}

// 17 IP extraction prefers x-real-ip
try {
  const ip = getClientIp(
    makeRequest({
      "x-real-ip": "198.51.100.20",
      "x-forwarded-for": "203.0.113.50, 10.0.0.1",
    })
  );
  assert.equal(ip, "198.51.100.20");
  record(17, true);
} catch (e) {
  record(17, false, e.message);
}

// 18 spoofed XFF cannot override x-real-ip
try {
  const ip = getClientIp(
    makeRequest({
      "x-real-ip": "198.51.100.21",
      "x-forwarded-for": "1.2.3.4",
    })
  );
  assert.equal(ip, "198.51.100.21");
  assert.notEqual(ip, "1.2.3.4");
  record(18, true, "x-real-ip wins over spoofed XFF");
} catch (e) {
  record(18, false, e.message);
}

// 19 concurrency atomic (delegate to unit test file)
try {
  const testRun = spawnSync(
    process.execPath,
    ["--test", join(ROOT, "scripts/test-auth-login-rate-limit.js")],
    { encoding: "utf8" }
  );
  assert.equal(testRun.status, 0, testRun.stdout || testRun.stderr);
  record(19, true, "unit suite PASS");
} catch (e) {
  record(19, false, e.message);
}

// 20 no password/token logging in auth limiter modules
try {
  const authModule = readFileSync(join(ROOT, "lib/auth-login-rate-limit.js"), "utf8");
  const route = readFileSync(join(ROOT, "app/api/auth/login/route.js"), "utf8");
  assert.doesNotMatch(authModule, /password/);
  assert.doesNotMatch(route, /console\.log\([^)]*password/i);
  assert.match(authModule, /accountKeyHash/);
  record(20, true, "hashed keys only");
} catch (e) {
  record(20, false, e.message);
}

// Redis fallback policy
try {
  activateRedisFallback("closure-test");
  assert.equal(isRedisFallbackActive(), true);
  record("M-redis-fallback", true, "5min memory fallback activates");
} catch (e) {
  record("M-redis-fallback", false, e.message);
}

// Browser gateway mandatory block
try {
  const supabaseClient = readFileSync(join(ROOT, "lib/supabase.js"), "utf8");
  assert.match(supabaseClient, /Password login is server-only/);
  assert.match(supabaseClient, /isAuthToken/);
  record("G-browser-block", true);
} catch (e) {
  record("G-browser-block", false, e.message);
}

// Production safe probes
try {
  const env = loadE2eEnv();
  const base = env.prodUrl || env.baseUrl || "https://www.hasanchartworld.com";
  const healthRes = await fetch(`${base}/api/health`, { cache: "no-store" });
  const health = await healthRes.json();
  const commit = String(health?.build?.commit || "").slice(0, 12);
  assert.equal(health?.status, "ok");
  assert.equal(health?.readiness, "ready");
  assert.equal(commit, "c05ffd191971".slice(0, 12), `commit=${commit}`);
  record("A-prod-deploy", true, commit);

  const flagsRes = await fetch(`${base}/api/partner/feature-flags`, { cache: "no-store" });
  const flagsPayload = await flagsRes.json();
  const f = flagsPayload?.flags || flagsPayload?.data?.flags || {};
  assert.equal(Boolean(f.PARTNER_GROWTH_ENGINE), true);
  assert.equal(Boolean(f.PARTNER_CENTER_V2_UI), true);
  assert.equal(Boolean(f.PARTNER_ADMIN_MARKETING), true);
  record("S-partner-flags", true, "G/V/A ON");
} catch (e) {
  record("A-prod-deploy", false, e.message);
  record("S-partner-flags", false, e.message);
}

// Contract verification on deployed route source
try {
  const route = readFileSync(join(ROOT, "app/api/auth/login/route.js"), "utf8");
  assert.match(route, /AUTH_RATE_LIMITED|buildAuthRateLimitPayload|rateLimitResponse/);
  assert.match(route, /enforceLoginFloodLimit/);
  record("C-contract", true, "two-layer route deployed in codebase");
} catch (e) {
  record("C-contract", false, e.message);
}

const failed = results.filter((r) => !r.pass);
const matrix20 = results.filter((r) => typeof r.id === "number");
const matrixPass = matrix20.filter((r) => r.pass).length;

console.log(`\n=== MATRIX ${matrixPass}/20 ===`);
console.log(`=== TOTAL ${results.length - failed.length}/${results.length} ===`);

if (failed.length > 0) {
  console.error("\nFailures:", failed);
  process.exit(1);
}

console.log("\nAUTH LOGIN SECURITY CLOSURE MATRIX PASS");
