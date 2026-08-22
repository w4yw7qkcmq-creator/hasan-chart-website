import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {"P0"|"P1"|"P2"|"P3"} Priority */
/** @typedef {"Critical"|"High"|"Medium"|"Low"} SeverityLabel */
/** @typedef {"GO"|"GO WITH KNOWN ISSUES"|"NO-GO"} ReleaseVerdict */

const PRIORITY_TO_SEVERITY = {
  P0: "Critical",
  P1: "High",
  P2: "Medium",
  P3: "Low",
};

/** Smoke step id → default priority when FAIL/BLOCKED. */
const STEP_PRIORITY = Object.freeze({
  health: "P0",
  "login-user": "P0",
  dashboard: "P1",
  "subscription-upload": "P0",
  "admin-login": "P0",
  "admin-pending": "P0",
  "admin-proof": "P0",
  notifications: "P2",
  news: "P1",
  "order-book": "P1",
  "market-stream": "P1",
  theme: "P3",
  "visual-regression": "P1",
  logout: "P2",
});

/** Category weights — total 100. */
const SCORE_WEIGHTS = Object.freeze({
  health: 15,
  security: 15,
  tests: 20,
  performance: 15,
  ux: 10,
  features: 15,
  build: 10,
});

const CHECKLIST_DEF = Object.freeze([
  { id: "health", label: "Health", steps: ["health"] },
  { id: "build", label: "Build", steps: ["health"], build: true },
  { id: "smoke", label: "Smoke", steps: ["*"] },
  { id: "visual-regression", label: "Visual Regression", steps: ["visual-regression"] },
  { id: "auth", label: "Auth", steps: ["login-user", "logout"] },
  { id: "dashboard", label: "Dashboard", steps: ["dashboard"] },
  { id: "subscription", label: "Subscription", steps: ["subscription-upload"] },
  { id: "admin", label: "Admin", steps: ["admin-login", "admin-pending"] },
  { id: "order-book", label: "Order Book", steps: ["order-book", "market-stream"] },
  { id: "news", label: "News", steps: ["news"] },
  { id: "alerts", label: "Alerts", steps: [], manual: true },
  { id: "notifications", label: "Notifications", steps: ["notifications"] },
  { id: "theme", label: "Theme", steps: ["theme"] },
  { id: "responsive", label: "Responsive", steps: [], manual: true },
  { id: "cleanup-report", label: "Cleanup Report", steps: [], cleanup: true },
]);

const FIX_HINTS = Object.freeze({
  health: "Fix /api/health and worker readiness before release.",
  "login-user": "Verify E2E credentials and /api/auth/login flow.",
  dashboard: "Ensure authenticated /my-dashboard returns 200 with valid session.",
  "subscription-upload": "Verify subscription init/authorize/finalize and storage signed URLs.",
  "admin-login": "Verify admin credentials and /api/admin/dashboard authorization.",
  "admin-pending": "Ensure admin can list subscription requests.",
  "admin-proof": "Verify payment-proof signed URL endpoint.",
  news: "Fix /api/news feed and upstream news worker.",
  "order-book": "Check MarketDepthHub exchange connections and snapshot API.",
  "market-stream": "Verify SSE /api/market-depth/stream bootstrap.",
  "visual-regression": "Review UI diff; update baselines if change is intentional.",
  theme: "Verify data-theme attribute and theme toggle markup.",
  notifications: "Check /api/my-notifications feed.",
  security: "Investigate console/network security signals immediately.",
  performance: "Optimize slow pages (LCP/load time) before release.",
  worker: "Ensure background workers are running and reachable.",
});

