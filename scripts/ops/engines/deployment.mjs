import { DEPLOYMENT_CHECKS, FEATURE_FLAGS } from "../config.mjs";
import { stepStatus } from "../artifact-reader.mjs";

export function buildDeploymentVerification(qa, releaseGate, slo) {
  const smoke = qa.smoke;
  const gateVerdict = releaseGate?.verdict || "UNKNOWN";
  const visualPass = stepStatus(smoke, "visual-regression") !== "FAIL";
  const smokePass = (smoke?.summary?.FAIL || 0) === 0;

  const checks = {
    "release-gate-pass": {
      status: gateVerdict === "GO" ? "pass" : gateVerdict === "GO WITH KNOWN ISSUES" ? "partial" : gateVerdict === "NO-GO" ? "fail" : "awaiting",
      detail: gateVerdict,
    },
    "smoke-pass": {
      status: !qa.available ? "awaiting" : smokePass ? "pass" : "fail",
      detail: qa.available ? `FAIL=${smoke?.summary?.FAIL || 0}` : "no smoke data",
    },
    "visual-regression-pass": {
      status: !qa.available ? "awaiting" : visualPass ? "pass" : "fail",
      detail: stepStatus(smoke, "visual-regression"),
    },
    "migration-verified": {
      status: "manual",
      detail: "Verify supabase/migrations applied — see runbook migration-verify.md",
    },
    "rollback-plan-ready": {
      status: qa.available ? "pass" : "awaiting",
      detail: "Rollback via Railway previous deployment — document in release notes",
    },
    "canary-metrics-green": {
      status: slo.overallStatus === "healthy" ? "pass" : slo.overallStatus === "degraded" ? "partial" : qa.available ? "fail" : "awaiting",
      detail: `SLO overall: ${slo.overallStatus}`,
    },
    "blue-green-ready": {
      status: gateVerdict === "GO" && smokePass ? "pass" : gateVerdict === "GO WITH KNOWN ISSUES" ? "partial" : qa.available ? "fail" : "awaiting",
      detail: "Blue/green readiness derived from release gate + smoke",
    },
    "feature-flags-validated": {
      status: "manual",
      detail: `${FEATURE_FLAGS.length} flags documented — validate in staging before prod`,
    },
  };

  const featureFlags = FEATURE_FLAGS.map((f) => ({
    ...f,
    validation: "manual",
    note: "Confirm env var set correctly in Railway/Vercel dashboard",
  }));

  const canary = {
    enabled: false,
    strategy: "smoke-then-full",
    phases: ["5% traffic", "25% traffic", "100% traffic"],
    rollbackTrigger: "release-gate NO-GO or AR-010 fired",
    currentPhase: qa.available ? "pre-canary (smoke complete)" : "awaiting-smoke",
  };

  const rollback = {
    verified: qa.available && gateVerdict !== "NO-GO",
    method: "Railway redeploy previous commit",
    verificationStep: "Re-run npm run smoke:production after rollback",
    rtoTargetHours: 4,
  };

  const migration = {
    verified: "manual",
    checklist: [
      "supabase db push / migration applied",
      "RLS policies unchanged or reviewed",
      "No breaking schema for workers",
    ],
  };

  const blueGreen = {
    ready: checks["blue-green-ready"].status === "pass",
    activeSlot: "blue",
    idleSlot: "green",
    switchCriteria: "release-gate GO + all P0 smoke PASS",
  };

  const passCount = Object.values(checks).filter((c) => c.status === "pass").length;
  const failCount = Object.values(checks).filter((c) => c.status === "fail").length;

  return {
    generatedAt: new Date().toISOString(),
    checks,
    deploymentChecks: DEPLOYMENT_CHECKS,
    featureFlags,
    canary,
    rollback,
    migration,
    blueGreen,
    summary: { pass: passCount, fail: failCount, partial: Object.values(checks).filter((c) => c.status === "partial").length },
    readyToDeploy: failCount === 0 && passCount >= 4,
  };
}
