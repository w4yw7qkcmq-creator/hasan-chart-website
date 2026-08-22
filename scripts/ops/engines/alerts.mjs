import { ALERT_RULES } from "../config.mjs";
import { stepStatus } from "../artifact-reader.mjs";

export function evaluateAlertRules(qa, slo, errorBudget, releaseGate) {
  const smoke = qa.smoke;
  const visual = smoke?.visual;
  const regressions = visual?.visualRegressions?.length || 0;

  const context = {
    healthOk: stepStatus(smoke, "health") === "PASS",
    authFail: stepStatus(smoke, "login-user") === "FAIL",
    orderBookPass: stepStatus(smoke, "order-book") === "PASS",
    visualRegressions: regressions,
    errorBudgetBurn: errorBudget.burnRate,
    latencyBreached: slo.checks.some((c) => c.id === "slo-latency-p95" && c.status === "breached"),
    workerUnavailable: stepStatus(smoke, "health") === "FAIL",
    consoleWarnings: smoke?.consoleCapture?.consoleWarnings || 0,
    releaseGateVerdict: releaseGate?.verdict || "UNKNOWN",
    queueBacklog: 0,
  };

  const evaluated = ALERT_RULES.map((rule) => {
    const fired = evaluateRule(rule, context, qa.available);
    return { ...rule, fired, evaluatedAt: new Date().toISOString() };
  });

  return {
    generatedAt: new Date().toISOString(),
    rules: evaluated,
    firedCount: evaluated.filter((r) => r.fired).length,
    context,
  };
}

function evaluateRule(rule, ctx, hasData) {
  if (!hasData) return false;
  switch (rule.id) {
    case "AR-001":
      return !ctx.healthOk;
    case "AR-002":
      return ctx.authFail;
    case "AR-003":
      return !ctx.orderBookPass;
    case "AR-004":
      return ctx.visualRegressions > 0;
    case "AR-005":
      return ctx.errorBudgetBurn > 0.5;
    case "AR-006":
      return ctx.latencyBreached;
    case "AR-007":
      return ctx.queueBacklog > 100;
    case "AR-008":
      return ctx.workerUnavailable;
    case "AR-009":
      return ctx.consoleWarnings > 10;
    case "AR-010":
      return ctx.releaseGateVerdict === "NO-GO";
    default:
      return false;
  }
}
