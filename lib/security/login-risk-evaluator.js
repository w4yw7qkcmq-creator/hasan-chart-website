import { peekLoginFailedAuthLimits } from "../auth-login-rate-limit.js";
import { hashDeviceSignal } from "./security-signal-hash.js";
import { isTurnstileLoginAdaptiveEnabled } from "./feature-flags.js";

export const LOGIN_RISK_CODES = Object.freeze({
  LOW: "LOW",
  CHALLENGE: "CHALLENGE",
});

export async function evaluateLoginPreAuthRisk(request, { email, clientIp, deviceToken = null }) {
  if (!isTurnstileLoginAdaptiveEnabled()) {
    return { risk: LOGIN_RISK_CODES.LOW, reasons: [] };
  }

  const reasons = [];
  let score = 0;

  const failedAuthCheck = await peekLoginFailedAuthLimits({ clientIp, email });
  if (failedAuthCheck.limited) {
    score += 50;
    reasons.push("failed_auth_rate_limit");
  } else if (failedAuthCheck.remaining != null && failedAuthCheck.remaining <= 1) {
    score += 25;
    reasons.push("failed_auth_approaching");
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
  return { risk, score, reasons, deviceHash };
}
