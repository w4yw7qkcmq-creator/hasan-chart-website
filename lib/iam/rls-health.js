/**
 * Resolve RLS readiness mode from flags + optional DB snapshot.
 * @param {object} params
 * @param {object} params.flags IAM feature flags
 * @param {object} [params.dbSnapshot] optional { policiesWithoutRls, mixedDualEnforce, missingOwnPolicy }
 */
export function resolveRlsMode({ flags = {}, dbSnapshot = null } = {}) {
  if (!flags.IAM_DB) return "disabled";

  const snap = dbSnapshot || {};
  if (snap.mixedDualEnforce) return "mixed_unsafe";
  if (snap.policiesWithoutRls?.length > 0) return "dual_policies_dormant";
  if (flags.IAM_RLS) return "enforcing";
  if (snap.rlsEnabled && snap.enforcePoliciesPresent && !snap.dualPoliciesPresent) {
    return "enforce_ready";
  }
  if (snap.rlsEnabled && snap.dualPoliciesPresent) return "dual_enforcing";
  if (flags.IAM_DB && snap.enforcePoliciesPresent && !flags.IAM_RLS) return "enforce_ready";
  return flags.IAM_API ? "dual_ready" : "foundation_ready";
}

export function buildRlsHealthDetails(dbSnapshot = null) {
  const snap = dbSnapshot || {};
  const issues = [];

  if (snap.policiesWithoutRls?.length) {
    issues.push({
      code: "rls_dormant",
      severity: "critical",
      tables: snap.policiesWithoutRls,
      message: "Policies exist but RLS is disabled",
    });
  }
  if (snap.mixedDualEnforce) {
    issues.push({
      code: "mixed_dual_enforce",
      severity: "critical",
      message: "Dual and enforce policies coexist",
    });
  }
  if (snap.missingOwnPolicy?.length) {
    issues.push({
      code: "missing_own_policy",
      severity: "critical",
      tables: snap.missingOwnPolicy,
    });
  }
  if (snap.rollbackValidated === false) {
    issues.push({
      code: "rollback_unverified",
      severity: "warning",
      message: "Rollback drill not validated on Staging",
    });
  }

  return {
    issues,
    issueCount: issues.length,
    criticalCount: issues.filter((i) => i.severity === "critical").length,
  };
}
