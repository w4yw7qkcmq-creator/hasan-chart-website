import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  partnerWithdrawIpLimiter,
  partnerWithdrawUserLimiter,
  instantAnalysisIpLimiter,
  instantAnalysisUserLimiter,
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

describe("SEC-004 instant analysis abuse protection", () => {
  it("exports redis-backed instant analysis limiters", () => {
    assert.equal(typeof instantAnalysisUserLimiter, "function");
    assert.equal(typeof instantAnalysisIpLimiter, "function");
  });

  it("instant analysis POST checks limits before reservation", () => {
    const source = readFileSync(
      path.join(root, "app/api/instant-analysis/route.js"),
      "utf8"
    );
    const handlerStart = source.indexOf("handler: async (req) =>");
    assert.ok(handlerStart > -1, "handler block missing");
    const handlerSource = source.slice(handlerStart);
    const rateIdx = handlerSource.indexOf("instantAnalysisUserLimiter");
    const reserveIdx = handlerSource.indexOf("reserveInstantAnalysisRequest");
    const forwardIdx = handlerSource.indexOf("forwardInstantAnalysisRequest");
    assert.ok(rateIdx > -1, "user limiter missing");
    assert.ok(reserveIdx > -1, "reservation call missing");
    assert.ok(rateIdx < reserveIdx, "rate limit must run before reservation");
    assert.ok(rateIdx < forwardIdx, "rate limit must run before worker forward");
    assert.match(handlerSource, /instantAnalysisIpLimiter/);
    assert.match(handlerSource, /INSTANT_ANALYSIS_RATE_LIMITED/);
  });
});

console.log("security rate limits pass2 tests loaded");
