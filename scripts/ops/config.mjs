/** Enterprise Operations Platform — static configuration (no live probes). */

export const OPS_VERSION = "1.0.0";

export const SERVICES = Object.freeze([
  { id: "next-app", name: "Next.js App", tier: "P0", dependsOn: ["supabase", "redis"] },
  { id: "ia-worker", name: "Instant Analysis Worker", tier: "P0", dependsOn: ["redis", "openai", "supabase"] },
  { id: "news-worker", name: "News Worker", tier: "P1", dependsOn: ["supabase"] },
  { id: "subscription-worker", name: "Subscription Worker", tier: "P1", dependsOn: ["supabase", "storage"] },
  { id: "market-depth", name: "Market Depth Hub", tier: "P1", dependsOn: ["binance", "bybit", "okx"] },
  { id: "supabase", name: "Supabase", tier: "P0", dependsOn: [] },
  { id: "redis", name: "Upstash Redis", tier: "P0", dependsOn: [] },
  { id: "storage", name: "Supabase Storage", tier: "P1", dependsOn: ["supabase"] },
  { id: "openai", name: "OpenAI API", tier: "P1", dependsOn: [] },
  { id: "railway", name: "Railway Hosting", tier: "P0", dependsOn: [] },
]);

export const SLO_TARGETS = Object.freeze({
  availability: { target: 99.9, windowDays: 30, label: "Availability" },
  latencyP95: { targetMs: 2000, label: "API Latency P95" },
  latencyP99: { targetMs: 5000, label: "API Latency P99" },
  errorRate: { targetPercent: 0.1, label: "Error Rate" },
  iaJobSuccess: { targetPercent: 99, label: "Instant Analysis Success" },
  orderBookWarmup: { targetMs: 20000, label: "Order Book Warmup" },
  sseBootstrap: { targetMs: 15000, label: "SSE Bootstrap" },
});

export const SLA_TARGETS = Object.freeze({
  criticalResponseMin: 15,
  highResponseMin: 60,
  mediumResponseMin: 240,
  recoveryRTOHours: 4,
  recoveryRPOHours: 1,
});

export const ERROR_BUDGET = Object.freeze({
  monthlyMinutes: 43.2, // 99.9% of 30 days
  burnAlertThreshold: 0.5,
});

export const ALERT_RULES = Object.freeze([
  { id: "AR-001", severity: "critical", condition: "health.status != ok", action: "page-oncall", runbook: "health-down.md" },
  { id: "AR-002", severity: "critical", condition: "auth.failures > 0", action: "page-oncall", runbook: "auth-failure.md" },
  { id: "AR-003", severity: "high", condition: "order_book.connected < expected", action: "slack-ops", runbook: "order-book-degraded.md" },
  { id: "AR-004", severity: "high", condition: "visual_regression.count > 0", action: "block-release", runbook: "visual-regression.md" },
  { id: "AR-005", severity: "high", condition: "error_budget.burn > 0.5", action: "slack-ops", runbook: "error-budget-burn.md" },
  { id: "AR-006", severity: "medium", condition: "latency.p95 > slo.target", action: "ticket", runbook: "latency-degraded.md" },
  { id: "AR-007", severity: "medium", condition: "queue.backlog > 100", action: "slack-ops", runbook: "queue-backlog.md" },
  { id: "AR-008", severity: "medium", condition: "worker.unavailable", action: "slack-ops", runbook: "worker-down.md" },
  { id: "AR-009", severity: "low", condition: "console.warnings > 10", action: "log-only", runbook: "console-warnings.md" },
  { id: "AR-010", severity: "critical", condition: "release_gate.verdict == NO-GO", action: "block-deploy", runbook: "release-blocked.md" },
]);

export const SMOKE_STEP_SERVICE_MAP = Object.freeze({
  health: ["next-app", "railway", "ia-worker"],
  "login-user": ["supabase", "next-app"],
  dashboard: ["next-app", "supabase"],
  "instant-analysis": ["ia-worker", "openai", "redis", "supabase"],
  "subscription-upload": ["storage", "supabase", "next-app"],
  "admin-login": ["supabase", "next-app"],
  news: ["news-worker", "supabase"],
  "order-book": ["market-depth"],
  "market-stream": ["market-depth"],
  "visual-regression": ["next-app"],
  notifications: ["supabase", "next-app"],
});

export const FEATURE_FLAGS = Object.freeze([
  { id: "instant-analysis-v2", env: "IA_V2_ENABLED", default: "true" },
  { id: "market-depth-stream", env: "MARKET_DEPTH_ENABLED", default: "true" },
  { id: "news-feed", env: "NEWS_ENABLED", default: "true" },
  { id: "subscription-upload", env: "SUBSCRIPTION_UPLOAD_ENABLED", default: "true" },
]);

export const DEPLOYMENT_CHECKS = Object.freeze([
  "release-gate-pass",
  "smoke-pass",
  "visual-regression-pass",
  "migration-verified",
  "rollback-plan-ready",
  "canary-metrics-green",
  "blue-green-ready",
  "feature-flags-validated",
]);
