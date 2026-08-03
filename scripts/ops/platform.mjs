import fs from "node:fs";
import { OPS_VERSION } from "./config.mjs";
import { loadQaArtifacts, stepNote, stepStatus } from "./artifact-reader.mjs";
import { buildDependencyGraph, serviceHealthSummary } from "./engines/dependencies.mjs";
import { computeErrorBudget, evaluateSlo } from "./engines/slo.mjs";
import { evaluateAlertRules } from "./engines/alerts.mjs";
import { buildDeploymentVerification } from "./engines/deployment.mjs";
import { buildIncidentReport } from "./engines/incidents.mjs";
import { loadCvArtifactsForOps } from "./cv-reader.mjs";
import { evaluatePostDeployCv } from "../e2e/release-gate.mjs";

/**
 * Build full Enterprise Operations snapshot from QA artifacts (no live probes).
 */
export function buildOpsPlatform() {
  const qa = loadQaArtifacts();
  const smoke = qa.smoke;
  const releaseGate = qa.releaseGate;

  const dependencyGraph = buildDependencyGraph(qa);
  const slo = evaluateSlo(qa);
  const errorBudget = computeErrorBudget(qa, slo);
  const alerts = evaluateAlertRules(qa, slo, errorBudget, releaseGate);
  const deployment = buildDeploymentVerification(qa, releaseGate, slo);
  const incidents = buildIncidentReport(qa, alerts, releaseGate, slo);
  const continuousVerification = loadCvArtifactsForOps();
  const cvReport = continuousVerification.available
    ? JSON.parse(fs.readFileSync(continuousVerification.reportPath, "utf8"))
    : null;
  const postDeployGate = evaluatePostDeployCv(cvReport);

  const platform = {
    version: OPS_VERSION,
    generatedAt: new Date().toISOString(),
    mode: "artifact-based",
    note: "No live services probed — data synthesized from QA artifacts when available.",
    qaSource: qa.available ? { runId: qa.runId, smokePath: qa.smokePath } : null,

    // 1–3 Dashboards & graph
    monitoringDashboard: buildMonitoringPanel(qa, slo, errorBudget, alerts, continuousVerification),
    healthDashboard: buildHealthPanel(qa, dependencyGraph),
    dependencyGraph,

    // 4–5 Error budget & SLO
    errorBudget,
    sloVerification: slo,

    // 6–16 Component monitors
    latencyMonitoring: buildLatencyPanel(smoke),
    queueMonitoring: buildQueuePanel(smoke),
    workerMonitoring: buildWorkerPanel(smoke),
    databaseHealth: buildComponentPanel("database", stepStatus(smoke, "login-user"), stepNote(smoke, "login-user"), ["supabase"]),
    storageHealth: buildComponentPanel("storage", stepStatus(smoke, "subscription-upload"), stepNote(smoke, "subscription-upload"), ["supabase-storage"]),
    memoryMonitoring: buildInfraPlaceholder("memory", "Requires Railway/host metrics integration"),
    cpuMonitoring: buildInfraPlaceholder("cpu", "Requires Railway/host metrics integration"),
    sseMonitoring: buildComponentPanel("websocket-sse", stepStatus(smoke, "market-stream"), stepNote(smoke, "market-stream"), ["market-depth-stream"]),
    openaiMonitoring: buildComponentPanel("openai", stepStatus(smoke, "instant-analysis"), stepNote(smoke, "instant-analysis"), ["openai-api"]),
    supabaseMonitoring: buildSupabasePanel(smoke),
    railwayMonitoring: buildRailwayPanel(smoke, releaseGate),

    // 17–20 Incidents
    incidentReport: incidents,
    alertRules: alerts,
    incidentTimeline: incidents.timeline,
    rootCauseTemplates: incidents.incidents.map((i) => ({ id: i.id, template: i.rootCauseTemplate })),

    // 21–22 Runbooks & recovery (paths to docs)
    runbooks: listDocPaths("runbooks"),
    recoveryPlaybooks: listDocPaths("recovery"),

    // 23–28 Deployment
    canaryRelease: deployment.canary,
    featureFlagValidation: deployment.featureFlags,
    rollbackVerification: deployment.rollback,
    migrationVerification: deployment.migration,
    deploymentVerification: deployment,
    blueGreenReadiness: deployment.blueGreen,

    // 29–30 Executive dashboards data
    productionReadinessDashboard: buildProductionReadiness(qa, releaseGate, slo, deployment),
    executiveDashboard: buildExecutiveSummary(qa, releaseGate, slo, errorBudget, incidents, deployment, continuousVerification, postDeployGate),

    continuousVerification,
    postDeployGate,

    serviceHealthSummary: serviceHealthSummary(dependencyGraph),
  };

  return platform;
}

function buildMonitoringPanel(qa, slo, errorBudget, alerts, cv) {
  return {
    title: "Monitoring Dashboard",
    status: alerts.firedCount > 0 ? "alerting" : slo.overallStatus === "healthy" ? "healthy" : "degraded",
    sloOverall: slo.overallStatus,
    errorBudgetStatus: errorBudget.status,
    alertsFired: alerts.firedCount,
    qaDataAvailable: qa.available,
    continuousVerification: cv?.available ? { verdict: cv.finalVerdict, freshness: cv.freshness } : null,
  };
}