function safeExec(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function gitRepoDirty() {
  const status = safeExec("git status --porcelain");
  return status.length > 0;
}

function stepMap(steps) {
  return new Map((steps || []).map((s) => [s.id, s]));
}

function statusSymbol(status) {
  if (status === "pass") return "✓";
  if (status === "fail") return "✕";
  return "~";
}

function checklistStatus(stepStatuses, item, cleanupPresent, smokeCompleted) {
  if (item.cleanup) {
    return cleanupPresent ? "pass" : "partial";
  }
  if (item.manual) return "partial";
  if (item.id === "smoke") {
    return smokeCompleted ? (stepStatuses.some((s) => s === "fail") ? "fail" : "pass") : "partial";
  }
  if (item.build) {
    const health = stepStatuses.find((s) => s.id === "health");
    if (!health) return "partial";
    if (health.status === "FAIL") return "fail";
    if (health.status === "PASS" && /readiness=ready/i.test(health.note || "")) return "pass";
    if (health.status === "PASS") return "partial";
    return "partial";
  }

  const related = item.steps.map((id) => stepStatuses.find((s) => s.id === id)).filter(Boolean);
  if (!related.length) return "partial";
  if (related.some((s) => s.status === "FAIL")) return "fail";
  if (related.every((s) => s.status === "PASS")) return "pass";
  return "partial";
}

function issue(id, priority, description, suggestedFix, source) {
  return {
    id,
    priority,
    severity: PRIORITY_TO_SEVERITY[priority],
    description,
    suggestedFix,
    source,
  };
}

function detectSecurityIssues(consoleCapture) {
  const issues = [];
  const entries = consoleCapture?.entries || [];
  const securityPattern = /unauthorized|forbidden|csrf|xss|sql injection|token leak|secret/i;
  for (const entry of entries) {
    const text = entry.text || entry.message || "";
    if (securityPattern.test(text)) {
      issues.push(
        issue(
          `SEC-${issues.length + 1}`,
          "P0",
          `Security signal in console: ${text.slice(0, 120)}`,
          FIX_HINTS.security,
          "console"
        )
      );
    }
  }
  if ((consoleCapture?.consoleErrors || 0) > 5) {
    issues.push(
      issue(
        "SEC-ERRORS",
        "P2",
        `${consoleCapture.consoleErrors} console errors captured during browser run`,
        "Review console.jsonl and fix client-side errors.",
        "console"
      )
    );
  }
  return issues;
}

function detectPerformanceIssues(performancePages) {
  const issues = [];
  for (const page of performancePages || []) {
    if (page.loadTimeMs > 8000) {
      issues.push(
        issue(
          `PERF-LOAD-${page.slug}`,
          "P2",
          `${page.name} load time ${page.loadTimeMs}ms exceeds 8000ms threshold`,
          FIX_HINTS.performance,
          "performance"
        )
      );
    }
    if (page.lcpMs != null && page.lcpMs > 4000) {
      issues.push(
        issue(
          `PERF-LCP-${page.slug}`,
          "P2",
          `${page.name} LCP ${Math.round(page.lcpMs)}ms exceeds 4000ms threshold`,
          FIX_HINTS.performance,
          "performance"
        )
      );
    }
  }
  return issues;
}

function detectVisualIssues(visual) {
  const issues = [];
  for (const v of visual?.visualRegressions || visual?.visualResults?.filter((r) => r.note?.includes("VISUAL REGRESSION")) || []) {
    issues.push(
      issue(
        `VIS-${v.file || v.name}`,
        "P1",
        `Visual regression on ${v.name || v.file}: ${v.note || ""}`,
        FIX_HINTS["visual-regression"],
        "visual-regression"
      )
    );
  }
  return issues;
}

function detectStepIssues(steps) {
  const issues = [];
  for (const step of steps || []) {
    const priority = STEP_PRIORITY[step.id] || "P2";
    if (step.status === "FAIL") {
      issues.push(
        issue(
          `STEP-${step.id}`,
          priority,
          `${step.name} failed: ${step.note || "no details"}`,
          FIX_HINTS[step.id] || `Investigate smoke step "${step.id}".`,
          step.id
        )
      );
    } else if (step.status === "BLOCKED" && (priority === "P0" || priority === "P1")) {
      issues.push(
        issue(
          `BLK-${step.id}`,
          "P2",
          `${step.name} blocked: ${step.note || "credentials or environment missing"}`,
          FIX_HINTS[step.id] || "Provide E2E credentials or fix environment gate.",
          step.id
        )
      );
    } else if (step.status === "MANUAL_REQUIRED") {
      issues.push(
        issue(
          `MAN-${step.id}`,
          "P2",
          `${step.name} requires manual verification: ${step.note || ""}`,
          "Complete manual QA before release.",
          step.id
        )
      );
    } else if (step.status === "VERIFY_ONLY" && priority === "P3") {
      issues.push(
        issue(
          `VER-${step.id}`,
          "P3",
          `${step.name} verify-only: ${step.note || ""}`,
          "Informational — no release block.",
          step.id
        )
      );
    }
  }
  return issues;
}

function detectWorkerIssues(steps) {
  const health = (steps || []).find((s) => s.id === "health");
  if (!health || health.status !== "FAIL") return [];
  const note = health.note || "";
  if (/worker|price.?alert|not configured|unavailable/i.test(note)) {
    return [
      issue("WRK-HEALTH", "P0", `Worker/readiness issue: ${note}`, FIX_HINTS.worker, "health"),
    ];
  }
  return [];
}

function computeCategoryScores(payload, allIssues) {
  const steps = stepMap(payload.steps);
  const summary = payload.summary || {};
  const totalSteps = (payload.steps || []).length || 1;
  const passRatio = (summary.PASS || 0) / totalSteps;

  const healthStep = steps.get("health");
  let health = 0;
  if (healthStep?.status === "PASS") health = SCORE_WEIGHTS.health;
  else if (healthStep?.status === "VERIFY_ONLY" || healthStep?.status === "BLOCKED") health = SCORE_WEIGHTS.health * 0.5;

  const authSteps = ["login-user", "logout", "admin-login"];
  const authPass = authSteps.filter((id) => steps.get(id)?.status === "PASS").length;
  const authTotal = authSteps.filter((id) => steps.has(id)).length || authSteps.length;
  const securityBase = (authPass / authTotal) * SCORE_WEIGHTS.security;
  const secPenalty = allIssues.filter((i) => i.priority === "P0" && i.source === "console").length * 5;
  const security = Math.max(0, Math.round(securityBase - secPenalty));

  const tests = Math.round(passRatio * SCORE_WEIGHTS.tests);

  const perfPages = payload.performancePages || [];
  let perfRatio = 1;
  if (perfPages.length) {
    const slow = perfPages.filter((p) => p.loadTimeMs > 8000 || (p.lcpMs != null && p.lcpMs > 4000)).length;
    perfRatio = 1 - slow / perfPages.length;
  }
  const performance = Math.round(perfRatio * SCORE_WEIGHTS.performance);

  const uxStep = steps.get("visual-regression");
  const themeStep = steps.get("theme");
  let ux = SCORE_WEIGHTS.ux;
  if (uxStep?.status === "FAIL") ux -= SCORE_WEIGHTS.ux * 0.6;
  else if (uxStep?.status === "BLOCKED") ux -= SCORE_WEIGHTS.ux * 0.2;
  if (themeStep?.status === "MANUAL_REQUIRED") ux -= SCORE_WEIGHTS.ux * 0.2;
  ux = Math.max(0, Math.round(ux));

  const featureIds = [
    "subscription-upload",
    "order-book",
    "news",
    "admin-login",
    "dashboard",
  ];
  const featurePass = featureIds.filter((id) => steps.get(id)?.status === "PASS").length;
  const features = Math.round((featurePass / featureIds.length) * SCORE_WEIGHTS.features);

  let build = 0;
  if (healthStep?.status === "PASS") {
    build = /readiness=ready/i.test(healthStep.note || "")
      ? SCORE_WEIGHTS.build
      : Math.round(SCORE_WEIGHTS.build * 0.7);
  }

  const breakdown = { health, security, tests, performance, ux, features, build };
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { total, breakdown };
}

function deriveVerdict(allIssues, manualOverride) {
  const hasP0 = allIssues.some((i) => i.priority === "P0");
  const hasP1 = allIssues.some((i) => i.priority === "P1");
  const hasP2 = allIssues.some(
    (i) => i.priority === "P2" && !String(i.id).startsWith("VER-")
  );

  if (hasP0) return /** @type {ReleaseVerdict} */ ("NO-GO");
  if (hasP1 && !manualOverride) return /** @type {ReleaseVerdict} */ ("NO-GO");
  if (hasP2 || hasP1) return /** @type {ReleaseVerdict} */ ("GO WITH KNOWN ISSUES");
  return /** @type {ReleaseVerdict} */ ("GO");
}

function sortIssues(issues) {
  const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  return [...issues].sort((a, b) => order[a.severity] - order[b.severity] || a.id.localeCompare(b.id));
}

function buildReleaseNotes(summary) {
  return [
    `Smoke run completed.`,
    `PASS: ${summary.PASS || 0}`,
    `FAIL: ${summary.FAIL || 0}`,
    `VERIFY ONLY: ${summary.VERIFY_ONLY || 0}`,
    `BLOCKED: ${summary.BLOCKED || 0}`,
    `MANUAL REQUIRED: ${summary.MANUAL_REQUIRED || 0}`,
  ].join("\n");
}

function buildChecklist(payload, cleanupPresent) {
  const steps = payload.steps || [];
  const smokeCompleted = steps.length > 0 && payload.metadata?.finishedAt;
  return CHECKLIST_DEF.map((item) => {
    const status = checklistStatus(steps, item, cleanupPresent, smokeCompleted);
    return {
      id: item.id,
      label: item.label,
      status,
      symbol: statusSymbol(status),
    };
  });
}

/**
 * Evaluate release gate from smoke payload (does not run tests).
 * @param {object} payload smoke.json content
 * @param {object} [options]
 * @param {boolean} [options.manualOverride] allow P1 override (RELEASE_GATE_OVERRIDE=1)
 * @param {object} [options.cleanup] cleanup-report.json content
 */
export function evaluateReleaseGate(payload, options = {}) {
  const manualOverride = options.manualOverride ?? process.env.RELEASE_GATE_OVERRIDE === "1";
  const steps = payload.steps || [];
  const summary = payload.summary || {};
  const metadata = payload.metadata || {};

  const stepIssues = detectStepIssues(steps);
  const visualIssues = detectVisualIssues(payload.visual);
  const perfIssues = detectPerformanceIssues(payload.performancePages);
  const secIssues = detectSecurityIssues(payload.consoleCapture);
  const workerIssues = detectWorkerIssues(steps);

  const allIssues = sortIssues([
    ...stepIssues,
    ...visualIssues,
    ...perfIssues,
    ...secIssues,
    ...workerIssues,
  ]);

  const blockingIssues = allIssues.filter((i) => i.priority === "P0" || i.priority === "P1");
  const warnings = allIssues.filter((i) => i.priority === "P2" || i.priority === "P3");

  const scoreResult = computeCategoryScores(payload, allIssues);
  const verdict = deriveVerdict(allIssues, manualOverride);
  const cleanupPresent = Boolean(options.cleanup && typeof options.cleanup === "object");
  const checklist = buildChecklist(payload, cleanupPresent);

  const gitDirty = gitRepoDirty();

  return {
    verdict,
    score: scoreResult.total,
    scoreBreakdown: scoreResult.breakdown,
    scoreWeights: SCORE_WEIGHTS,
    blockingIssues,
    warnings,
    allIssues,
    topBlockingIssues: blockingIssues.slice(0, 10),
    checklist,
    environment: metadata.environment || "unknown",
    commit: metadata.gitCommit || "unknown",
    branch: metadata.gitBranch || "unknown",
    repositoryState: gitDirty ? "dirty" : "clean",
    executionTimeMs: metadata.durationMs ?? null,
    generatedAt: new Date().toISOString(),
    releaseNotesPreview: buildReleaseNotes(summary),
    manualOverrideApplied: manualOverride && allIssues.some((i) => i.priority === "P1"),
    summary,
    metadata: {
      baseUrl: payload.baseUrl,
      runId: payload.runId,
      startedAt: metadata.startedAt,
      finishedAt: metadata.finishedAt,
    },
  };
}

/**
 * Write release-gate.json next to smoke.json.
 * @param {object} payload
 * @param {string} outFile
 * @param {object} [options]
 */
export function writeReleaseGate(payload, outFile, options = {}) {
  let cleanup = options.cleanup ?? null;
  if (!cleanup && options.cleanupPath && fs.existsSync(options.cleanupPath)) {
    cleanup = JSON.parse(fs.readFileSync(options.cleanupPath, "utf8"));
  }
  const gate = evaluateReleaseGate(payload, { ...options, cleanup });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        verdict: gate.verdict,
        score: gate.score,
        scoreBreakdown: gate.scoreBreakdown,
        blockingIssues: gate.blockingIssues,
        warnings: gate.warnings,
        checklist: gate.checklist,
        environment: gate.environment,
        commit: gate.commit,
        branch: gate.branch,
        repositoryState: gate.repositoryState,
        executionTimeMs: gate.executionTimeMs,
        generatedAt: gate.generatedAt,
        releaseNotesPreview: gate.releaseNotesPreview,
        topBlockingIssues: gate.topBlockingIssues,
        manualOverrideApplied: gate.manualOverrideApplied,
      },
      null,
      2
    )
  );
  return gate;
}

