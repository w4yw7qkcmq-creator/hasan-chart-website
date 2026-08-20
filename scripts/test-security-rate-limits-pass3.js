import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  partnerCaptureRefIpLimiter,
  partnerTrackVisitIpLimiter,
  publicNewsIpLimiter,
  vipSignalsUserLimiter,
} from "../lib/rate-limit.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("SEC-008/009 public endpoint rate limits", () => {
  it("exports partner referral and news limiters", () => {
    assert.equal(typeof partnerCaptureRefIpLimiter, "function");
    assert.equal(typeof partnerTrackVisitIpLimiter, "function");
    assert.equal(typeof publicNewsIpLimiter, "function");
    assert.equal(typeof vipSignalsUserLimiter, "function");
  });

  it("capture-ref route enforces ip limiter before writes", () => {
    const source = readFileSync(
      path.join(root, "app/api/partner/capture-ref/route.js"),
      "utf8"
    );
    assert.match(source, /enforcePartnerReferralRateLimits/);
    assert.match(source, /partnerCaptureRefIpLimiter/);
    const postIdx = source.indexOf("export async function POST");
    const handler = source.slice(postIdx);
    const rateIdx = handler.indexOf("enforcePartnerReferralRateLimits");
    const writeIdx = handler.indexOf("capturePartnerReferral(");
    assert.ok(rateIdx > -1 && writeIdx > rateIdx);
  });

  it("track-visit route enforces ip limiter before writes", () => {
    const source = readFileSync(
      path.join(root, "app/api/partner/track-visit/route.js"),
      "utf8"
    );
    assert.match(source, /partnerTrackVisitIpLimiter/);
  });

  it("news GET applies generous public ip limiter", () => {
    const source = readFileSync(path.join(root, "app/api/news/route.js"), "utf8");
    assert.match(source, /publicNewsIpLimiter/);
  });

  it("vip-signals applies authenticated user limiter", () => {
    const source = readFileSync(path.join(root, "app/api/vip-signals/route.js"), "utf8");
    assert.match(source, /vipSignalsUserLimiter/);
    const getIdx = source.indexOf("export async function GET");
    const handler = source.slice(getIdx);
    const authIdx = handler.indexOf("getAuthenticatedUser()");
    const limitIdx = handler.indexOf("vipSignalsUserLimiter");
    assert.ok(authIdx > -1 && limitIdx > authIdx);
  });

  it("health detail requires admin or cron auth", () => {
    const source = readFileSync(path.join(root, "app/api/health/route.js"), "utf8");
    assert.match(source, /verifyAdminOrCronSecret/);
    const getIdx = source.indexOf("export async function GET");
    const handler = source.slice(getIdx);
    const detailIdx = handler.indexOf('get("detail")');
    const authIdx = handler.indexOf("verifyAdminOrCronSecret");
    assert.ok(detailIdx > -1 && authIdx > detailIdx);
  });
});

console.log("security rate limits pass3 tests loaded");
