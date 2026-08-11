/**
 * Admin dashboard rate-limit policy tests (memory mode).
 * Run: node --test scripts/test-admin-rate-limit.js
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

process.env.UPSTASH_REDIS_REST_URL = "";
process.env.UPSTASH_REDIS_REST_TOKEN = "";

const {
  guardAdminApiRateLimit,
  adminRateLimitDeniedResult,
  ADMIN_RATE_LIMITED_CODE,
  ADMIN_RATE_LIMIT_MESSAGE_AR,
  adminReadLimiter,
} = await import("../lib/admin-rate-limit.js");

function mockRequest(pathname, method = "GET") {
  return new Request(`https://example.com${pathname}`, {
    method,
    headers: { "x-real-ip": "203.0.113.10" },
  });
}

function mockSession(email = "admin@test.local", id = "user-1") {
  return { ok: true, user: { id, email } };
}

describe("admin rate limit policy", () => {
  beforeEach(async () => {
    await adminReadLimiter.reset("user:admin@test.local");
    await adminReadLimiter.reset("user:user-1");
  });

  it("allows normal read volume for authenticated admin user", async () => {
    const request = mockRequest("/api/admin/dashboard?section=stats");
    for (let i = 0; i < 12; i += 1) {
      const result = await guardAdminApiRateLimit(request, mockSession());
      assert.equal(result.success, true, `request ${i + 1} should pass`);
    }
  });

  it("returns Arabic ADMIN_RATE_LIMITED contract", async () => {
    const denied = adminRateLimitDeniedResult({
      success: false,
      resetTime: Date.now() + 30_000,
      kind: "read",
      layer: "read",
    });
    assert.equal(denied.status, 429);
    assert.equal(denied.code, ADMIN_RATE_LIMITED_CODE);
    assert.match(denied.error, /تم إرسال عدد كبير/);
    assert.equal(denied.error, ADMIN_RATE_LIMIT_MESSAGE_AR);
    assert.ok(denied.retryAfterSeconds >= 1);
  });

  it("classifies sensitive partner commission writes", async () => {
    const { classifyAdminRequestKind } = await import("../lib/admin-rate-limit.js");
    assert.equal(
      classifyAdminRequestKind(mockRequest("/api/admin/partner-marketing/service-commissions", "PUT")),
      "sensitive"
    );
  });
});

console.log("Admin rate-limit tests loaded");
