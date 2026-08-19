import {
  peekLoginFailedAuthLimits,
  LOGIN_FAILED_AUTH_CHALLENGE_COUNT,
} from "../auth-login-rate-limit.js";
import { hashDeviceSignal } from "./security-signal-hash.js";
import { isTurnstileLoginAdaptiveEnabled } from "./feature-flags.js";

export const LOGIN_RISK_CODES = Object.freeze({
  LOW: "LOW",
  CHALLENGE: "CHALLENGE",
});

export async function evaluateLoginPreAuthRisk(request, { email, clientIp, deviceToken = null }) {
  if (!isTurnstileLoginAdaptiveEnabled()) {
    return { risk: LOGIN_RISK_CODES.LOW, reasons: [], count: 0, limit: 0, remaining: 0, limited: false };
  }

  const failedAuthCheck = await peekLoginFailedAuthLimits({ clientIp, email });
  const reasons = [];
  let score = 0;

  if (failedAuthCheck.limited) {
    score += 50;
    reasons.push("failed_auth_rate_limit");
  } else if (failedAuthCheck.count >= LOGIN_FAILED_AUTH_CHALLENGE_COUNT) {
    score += 25;
    reasons.push("failed_auth_challenge_threshold");
  }

  if (String(clientIp || "unknown") === "unknown") {
    score += 10;
    reasons.push("missing_client_ip");
  }

  const deviceHash = deviceToken ? hashDeviceSignal(deviceToken) : null;
  if (!deviceHash) {
    score += 5;
    reasons.push("missing_device_token");
  }

  const risk = score >= 20 ? LOGIN_RISK_CODES.CHALLENGE : LOGIN_RISK_CODES.LOW;

  return {
    risk,
    score,
    reasons,
    deviceHash,
    count: failedAuthCheck.count,
    limit: failedAuthCheck.limit,
    remaining: failedAuthCheck.remaining,
    limited: failedAuthCheck.limited,
  };
}
