#!/usr/bin/env node
/**
 * Tests for subscription-maintenance-cron-caller.js (no network, no secrets in output).
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { resolve } from "node:path";
import { test } from "node:test";

const ROOT = process.cwd();
const CALLER = resolve(ROOT, "worker/subscription-maintenance-cron-caller.js");
const VALID_SECRET = "a".repeat(48);

function startMockServer(handler) {
  return new Promise((resolvePromise, reject) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolvePromise({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((r) => {
            server.close(() => r());
          }),
      });
    });
    server.on("error", reject);
  });
}

function runCaller(env, mockBaseUrl) {
  return new Promise((resolvePromise) => {
    const child = spawn("node", [CALLER], {
      cwd: resolve(ROOT, "worker"),
      env: {
        ...process.env,
        SUBSCRIPTION_MAINTENANCE_API_URL: mockBaseUrl,
        IAM_SUBSCRIPTION_MAINTENANCE_SERVICE_ACCOUNT_ID: "subscription-maintenance-worker",
        IAM_SUBSCRIPTION_MAINTENANCE_SECRET: VALID_SECRET,
        SUBSCRIPTION_MAINTENANCE_DRY_RUN: "true",
        CRON_SECRET: "legacy-should-not-be-sent",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolvePromise({ code, stdout, stderr, combined: `${stdout}${stderr}` });
    });
  });
}

test("cron caller sends machine headers to /run?dryRun=true and exits 0", async () => {
  let requestCount = 0;
  let captured = null;
  const mock = await startMockServer(async (req, res) => {
    requestCount += 1;
    captured = {
      method: req.method,
      url: req.url,
      accountId: req.headers["x-service-account-id"],
      secret: req.headers["x-service-account-secret"],
      authorization: req.headers.authorization || "",
      cronHeader: req.headers["x-cron-secret"] || "",
    };
    res.writeHead(200, { "Content-Type": "application/json", "x-request-id": "mock-req-1" });
    res.end(JSON.stringify({ success: true, dryRun: true }));
  });

  const result = await runCaller({}, mock.baseUrl);
  await mock.close();

  assert.equal(result.code, 0);
  assert.equal(requestCount, 1);
  assert.equal(captured.method, "POST");
  assert.equal(captured.url, "/run?dryRun=true");
  assert.equal(captured.accountId, "subscription-maintenance-worker");
  assert.equal(captured.secret, VALID_SECRET);
  assert.equal(captured.authorization, "");
  assert.equal(captured.cronHeader, "");
  assert.match(result.combined, /subscription_maintenance_cron_call_success/);
  assert.doesNotMatch(result.combined, /CRON_SECRET/);
  assert.doesNotMatch(result.combined, new RegExp(VALID_SECRET));
});

test("cron caller exits 1 on HTTP 401", async () => {
  const mock = await startMockServer((_req, res) => {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Unauthorized" }));
  });

  const result = await runCaller({}, mock.baseUrl);
  await mock.close();
  assert.equal(result.code, 1);
  assert.match(result.combined, /subscription_maintenance_cron_call_failed/);
});

test("cron caller exits 1 on missing secret env", async () => {
  const mock = await startMockServer((_req, res) => {
    res.writeHead(200);
    res.end("{}");
  });

  const result = await runCaller({ IAM_SUBSCRIPTION_MAINTENANCE_SECRET: "" }, mock.baseUrl);
  await mock.close();
  assert.equal(result.code, 1);
  assert.match(result.combined, /IAM_SUBSCRIPTION_MAINTENANCE_SECRET is required/);
});

test("cron caller respects timeout", async () => {
  const mock = await startMockServer((_req, _res) => {
    // never respond
  });

  const result = await runCaller({ SUBSCRIPTION_MAINTENANCE_CALL_TIMEOUT_MS: "500" }, mock.baseUrl);
  await mock.close();
  assert.equal(result.code, 1);
  assert.match(result.combined, /request_timeout/);
});

console.log("subscription-maintenance cron caller tests scheduled");
