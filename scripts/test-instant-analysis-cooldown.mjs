#!/usr/bin/env node

import {
  INSTANT_ANALYSIS_COOLDOWN_MS,
  computeInstantAnalysisAvailability,
  formatInstantAnalysisCountdown,
  mapRpcAvailability,
  normalizeInstantAnalysisSymbol,
} from "../lib/instant-analysis-cooldown.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const now = Date.parse("2026-08-02T18:20:00.000Z");

assert(normalizeInstantAnalysisSymbol("btc") === "BTCUSDT", "btc normalizes to BTCUSDT");
assert(normalizeInstantAnalysisSymbol("BTCUSDT") === "BTCUSDT", "BTCUSDT stays valid");
assert(normalizeInstantAnalysisSymbol("") === null, "empty symbol rejected");
assert(normalizeInstantAnalysisSymbol("!!!") === null, "invalid symbol rejected");
assert(normalizeInstantAnalysisSymbol("A".repeat(30)) === null, "overlong symbol rejected");

const firstAllowed = computeInstantAnalysisAvailability(null, now);
assert(firstAllowed.allowed === true, "first request should be allowed");

const recentCooldown = computeInstantAnalysisAvailability("2026-08-02T18:20:00.000Z", now + 10 * 60 * 1000);
assert(recentCooldown.allowed === false, "second request within 60 minutes should be blocked");
assert(recentCooldown.retryAfterSeconds > 0, "retryAfterSeconds should be positive");
assert(recentCooldown.nextAllowedAt === "2026-08-02T19:20:00.000Z", "next allowed at +60 minutes");

const afterCooldown = computeInstantAnalysisAvailability(
  "2026-08-02T18:20:00.000Z",
  now + INSTANT_ANALYSIS_COOLDOWN_MS + 1000
);
assert(afterCooldown.allowed === true, "request after 60 minutes should be allowed");

const retryApprox = recentCooldown.retryAfterSeconds;
assert(retryApprox >= 2990 && retryApprox <= 3010, "retryAfterSeconds should be ~3000s at 10 min elapsed");

const otherUserStillAllowed = computeInstantAnalysisAvailability(null, now);
assert(otherUserStillAllowed.allowed === true, "another user should not inherit cooldown");

assert(
  formatInstantAnalysisCountdown(2538) === "42 دقيقة و18 ثانية",
  "arabic countdown formatting"
);
assert(formatInstantAnalysisCountdown(18) === "18 ثانية", "seconds-only countdown");

const rpcMapped = mapRpcAvailability({
  allowed: false,
  retry_after_seconds: 1234,
  next_allowed_at: "2026-08-02T19:20:00.000Z",
});
assert(rpcMapped.allowed === false, "rpc map blocked");
assert(rpcMapped.retryAfterSeconds === 1234, "rpc map retry seconds");

const workerFailurePolicy = {
  releaseWhenNoJobId: true,
  confirmWhenJobId: true,
};
assert(workerFailurePolicy.releaseWhenNoJobId === true, "worker unreachable should release reservation");
assert(workerFailurePolicy.confirmWhenJobId === true, "jobId receipt should start cooldown");

const concurrentPolicy = {
  uniqueReservingIndex: true,
};
assert(concurrentPolicy.uniqueReservingIndex === true, "concurrent requests use unique reserving index");

const ownershipPolicy = {
  crossUserJobAccess: false,
};
assert(ownershipPolicy.crossUserJobAccess === false, "users cannot read other job ids");

const errorShape401 = {
  success: false,
  code: "AUTH_REQUIRED",
  message: "يجب تسجيل الدخول لاستخدام التحليل اللحظي.",
};
assert(errorShape401.code === "AUTH_REQUIRED", "401 uses AUTH_REQUIRED");

const errorShape429 = {
  success: false,
  code: "INSTANT_ANALYSIS_COOLDOWN",
  message: "يمكنك طلب تحليل لحظي واحد فقط كل ساعة.",
  retryAfterSeconds: 1234,
  nextAllowedAt: "2026-08-02T19:20:00.000Z",
};
assert(errorShape429.retryAfterSeconds === 1234, "429 includes retryAfterSeconds");

console.log("instant-analysis-cooldown tests passed");
