import { ERROR_BUDGET, SLO_TARGETS, SLA_TARGETS } from "../config.mjs";
import { stepNote, stepStatus } from "../artifact-reader.mjs";

export function evaluateSlo(qa) {
  const smoke = qa.smoke;
  const perf = smoke?.performancePages || [];
  const checks = [];

  const healthOk = stepStatus(smoke, "health") === "PASS";
  checks.push({
    id: "slo-availability",
    name: SLO_TARGETS.availability.label,
    target: `${SLO_TARGETS.availability.target}%`,
    actual: healthOk ? "100%" : qa.available ? "0%" : "awaiting-data",
    status: !qa.available ? "awaiting-data" : healthOk ? "met" : "breached",
  });

  const loads = perf.map((p) => p.loadTimeMs).filter(Boolean);
  const p95 = loads.length ? percentile(loads, 95) : null;
  checks.push({
    id: "slo-latency-p95",
    name: SLO_TARGETS.latencyP95.label,
    target: `<=${SLO_TARGETS.latencyP95.targetMs}ms`,
    actual: p95 != null ? `${Math.round(p95)}ms` : "awaiting-data",
    status:
      p95 == null
        ? "awaiting-data"
        : p95 <= SLO_TARGETS.latencyP95.targetMs
          ? "met"
          : "breached",
  });

  const failCount = smoke?.summary?.FAIL || 0;
  const total = (smoke?.steps || []).length || 1;
  const errorRate = ((failCount / total) * 100).toFixed(2);
  checks.push({
    id: "slo-error-rate",
    name: SLO_TARGETS.errorRate.label,
    target: `<=${SLO_TARGETS.errorRate.targetPercent}%`,
    actual: qa.available ? `${errorRate}%` : "awaiting-data",
    status:
      !qa.available
        ? "awaiting-data"
        : Number(errorRate) <= SLO_TARGETS.errorRate.targetPercent
          ? "met"
          : "breached",
  });

  const iaStatus = stepStatus(smoke, "instant-analysis");
  checks.push({
    id: "slo-ia-success",
    name: SLO_TARGETS.iaJobSuccess.label,
    target: `${SLO_TARGETS.iaJobSuccess.targetPercent}%`,
    actual: iaStatus === "PASS" ? "100%" : iaStatus === "VERIFY_ONLY" ? "partial" : iaStatus,
    status:
      iaStatus === "PASS"
        ? "met"
        : iaStatus === "VERIFY_ONLY"
          ? "partial"
          : iaStatus === "UNKNOWN"
            ? "awaiting-data"
            : "breached",
  });

  const obNote = stepNote(smoke, "order-book");
  const obPass = stepStatus(smoke, "order-book") === "PASS";
  checks.push({
    id: "slo-order-book-warmup",
    name: SLO_TARGETS.orderBookWarmup.label,
    target: `<=${SLO_TARGETS.orderBookWarmup.targetMs}ms`,
    actual: obPass ? "within threshold" : obNote || "awaiting-data",
    status: !qa.available ? "awaiting-data" : obPass ? "met" : "breached",
  });

  const ssePass = stepStatus(smoke, "market-stream") === "PASS";
  checks.push({
    id: "slo-sse-bootstrap",
    name: SLO_TARGETS.sseBootstrap.label,
    target: `<=${SLO_TARGETS.sseBootstrap.targetMs}ms`,
    actual: ssePass ? "connected" : stepNote(smoke, "market-stream") || "awaiting-data",
    status: !qa.available ? "awaiting-data" : ssePass ? "met" : "breached",
  });

  const met = checks.filter((c) => c.status === "met").length;
  const breached = checks.filter((c) => c.status === "breached").length;

  return {
    generatedAt: new Date().toISOString(),
    sloTargets: SLO_TARGETS,
    slaTargets: SLA_TARGETS,
    checks,
    summary: { met, breached, partial: checks.filter((c) => c.status === "partial").length, awaiting: checks.filter((c) => c.status === "awaiting-data").length },
    overallStatus: breached > 0 ? "breached" : met === checks.length ? "healthy" : "degraded",
  };
}

export function computeErrorBudget(qa, slo) {
  const breached = slo.checks.filter((c) => c.status === "breached").length;
  const total = slo.checks.filter((c) => c.status !== "awaiting-data").length || 1;
  const consumedRatio = breached / total;
  const consumedMinutes = +(ERROR_BUDGET.monthlyMinutes * consumedRatio).toFixed(2);
  const remainingMinutes = +(ERROR_BUDGET.monthlyMinutes - consumedMinutes).toFixed(2);

  return {
    generatedAt: new Date().toISOString(),
    windowDays: 30,
    budgetMinutes: ERROR_BUDGET.monthlyMinutes,
    consumedMinutes,
    remainingMinutes,
    burnRate: +consumedRatio.toFixed(3),
    alertThreshold: ERROR_BUDGET.burnAlertThreshold,
    status:
      consumedRatio >= ERROR_BUDGET.burnAlertThreshold
        ? "critical"
        : consumedRatio >= 0.25
          ? "warning"
          : qa.available
            ? "healthy"
            : "awaiting-data",
    source: qa.available ? "qa-artifacts" : "static-framework",
  };
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}
