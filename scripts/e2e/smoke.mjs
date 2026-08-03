#!/usr/bin/env node
/**
 * Production-safe smoke test runner for HasaN CharT World (Enterprise v2).
 *
 * Usage:
 *   npm run smoke:local
 *   npm run smoke:staging
 *   npm run smoke:production
 *   npm run smoke -- https://custom.example.com
 *
 * Safety: never accepts/rejects subscriptions, sends email, or triggers financial actions.
 */
import { runVisualAndPerfCapture } from "./browser-runner.mjs";
import { loadE2eEnv } from "./env.mjs";
import { HttpClient, sleep } from "./http.mjs";
import { collectRunMetadata } from "./metadata.mjs";
import { createRunPaths } from "./paths.mjs";
import { SmokeReporter } from "./report.mjs";
import { retryOnceOnTimeout } from "./retry.mjs";
import {
  E2E_MARKERS,
  E2E_USER_USERNAME,
  INSTANT_ANALYSIS_POLL_MS,
  INSTANT_ANALYSIS_TIMEOUT_MS,
  ORDER_BOOK_POLL_MS,
  ORDER_BOOK_WARMUP_MS,
  SMOKE_JPEG,
} from "./constants.mjs";
import { assertSmokeSubscriptionRow, assertSafeAction, isE2eMarkedRow } from "./safety.mjs";

const cliBase = process.argv[2];
const env = loadE2eEnv();
const BASE = (cliBase || env.baseUrl).replace(/\/$/, "");
const runPaths = createRunPaths();
const metadata = collectRunMetadata({
  baseUrl: BASE,
  environment: cliBase ? "custom-cli" : env.environment,
});
const reporter = new SmokeReporter(BASE, { runPaths, metadata });

function blocked(step, reason) {
  return { status: "BLOCKED", note: reason };
}

function verifyOnly(note) {
  return { status: "VERIFY_ONLY", note };
}

function manual(note) {
  return { status: "MANUAL_REQUIRED", note };
}

function pass(note) {
  return { status: "PASS", note };
}

function buildOrderBookQuery() {
  const params = new URLSearchParams({
    symbol: "BTCUSDT",
    mode: "aggregated",
    levels: "50",
    liquidityRange: "0.5",
    flowWindow: "3600000",
    dominanceWindow: "3600000",
    largeTradeWindow: "3600000",
    largeTradeThreshold: "50000",
  });
  return params.toString();
}

async function pollInstantAnalysisJob(client, jobId) {
  const deadline = Date.now() + INSTANT_ANALYSIS_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { res, data } = await client.json(`/api/instant-analysis/${encodeURIComponent(jobId)}`);
    const status = String(data?.status || "").toLowerCase();
    if (res.status === 200 && status === "completed" && data?.result) {
      return data;
    }
    if (status === "failed") {
      throw new Error(`instant analysis job failed: ${data?.error || "unknown"}`);
    }
    await sleep(INSTANT_ANALYSIS_POLL_MS);
  }
  throw new Error("instant analysis job timeout");
}

async function runSubscriptionUpload(client) {
  const init = await client.json("/api/subscription-request/init", {
    method: "POST",
    body: {
      username: E2E_USER_USERNAME,
      plan_name: E2E_MARKERS.planNote,
      category: "Spot",
      price: "1",
      telegram_username: E2E_MARKERS.telegram,
      payment_network: "TRC20",
    },
  });

  if (!init.data?.success) {
    throw new Error(`init failed: ${init.res.status} ${init.data?.error || init.data?.errorCode || ""}`);
  }

  const sessionId = init.data.sessionId;
  reporter.track("sessionId", sessionId);

  const auth = await client.json("/api/subscription-request/upload-authorize", {
    method: "POST",
    body: { sessionId, mimeType: "image/jpeg", sizeBytes: SMOKE_JPEG.length },
  });

  if (!auth.data?.success) {
    throw new Error(`authorize failed: ${auth.data?.errorCode || auth.data?.error}`);
  }

  const put = await fetch(auth.data.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: SMOKE_JPEG,
  });
  if (!put.ok) throw new Error(`signed PUT failed: ${put.status}`);

  reporter.track("objectPath", auth.data.objectPath);

  const fin = await client.json("/api/subscription-request/finalize", {
    method: "POST",
    body: { sessionId, objectPath: auth.data.objectPath, mimeType: "image/jpeg" },
  });

  if (!fin.data?.success) {
    throw new Error(`finalize failed: ${fin.data?.errorCode || fin.data?.error}`);
  }

  reporter.track("requestId", fin.data.requestId);
  return {
    requestId: fin.data.requestId,
    sessionId,
    objectPath: auth.data.objectPath,
    duplicate: fin.data.duplicate === true,
  };
}

