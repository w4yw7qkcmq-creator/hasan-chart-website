/** Continuous Verification Platform — configuration. */

export const CV_VERSION = "1.0.0";
export const USER_AGENT = "HasaN-Chart-Continuous-Verification/1.0";

export const CHECKPOINTS = Object.freeze([
  { id: "t1m", label: "T+1m", delayMs: 60_000, timeoutMs: 30_000, severityPolicy: "strict" },
  { id: "t5m", label: "T+5m", delayMs: 300_000, timeoutMs: 30_000, severityPolicy: "strict" },
  { id: "t15m", label: "T+15m", delayMs: 900_000, timeoutMs: 45_000, severityPolicy: "standard" },
  { id: "t1h", label: "T+1h", delayMs: 3_600_000, timeoutMs: 45_000, severityPolicy: "standard" },
  { id: "t6h", label: "T+6h", delayMs: 21_600_000, timeoutMs: 60_000, severityPolicy: "relaxed" },
  { id: "t24h", label: "T+24h", delayMs: 86_400_000, timeoutMs: 60_000, severityPolicy: "relaxed" },
]);

export const PROBE_IDS = Object.freeze([
  "web-health",
  "instant-analysis-health",
  "order-book",
  "news",
  "auth-gate",
  "workers",
  "release-gate",
  "operational-signals",
]);

export const CHECKPOINT_PROBE_MAP = Object.freeze(
  Object.fromEntries(CHECKPOINTS.map((cp) => [cp.id, [...PROBE_IDS]]))
);

export const RETRY_POLICY = Object.freeze({
  maxAttempts: 2,
  backoffMs: [1000, 3000],
  retryableStatuses: [502, 503, 504],
  retryableErrors: [/timeout/i, /network reset/i, /econnreset/i, /abort/i, /fetch failed/i, /warmup/i],
  noRetryStatuses: [401, 403],
  noRetryConditions: [/schema invalid/i, /security failure/i, /release gate no-go/i],
});

export const FRESHNESS_RULES = Object.freeze({
  releaseGateMaxAgeSec: 86_400,
  incidentReportMaxAgeSec: 86_400,
  errorBudgetMaxAgeSec: 86_400,
  deploymentVerificationMaxAgeSec: 86_400,
  continuousVerificationMaxAgeSec: 3_600,
});

export const LATENCY_BASELINES = Object.freeze({
  "web-health": { warnMs: 800, criticalMs: 2000 },
  "instant-analysis-health": { warnMs: 1000, criticalMs: 3000 },
  "order-book": { warnMs: 3000, criticalMs: 8000 },
  news: { warnMs: 1500, criticalMs: 5000 },
  "auth-gate": { warnMs: 1200, criticalMs: 4000 },
  workers: { warnMs: 1500, criticalMs: 4000 },
});

export const ORDER_BOOK_WARMUP_MS = 20_000;
export const ORDER_BOOK_MIN_CONNECTED = 1;

export const RUNBOOK_MAP = Object.freeze({
  "web-health": "continuous-verification.md",
  "instant-analysis-health": "worker-down.md",
  "order-book": "order-book-degraded.md",
  news: "continuous-verification.md",
  "auth-gate": "auth-failure.md",
  workers: "worker-down.md",
  "release-gate": "release-blocked.md",
  "operational-signals": "continuous-verification.md",
});

export const SCHEDULER_BACKENDS = Object.freeze(["manual", "ci", "railway-cron", "github-actions"]);