/**
 * Post-deploy Production Gate — reads Continuous Verification artifacts only.
 * Does not affect pre-deploy Release Gate.
 * @param {object} [cvReport] continuous-verification.json payload
 */
export function evaluatePostDeployCv(cvReport) {
  if (!cvReport) {
    return {
      phase: "post-deploy",
      status: "INCOMPLETE",
      rollbackRecommended: false,
      note: "No CV report — run checkpoints after deploy",
    };
  }

  const open = cvReport.incidents?.open || [];
  const p0 = open.filter((i) => i.severity === "P0");
  const p1 = open.filter((i) => i.severity === "P1");
  const verdict = cvReport.finalVerdict || "INCOMPLETE";

  let status = verdict;
  let rollbackRecommended = false;
  let note = "";

  if (p0.length > 0) {
    status = "UNHEALTHY";
    rollbackRecommended = true;
    note = "P0 open incident — rollback recommended";
  } else if (verdict === "UNHEALTHY" || p1.length >= 2) {
    status = "UNHEALTHY";
    rollbackRecommended = true;
    note = "Multiple P1 failures or UNHEALTHY verdict";
  } else if (p1.length === 1 || verdict === "DEGRADED") {
    status = "DEGRADED";
    note = "P1 open or degraded — monitor next checkpoint";
  } else if (verdict === "HEALTHY") {
    status = "HEALTHY";
    note = "All completed checkpoints passed";
  } else {
    status = "INCOMPLETE";
    note = "Checkpoints not fully executed";
  }

  return {
    phase: "post-deploy",
    status,
    rollbackRecommended,
    openIncidents: open.length,
    finalVerdict: verdict,
    note,
    recoveredIncidents: (cvReport.incidents?.all || []).filter((i) => i.status === "recovered").length,
  };
}

/** CLI: node release-gate.mjs [smoke.json] */
const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const smokePath =
    process.argv[2] ||
    path.join(import.meta.dirname, ".artifacts/json/latest/smoke.json");

  if (!fs.existsSync(smokePath)) {
    console.error(`smoke.json not found: ${smokePath}`);
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(smokePath, "utf8"));
  const cleanupPath = path.join(path.dirname(smokePath), "cleanup-report.json");
  const outFile = path.join(path.dirname(smokePath), "release-gate.json");
  const gate = writeReleaseGate(payload, outFile, {
    cleanupPath: fs.existsSync(cleanupPath) ? cleanupPath : undefined,
  });

  console.log(`Release Gate: ${gate.verdict}`);
  console.log(`Score: ${gate.score}/100`);
  console.log(`Written: ${outFile}`);
  process.exit(gate.verdict === "NO-GO" ? 1 : 0);
}