async function checkOrderBookSnapshot(base) {
  const client = new HttpClient(base);
  const query = buildOrderBookQuery();
  const deadline = Date.now() + ORDER_BOOK_WARMUP_MS;
  let last = null;

  while (Date.now() < deadline) {
    const { res, data } = await client.json(`/api/market-depth/snapshot?${query}`);
    last = data;
    if (
      res.status === 200 &&
      data?.success !== false &&
      Number(data?.connectedExchangeCount) > 0 &&
      Array.isArray(data?.bids) &&
      data.bids.length > 0
    ) {
      return pass(
        `${data.connectedExchangeCount}/${data.expectedExchangeCount || 3} connected bids=${data.bids.length} price=${data.lastPrice}`
      );
    }
    await sleep(ORDER_BOOK_POLL_MS);
  }

  throw new Error(
    `order book not ready within ${ORDER_BOOK_WARMUP_MS}ms connected=${last?.connectedExchangeCount || 0}`
  );
}

async function checkMarketStream(base) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ORDER_BOOK_WARMUP_MS);
  try {
    const query = buildOrderBookQuery();
    const res = await fetch(`${base}/api/market-depth/stream?${query}`, {
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`stream HTTP ${res.status}`);

    const reader = res.body?.getReader();
    if (!reader) throw new Error("stream body missing");

    const decoder = new TextDecoder();
    let buffer = "";
    const deadline = Date.now() + ORDER_BOOK_WARMUP_MS;

    while (Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.includes("connectedExchangeCount") || buffer.includes('"bids"')) {
        return pass("SSE market stream received depth payload");
      }
    }
    throw new Error("market stream timeout — no depth payload");
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

(async () => {
  console.log(`\n=== HasaN CharT World Smoke Test (Enterprise v2) ===`);
  console.log(`Target: ${BASE}`);
  console.log(`Environment: ${metadata.environment}`);
  console.log(`Run ID: ${runPaths.runId}`);
  console.log(`User creds: ${env.hasUserCredentials ? "present" : "missing"}`);
  console.log(`Admin creds: ${env.hasAdminCredentials ? "present" : "missing"}\n`);

  await reporter.runStep("health", "Health endpoints", async () => {
    const { res, data } = await new HttpClient(BASE).json("/api/health");
    if (res.status !== 200 || data?.status !== "ok") {
      throw new Error(`/api/health ${res.status}`);
    }
    const ia = await new HttpClient(BASE).json("/api/instant-analysis/health");
    if (ia.res.status !== 200 || !ia.data?.configured) {
      throw new Error(`/api/instant-analysis/health not configured`);
    }
    return pass(`commit=${String(data?.build?.commit || "").slice(0, 7)} readiness=${data?.readiness}`);
  });

  const userClient = new HttpClient(BASE);
  let adminClient = new HttpClient(BASE);
  let subscriptionRequestId = null;

  await reporter.runStep("login-user", "Login user", async () => {
    if (!env.hasUserCredentials) return blocked("E2E_USER_EMAIL/PASS missing");
    const user = await userClient.login(env.userEmail, env.userPass);
    reporter.track("userId", user?.id);
    const session = await userClient.session();
    if (session.res.status !== 200 || !session.data?.authenticated) {
      throw new Error("session not authenticated after login");
    }
    return pass(`userId=${user?.id}`);
  });

  await reporter.runStep("dashboard", "Dashboard / session", async () => {
    if (!env.hasUserCredentials) return blocked("credentials missing");
    const page = await userClient.fetch("/my-dashboard");
    if (page.status !== 200) throw new Error(`/my-dashboard ${page.status}`);
    const session = await userClient.session();
    if (!session.data?.authenticated) throw new Error("session lost");
    return pass("my-dashboard 200, session ok");
  });

  await reporter.runStep("instant-analysis", "Instant Analysis (1h BTCUSDT)", async () => {
    if (!env.hasUserCredentials) return blocked("credentials missing");

    const availability = await userClient.json("/api/instant-analysis/availability");
    if (availability.res.status !== 200) {
      throw new Error(`availability ${availability.res.status}`);
    }

    const allowed = availability.data?.allowed !== false;
    if (!allowed && !env.instantAnalysisAllowPost) {
      return verifyOnly(`cooldown active retryAfter=${availability.data?.retryAfterSeconds || "?"}s`);
    }

    if (!allowed) {
      return verifyOnly("cooldown active — POST skipped (safety)");
    }

    const post = await userClient.json("/api/instant-analysis", {
      method: "POST",
      body: { symbol: "BTCUSDT", timeframe: "1h", source: "e2e-smoke" },
    });

    if (post.res.status === 429) {
      return verifyOnly(`cooldown 429 retryAfter=${post.data?.retryAfterSeconds || "?"}`);
    }

    if (post.res.status !== 200 || !post.data?.success) {
      throw new Error(`POST failed ${post.res.status} ${post.data?.code || post.data?.error || ""}`);
    }

    let result = post.data?.result;
    const jobId = post.data?.jobId;

    if (jobId) {
      reporter.track("jobId", jobId);
      const polled = await pollInstantAnalysisJob(userClient, jobId);
      result = polled.result;
    }

    const tf =
      result?.meta?.executionTimeframe ||
      result?.result?.meta?.executionTimeframe ||
      result?.executionTimeframe;
    if (tf && tf !== "1h") {
      throw new Error(`expected executionTimeframe=1h got ${tf}`);
    }
    if (!result) throw new Error("missing analysis result");

    return pass(`job=${jobId || "inline"} tf=${tf || "1h"}`);
  });

  await reporter.runStep("cooldown", "Instant Analysis cooldown block", async () => {
    if (!env.hasUserCredentials) return blocked("credentials missing");
    const second = await userClient.json("/api/instant-analysis", {
      method: "POST",
      body: { symbol: "BTCUSDT", timeframe: "1h", source: "e2e-smoke" },
    });
    if (second.res.status === 429 || second.data?.code === "INSTANT_ANALYSIS_COOLDOWN") {
      return pass(`blocked as expected retryAfter=${second.data?.retryAfterSeconds || "?"}`);
    }
    if (second.res.status === 200 && second.data?.success) {
      return verifyOnly("second POST accepted — unexpected, review cooldown policy");
    }
    return pass(`status=${second.res.status}`);
  });

  await reporter.runStep("subscription-upload", "Subscription proof upload (E2E)", async () => {
    if (!env.hasUserCredentials) return blocked("credentials missing");
    const gate = assertSafeAction("subscription.accept");
    if (!gate.allowed) return verifyOnly(gate.reason);

    const upload = await runSubscriptionUpload(userClient);
    subscriptionRequestId = upload.requestId;

    if (upload.duplicate) {
      return pass(`duplicate finalize ok requestId=${upload.requestId}`);
    }
    return pass(`requestId=${upload.requestId} path=${upload.objectPath?.slice(0, 48)}...`);
  });

  await reporter.runStep("admin-login", "Admin login", async () => {
    if (!env.hasAdminCredentials) return blocked("E2E_ADMIN_EMAIL/PASS missing");
    adminClient = new HttpClient(BASE);
    const admin = await adminClient.login(env.adminEmail, env.adminPass);
    reporter.track("userId", admin?.id);
    const dash = await adminClient.json("/api/admin/dashboard?section=overview");
    if (dash.res.status === 401) throw new Error("admin dashboard 401");
    return pass(`adminId=${admin?.id}`);
  });

  await reporter.runStep("admin-pending", "Admin pending E2E requests", async () => {
    if (!env.hasAdminCredentials) return blocked("credentials missing");
    const dash = await adminClient.json("/api/admin/dashboard?section=subscriptions&limit=100");
    if (dash.res.status !== 200) throw new Error(`admin subscriptions ${dash.res.status}`);

    const items =
      dash.data?.subscriptions?.items || dash.data?.subscriptions || dash.data?.items || [];

    const smokeRows = (Array.isArray(items) ? items : []).filter(isE2eMarkedRow);
    if (subscriptionRequestId) {
      const found = smokeRows.some((row) => row.id === subscriptionRequestId);
      if (!found) {
        return verifyOnly(`request ${subscriptionRequestId} not in first page — search manually`);
      }
    }

    if (!smokeRows.length && !subscriptionRequestId) {
      return verifyOnly("no E2E-marked pending rows visible");
    }

    return pass(`e2eRows=${smokeRows.length}${subscriptionRequestId ? ` includes ${subscriptionRequestId}` : ""}`);
  });

  await reporter.runStep("admin-proof", "Admin signed proof URL", async () => {
    if (!env.hasAdminCredentials) return blocked("credentials missing");
    if (!subscriptionRequestId) return verifyOnly("no requestId from upload step");

    const proof = await adminClient.json(
      `/api/admin/financial-center/payment-proof/${subscriptionRequestId}`
    );
    if (proof.res.status !== 200 || !proof.data?.success) {
      throw new Error(`payment-proof ${proof.res.status}`);
    }
    if (!proof.data?.signedUrl) throw new Error("missing signedUrl");
    return pass("signed URL returned (VERIFY ONLY — not accepted)");
  });

  await reporter.runStep("notifications", "User notifications feed", async () => {
    if (!env.hasUserCredentials) return blocked("credentials missing");
    const { res, data } = await userClient.json("/api/my-notifications?limit=20");
    if (res.status !== 200) throw new Error(`notifications ${res.status}`);
    const count = Array.isArray(data?.notifications) ? data.notifications.length : 0;
    return pass(`notifications=${count}`);
  });

  await reporter.runStep("news", "News API", async () => {
    const result = await retryOnceOnTimeout(
      async () => {
        const { res, data } = await new HttpClient(BASE).json("/api/news?limit=5");
        if (res.status !== 200 || !data?.success) throw new Error(`news ${res.status}`);
        const count = Array.isArray(data.items) ? data.items.length : 0;
        if (count < 1) return verifyOnly("zero news items");
        return pass(`items=${count}`);
      },
      { label: "news" }
    );
    return result;
  });

  await reporter.runStep("order-book", "Order book snapshot + warmup", async () => {
    const result = await retryOnceOnTimeout(() => checkOrderBookSnapshot(BASE), { label: "order-book" });
    return result;
  });

  await reporter.runStep("market-stream", "Market depth SSE stream", async () => {
    const result = await retryOnceOnTimeout(() => checkMarketStream(BASE), { label: "market-stream" });
    return result;
  });

  await reporter.runStep("theme", "Theme markup (public pages)", async () => {
    const res = await new HttpClient(BASE).fetch("/");
    const html = await res.text();
    if (!html.includes("data-theme")) {
      return manual("data-theme not found in HTML — verify dark/light in browser");
    }
    return pass("data-theme present in homepage HTML");
  });

  await reporter.runStep("visual-regression", "Visual regression + performance capture", async () => {
    const visual = await runVisualAndPerfCapture({
      baseUrl: BASE,
      runPaths,
      clients: { user: userClient, admin: adminClient },
      hasAdminCredentials: env.hasAdminCredentials,
    });
    reporter.setVisualResult(visual, runPaths);

    if (visual.status === "BLOCKED") return blocked(visual.note);
    if (visual.visualRegressions?.length) {
      return { status: "FAIL", note: visual.note };
    }
    if (visual.status === "FAIL") {
      return { status: "FAIL", note: visual.note };
    }
    return pass(visual.note);
  });

  await reporter.runStep("logout", "User logout", async () => {
    if (!env.hasUserCredentials) return blocked("credentials missing");
    const out = await userClient.logout();
    if (out.res.status !== 200) throw new Error(`logout ${out.res.status}`);
    const session = await userClient.session();
    if (session.data?.authenticated) {
      return verifyOnly("session still authenticated after logout — check cookie clearing");
    }
    return pass("session cleared");
  });

  reporter.printReport();
  reporter.writeReports();

  const verdict = reporter.verdict();
  process.exit(verdict === "NO-GO" ? 1 : 0);
})().catch((error) => {
  console.error("\nSmoke runner crashed:", error?.message || error);
  reporter.printReport();
  try {
    reporter.writeReports();
  } catch {
    reporter.writeArtifactsFile(env.root);
  }
  process.exit(1);
});
