#!/usr/bin/env node

/**
 * Safe load test for public GET endpoints only.
 * Never run against production without explicit approval.
 *
 * Usage:
 *   TARGET_URL=http://localhost:3000 CONCURRENCY=10 DURATION=30 npm run load-test
 *
 * Env:
 *   TARGET_URL | BASE_URL  — target server (default http://localhost:3000)
 *   CONCURRENCY            — parallel workers (default 5, max 50)
 *   DURATION               — test duration seconds (default 10, max 180)
 *   REQUEST_TIMEOUT_MS     — per-request timeout (default 10000)
 *   ALLOW_PROD_LOAD_TEST=1 — required to test production domains
 */

const TARGET_URL = String(
  process.env.TARGET_URL || process.env.BASE_URL || "http://localhost:3000"
).replace(/\/$/, "");

const CONCURRENCY = Math.max(1, Math.min(Number(process.env.CONCURRENCY || 5), 50));
const DURATION_SEC = Math.max(5, Math.min(Number(process.env.DURATION || 10), 180));
const REQUEST_TIMEOUT_MS = Math.max(
  1000,
  Math.min(Number(process.env.REQUEST_TIMEOUT_MS || 10000), 30000)
);

const PUBLIC_GET_PATHS = [
  "/",
  "/news",
  "/markets",
  "/api/health",
  "/api/market-pulse",
  "/api/news?limit=20&offset=0",
  "/api/daily-analysis",
];

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function createPathBucket() {
  return {
    requests: 0,
    success: 0,
    failures: 0,
    latencies: [],
    statusCodes: {},
    errors: {
      timeout: 0,
      connection: 0,
      other: 0,
    },
  };
}

function classifyError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  const name = String(error?.name || "").toLowerCase();

  if (name === "aborterror" || message.includes("abort") || message.includes("timeout")) {
    return "timeout";
  }

  if (
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("socket")
  ) {
    return "connection";
  }

  return "other";
}

function recordStatus(bucket, status) {
  const key = String(status);
  bucket.statusCodes[key] = (bucket.statusCodes[key] || 0) + 1;
}

async function fetchOnce(path) {
  const url = `${TARGET_URL}${path}`;
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "*/*" },
      redirect: "follow",
      signal: controller.signal,
    });
    const elapsedMs = performance.now() - startedAt;

    return {
      ok: response.ok,
      status: response.status,
      elapsedMs,
      path,
      errorType: null,
    };
  } catch (error) {
    const elapsedMs = performance.now() - startedAt;
    const errorType = classifyError(error);

    return {
      ok: false,
      status: 0,
      elapsedMs,
      path,
      errorType,
      errorMessage: error?.message || String(error),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function summarizePathBucket(path, bucket, durationSec) {
  const successRate =
    bucket.requests > 0 ? Number(((bucket.success / bucket.requests) * 100).toFixed(2)) : 0;

  return {
    path,
    requests: bucket.requests,
    success: bucket.success,
    failures: bucket.failures,
    successRatePct: successRate,
    rps: Number((bucket.requests / durationSec).toFixed(2)),
    latencyMs: {
      avg: Math.round(average(bucket.latencies)),
      p50: Math.round(percentile(bucket.latencies, 50)),
      p95: Math.round(percentile(bucket.latencies, 95)),
      p99: Math.round(percentile(bucket.latencies, 99)),
      max: Math.round(Math.max(...bucket.latencies, 0)),
    },
    statusCodes: bucket.statusCodes,
    errors: bucket.errors,
  };
}

async function workerLoop(deadline, stats) {
  let index = 0;

  while (Date.now() < deadline) {
    const path = PUBLIC_GET_PATHS[index % PUBLIC_GET_PATHS.length];
    index += 1;

    const result = await fetchOnce(path);
    stats.requests += 1;

    if (result.ok) {
      stats.success += 1;
    } else {
      stats.failures += 1;
    }

    stats.latencies.push(result.elapsedMs);

    const bucket = stats.byPath[path] || createPathBucket();
    bucket.requests += 1;

    if (result.ok) {
      bucket.success += 1;
    } else {
      bucket.failures += 1;
    }

    bucket.latencies.push(result.elapsedMs);
    recordStatus(bucket, result.status);

    if (result.errorType) {
      bucket.errors[result.errorType] += 1;
      stats.errors[result.errorType] += 1;
    }

    stats.byPath[path] = bucket;
  }
}

async function fetchHealthMemory() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${TARGET_URL}/api/health`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const payload = await response.json();
    return payload?.checks?.memory || payload?.memory || null;
  } catch {
    return null;
  }
}

async function main() {
  if (/hasanchartworld\.com/i.test(TARGET_URL) && process.env.ALLOW_PROD_LOAD_TEST !== "1") {
    console.error(
      "Refusing to load-test production. Set ALLOW_PROD_LOAD_TEST=1 only for controlled drills."
    );
    process.exit(1);
  }

  const memoryBefore = await fetchHealthMemory();

  const startedAtIso = new Date().toISOString();
  const deadline = Date.now() + DURATION_SEC * 1000;

  const stats = {
    requests: 0,
    success: 0,
    failures: 0,
    latencies: [],
    byPath: {},
    errors: {
      timeout: 0,
      connection: 0,
      other: 0,
    },
    statusCodes: {},
  };

  console.log(
    JSON.stringify(
      {
        event: "load-test:start",
        targetUrl: TARGET_URL,
        concurrency: CONCURRENCY,
        durationSec: DURATION_SEC,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        paths: PUBLIC_GET_PATHS,
        startedAt: startedAtIso,
        memoryBefore,
      },
      null,
      2
    )
  );

  const workers = Array.from({ length: CONCURRENCY }, () => workerLoop(deadline, stats));
  await Promise.all(workers);

  const memoryAfter = await fetchHealthMemory();
  const finishedAtIso = new Date().toISOString();

  for (const bucket of Object.values(stats.byPath)) {
    for (const [code, count] of Object.entries(bucket.statusCodes)) {
      stats.statusCodes[code] = (stats.statusCodes[code] || 0) + count;
    }
  }

  const routeSummaries = PUBLIC_GET_PATHS.map((path) =>
    summarizePathBucket(path, stats.byPath[path] || createPathBucket(), DURATION_SEC)
  );

  const overallSuccessRate =
    stats.requests > 0 ? Number(((stats.success / stats.requests) * 100).toFixed(2)) : 0;

  const summary = {
    event: "load-test:summary",
    targetUrl: TARGET_URL,
    concurrency: CONCURRENCY,
    durationSec: DURATION_SEC,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    startedAt: startedAtIso,
    finishedAt: finishedAtIso,
    totalRequests: stats.requests,
    success: stats.success,
    failures: stats.failures,
    successRatePct: overallSuccessRate,
    rps: Number((stats.requests / DURATION_SEC).toFixed(2)),
    latencyMs: {
      avg: Math.round(average(stats.latencies)),
      p50: Math.round(percentile(stats.latencies, 50)),
      p95: Math.round(percentile(stats.latencies, 95)),
      p99: Math.round(percentile(stats.latencies, 99)),
      max: Math.round(Math.max(...stats.latencies, 0)),
    },
    statusCodes: stats.statusCodes,
    errors: stats.errors,
    memoryBefore,
    memoryAfter,
    routes: routeSummaries,
  };

  console.log(JSON.stringify(summary, null, 2));

  const hasServerErrors = Object.keys(stats.statusCodes).some((code) => {
    const numeric = Number(code);
    return numeric >= 500 && numeric < 600;
  });

  if (stats.failures > 0 || hasServerErrors || overallSuccessRate < 99) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
