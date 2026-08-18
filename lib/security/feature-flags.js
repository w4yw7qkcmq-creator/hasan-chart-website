import { STAGING_SUPABASE_PROJECT_REF, extractSupabaseProjectRef } from "../staging-env-guard.js";

function isStagingRuntime() {
  const urlRef = extractSupabaseProjectRef(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  if (urlRef === STAGING_SUPABASE_PROJECT_REF) return true;
  return String(process.env.HC_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT || "")
    .trim()
    .toLowerCase() === "staging";
}

function readFlag(name, defaultOnStaging = true) {
  const raw = process.env[name];
  if (raw === "0" || raw === "false") return false;
  if (raw === "1" || raw === "true") return true;
  return defaultOnStaging && isStagingRuntime();
}

export function isHumanVerificationEnabled() {
  return readFlag("HUMAN_VERIFICATION_ENABLED", true);
}

export function isPartnerAntiAbuseGateEnabled() {
  return readFlag("PARTNER_ANTI_ABUSE_GATE_ENABLED", true);
}

export function isTurnstileLoginAdaptiveEnabled() {
  return readFlag("TURNSTILE_LOGIN_ADAPTIVE_ENABLED", true);
}

export function requireAntiAbuseGateForFinancial() {
  if (!isPartnerAntiAbuseGateEnabled()) {
    return { ok: false, reason: "anti_abuse_gate_disabled_fail_closed" };
  }
  return { ok: true };
}