function buildHealthPanel(qa, graph) {
  return {
    title: "Health Dashboard",
    services: graph.nodes,
    summary: serviceHealthSummary(graph),
    healthEndpoint: stepStatus(qa.smoke, "health"),
    healthNote: stepNote(qa.smoke, "health"),
  };
}

function buildLatencyPanel(smoke) {
  const pages = smoke?.performancePages || [];
  return {
    title: "Latency Monitoring",
    pages: pages.map((p) => ({
      name: p.name,
      loadTimeMs: p.loadTimeMs,
      domReadyMs: p.domReadyMs,
      fcpMs: p.fcpMs,
      lcpMs: p.lcpMs,
      status: p.loadTimeMs > 8000 || (p.lcpMs != null && p.lcpMs > 4000) ? "degraded" : p.loadTimeMs ? "ok" : "unknown",
    })),
    source: pages.length ? "qa-browser-metrics" : "awaiting-smoke",
  };
}

function buildQueuePanel(smoke) {
  const ia = smoke?.steps?.find((s) => s.id === "instant-analysis");
  return {
    title: "Queue Monitoring",
    queue: "instant-analysis",
    lastJobStatus: ia?.status || "unknown",
    note: ia?.note || "Run smoke to capture job queue status",
    backlogEstimate: ia?.note?.includes("job=") ? "normal" : "unknown",
  };
}

function buildWorkerPanel(smoke) {
  const health = smoke?.steps?.find((s) => s.id === "health");
  const iaHealth = health?.note || "";
  return {
    title: "Worker Monitoring",
    instantAnalysisWorker: /configured|ready/i.test(iaHealth) ? "configured" : stepStatus(smoke, "health"),
    newsWorker: stepStatus(smoke, "news") === "PASS" ? "inferred-ok" : "unknown",
    subscriptionWorker: stepStatus(smoke, "subscription-upload") === "PASS" ? "inferred-ok" : "unknown",
    note: health?.note || "Derived from /api/health and smoke steps",
  };
}

function buildComponentPanel(name, status, note, providers) {
  const mapped =
    status === "PASS" ? "healthy" : status === "FAIL" ? "unhealthy" : status === "BLOCKED" ? "degraded" : "awaiting-data";
  return { name, status: mapped, smokeStepStatus: status, note, providers };
}

function buildInfraPlaceholder(name, note) {
  return { name, status: "framework-ready", note, integration: "Connect Railway metrics API when enabled" };
}

function buildSupabasePanel(smoke) {
  const auth = stepStatus(smoke, "login-user");
  const sub = stepStatus(smoke, "subscription-upload");
  const admin = stepStatus(smoke, "admin-login");
  return {
    title: "Supabase Monitoring",
    auth: auth === "PASS" ? "healthy" : auth === "BLOCKED" ? "credentials-missing" : auth,
    storage: sub === "PASS" ? "healthy" : sub,
    admin: admin === "PASS" ? "healthy" : admin === "BLOCKED" ? "credentials-missing" : admin,
    overall: [auth, sub].every((s) => s === "PASS") ? "healthy" : "degraded",
  };
}

function buildRailwayPanel(smoke, releaseGate) {
  const health = stepNote(smoke, "health");
  return {
    title: "Railway Monitoring",
    commit: releaseGate?.commit || smoke?.metadata?.gitCommit || "unknown",
    readiness: /readiness=ready/i.test(health) ? "ready" : health ? "check-logs" : "awaiting-data",
    environment: releaseGate?.environment || smoke?.metadata?.environment || "unknown",
  };
}

function buildProductionReadiness(qa, releaseGate, slo, deployment) {
  return {
    title: "Production Readiness Dashboard",
    releaseGateVerdict: releaseGate?.verdict || "awaiting-smoke",
    releaseGateScore: releaseGate?.score ?? null,
    sloStatus: slo.overallStatus,
    deploymentReady: deployment.readyToDeploy,
    deploymentChecks: deployment.checks,
    qaAvailable: qa.available,
  };
}

function buildExecutiveSummary(qa, releaseGate, slo, errorBudget, incidents, deployment, cv, postDeployGate) {
  return {
    title: "Executive Dashboard",
    verdict: releaseGate?.verdict || "PENDING",
    postDeployStatus: postDeployGate?.status || "INCOMPLETE",
    postDeployNote: postDeployGate?.note || "",
    continuousVerificationVerdict: cv?.available ? cv.finalVerdict : "not-run",
    readinessScore: releaseGate?.score ?? 0,
    sloMet: slo.summary.met,
    sloBreached: slo.summary.breached,
    errorBudgetRemainingMin: errorBudget.remainingMinutes,
    openIncidents: incidents.incidentCount,
    deployReady: deployment.readyToDeploy,
    environment: releaseGate?.environment || qa.smoke?.metadata?.environment || "unknown",
    recommendation:
      releaseGate?.verdict === "GO"
        ? "Proceed with release after operational checklist sign-off."
        : releaseGate?.verdict === "GO WITH KNOWN ISSUES"
          ? "Proceed with documented known issues; monitor post-deploy."
          : releaseGate?.verdict === "NO-GO"
            ? "Do not deploy until blocking issues resolved."
            : "Run smoke test and regenerate ops report.",
  };
}

function listDocPaths(category) {
  return {
    category,
    basePath: `scripts/ops/docs/${category}/`,
    files: [`${category}-index.md`],
  };
}
