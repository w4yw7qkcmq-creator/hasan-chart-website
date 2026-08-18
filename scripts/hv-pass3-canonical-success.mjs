/**
 * Machine-readable Pass3 success contract for canonical orchestration.
 * Mirrors Pass3 final gate logic — display verdict string is not authoritative.
 */

function manifestResult(report, id) {
  return report?.manifest?.scenarios?.find((s) => s.id === id)?.result;
}

export function evaluatePass3StructuredGates(report) {
  if (!report || typeof report !== "object") {
    return { ok: false, reason: "missing_report", checks: {} };
  }

  const errors = report.errors || [];
  const criticalInfra = errors.filter((e) => e.infra || e.fatal);
  const iamErrors = errors.filter((e) =>
    /iam_|rls_|security_definer|SD-|RLS-/i.test(String(e.section || e.id || ""))
  );
  const regressionFails = Object.values(report.regression || {}).filter((r) => !r.pass).length;
  const scenarios = report.manifest?.scenarios || [];
  const alPass = scenarios.filter((s) => s.id.startsWith("AL-") && s.result === "PASS").length;
  const diPass = scenarios.filter((s) => s.id.startsWith("DI-") && s.result === "PASS").length;
  const liveCount = report.manifest?.counts?.total || 0;
  const reconciliationExact =
    report.financialReconciliation?.reconciliationExact === true ||
    manifestResult(report, "RC-01") === "PASS";
  const cl01Pass = manifestResult(report, "CL-01") === "PASS";

  const checks = {
    not_blocked: report.verdict !== "BLOCKED",
    no_critical_infra: criticalInfra.length === 0,
    no_iam_errors: iamErrors.length === 0,
    no_regression_fails: regressionFails === 0,
    fraud_api_ok: report.fraudReviewApi?.admin?.status === 200,
    browser_ok: report.browser?.pass === true,
    hmac_ok: Boolean(report.hmacSecret?.localConfigured && report.hmacSecret?.stableAcrossProcess),
    reconciliation_exact: reconciliationExact,
    cl01_pass: cl01Pass,
    build_pass: report.build?.pass === true,
    live_count_ok: liveCount >= 110,
    al_pass: alPass === 12,
    di_pass: diPass === 10,
    production_audit_ok: report.productionReadOnlyAudit?.completed === true,
    no_unexpected_429: (report.unexpected429 || 0) === 0,
    no_unexpected_5xx: (report.unexpected5xx || 0) === 0,
    errors_zero: errors.length === 0,
  };

  const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  return {
    ok: failed.length === 0,
    checks,
    failed,
    reason: failed[0] || null,
  };
}

export function isPass3Successful(report, processStatus) {
  if (processStatus !== 0) {
    return {
      ok: false,
      reason: "process_exit_nonzero",
      processStatus,
      gates: evaluatePass3StructuredGates(report),
    };
  }
  const gates = evaluatePass3StructuredGates(report);
  return {
    ok: gates.ok,
    reason: gates.ok ? null : gates.reason,
    processStatus,
    gates,
  };
}
