import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  partnerWithdrawIpLimiter,
  partnerWithdrawUserLimiter,
} from "../lib/rate-limit.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("SEC-003 partner withdraw distributed limiters", () => {
  it("exports redis-backed partner withdraw limiters", () => {
    assert.equal(typeof partnerWithdrawUserLimiter, "function");
    assert.equal(typeof partnerWithdrawIpLimiter, "function");
  });

  it("withdraw route uses distributed enforcement helper", () => {
    const source = readFileSync(
      path.join(root, "app/api/partner/withdraw/route.js"),
      "utf8"
    );
    assert.match(source, /enforcePartnerWithdrawRateLimits/);
    assert.doesNotMatch(source, /checkPartnerRateLimit\(/);
  });

  it("partner helper applies user and ip limiters", () => {
    const source = readFileSync(path.join(root, "lib/partner-security.js"), "utf8");
    assert.match(source, /partnerWithdrawIpLimiter/);
    assert.match(source, /partnerWithdrawUserLimiter/);
  });
});

console.log("security rate limits pass2 tests loaded");
