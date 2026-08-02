#!/usr/bin/env node

function resolveRailwayAiWorkerUrl(env = process.env) {
  const raw = String(env.RAILWAY_AI_WORKER_URL || env.NEXT_PUBLIC_RAILWAY_AI_WORKER_URL || "").trim();

  if (!raw) {
    return null;
  }

  const normalized = raw.replace(/\/+$/, "");

  if (!/^https?:\/\//i.test(normalized)) {
    return null;
  }

  return normalized;
}

function isValidInstantAnalysisJobId(jobId) {
  return /^job_\d+_[a-z0-9]{6}$/i.test(String(jobId || "").trim());
}

function isInlineInstantAnalysisJobId(jobId) {
  return /^inline:[0-9a-f-]{36}$/i.test(String(jobId || "").trim());
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  resolveRailwayAiWorkerUrl({ RAILWAY_AI_WORKER_URL: "https://worker.example.com/" }) ===
    "https://worker.example.com",
  "should trim trailing slash from server env"
);

assert(
  resolveRailwayAiWorkerUrl({
    NEXT_PUBLIC_RAILWAY_AI_WORKER_URL: "https://legacy-worker.example.com/",
  }) === "https://legacy-worker.example.com",
  "should fall back to legacy public env on server"
);

assert(
  resolveRailwayAiWorkerUrl({ RAILWAY_AI_WORKER_URL: "ftp://invalid.example.com" }) === null,
  "should reject non-http(s) worker urls"
);

assert(isValidInstantAnalysisJobId("job_1700000000000_ab12cd"), "valid worker job id");
assert(!isValidInstantAnalysisJobId("job_1700000000000_inlinex"), "overlong worker suffix rejected");
assert(isInlineInstantAnalysisJobId("inline:550e8400-e29b-41d4-a716-446655440000"), "inline job id format");
assert(!isValidInstantAnalysisJobId("../health"), "invalid job id");

console.log("instant-analysis-worker tests passed");
