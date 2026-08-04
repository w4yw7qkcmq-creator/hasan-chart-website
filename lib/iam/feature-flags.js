/**
 * IAM feature flags — independent toggles per layer.
 * Default: all off (legacy auth only). Enable progressively per environment.
 */

function readFlag(name) {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function isIamDbEnabled() {
  return readFlag("IAM_DB");
}

export function isIamApiEnabled() {
  return readFlag("IAM_API");
}

export function isIamUiEnabled() {
  return readFlag("IAM_UI");
}

export function isIamRlsEnabled() {
  return readFlag("IAM_RLS");
}

/** Dual-read: IAM + legacy both consulted; IAM wins on conflict. */
export function isIamDualReadEnabled() {
  return isIamApiEnabled() || isIamDbEnabled();
}

export function getIamFeatureFlags() {
  return {
    IAM_DB: isIamDbEnabled(),
    IAM_API: isIamApiEnabled(),
    IAM_UI: isIamUiEnabled(),
    IAM_RLS: isIamRlsEnabled(),
    dualRead: isIamDualReadEnabled(),
  };
}

export function validateIamFlagCombination(flags = getIamFeatureFlags()) {
  const issues = [];

  if (flags.IAM_API && !flags.IAM_DB) {
    issues.push("IAM_API=true requires IAM_DB=true");
  }
  if (flags.IAM_UI && !flags.IAM_DB) {
    issues.push("IAM_UI=true requires IAM_DB=true");
  }
  if (flags.IAM_RLS && (!flags.IAM_DB || !flags.IAM_API)) {
    issues.push("IAM_RLS=true requires IAM_DB=true and IAM_API=true");
  }

  return {
    ok: issues.length === 0,
    issues,
    flags,
    misconfigured: issues.length > 0,
  };
}

export function getIamHealthStatus(flags = getIamFeatureFlags(), context = {}) {
  const validation = validateIamFlagCombination(flags);
  const rlsMode = context.rlsMode;

  if (!flags.IAM_DB && !flags.IAM_API && !flags.IAM_UI && !flags.IAM_RLS) {
    return validation.misconfigured ? "misconfigured" : "disabled";
  }
  if (validation.misconfigured) return "misconfigured";
  if (rlsMode === "mixed_unsafe" || rlsMode === "dual_policies_dormant") return "degraded";
  if (flags.IAM_RLS || rlsMode === "enforcing") return "enforcing";
  if (rlsMode === "enforce_ready") return "ready_for_staging_rls";
  if (flags.IAM_API) return "ready_for_staging";
  if (flags.IAM_DB) return "foundation_ready";
  return "degraded";
}

export function assertIamFlagsSafeForRuntime() {
  const validation = validateIamFlagCombination();
  if (!validation.ok && process.env.NODE_ENV === "production") {
    console.warn("[IAM] Misconfigured feature flags:", validation.issues.join("; "));
  }
  return validation;
}

assertIamFlagsSafeForRuntime();
