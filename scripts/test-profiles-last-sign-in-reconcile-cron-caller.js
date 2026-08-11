#!/usr/bin/env node
/**
 * Tests for profiles-last-sign-in-reconcile-cron-caller.js (no network to prod, no secrets in output).
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { resolve } from "node:path";
import { test } from "node:test";

const ROOT = process.cwd();
const CALLER = resolve(ROOT, "worker/profiles-last-sign-in-reconcile-cron-caller.js");
const VALID_SECRET = "b".repeat(48);
const VALID_ACCOUNT = "cron";

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
        NODE_ENV: "development",
        RAILWAY_ENVIRONMENT: "",
        PRODUCTION_URL: mockBaseUrl,
        WEB_APP_URL: "",
        IAM_CRON_SERVICE_ACCOUNT_ID: VALID_ACCOUNT,
        IAM_CRON_SERVICE_SECRET: VALID_SECRET,
        PROFILES_LAST_SIGN_IN_RECONCILE_TIMEOUT_MS: "",
        CRON_SECRET: "legacy-should-not-be-required",
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

function successBody(overrides = {}) {
  return {
    success: true,
    updatedCount: 0,
    eligibleAuthPopulated: 47,
    remainingMismatch: 0,
    ...overrides,
  };
}

test("success with mismatch 0 exits 0", async () => {
  const mock = await startMockServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(successBody()));
  });

  const result = await runCaller({}, mock.baseUrl);
  await mock.close();

  assert.equal(result.code, 0);
  assert.match(result.combined, /PROFILES_LAST_SIGN_IN_RECONCILE_SUCCESS/);
  assert.match(result.combined, /"remainingMismatch":0/);
});

test("updated > 0 with mismatch 0 exits 0", async () => {
  const mock = await startMockServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(successBody({ updatedCount: 3, eligibleAuthPopulated: 50 })));
  });

  const result = await runCaller({}, mock.baseUrl);
  await mock.close();

  assert.equal(result.code, 0);
  assert.match(result.combined, /"updated":3/);
  assert.match(result.combined, /PROFILES_LAST_SIGN_IN_RECONCILE_SUCCESS/);
});

test("mismatch > 0 exits 1", async () => {
  const mock = await startMockServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(successBody({ remainingMismatch: 2, updatedCount: 1 })));
  });

  const result = await runCaller({}, mock.baseUrl);
  await mock.close();

  assert.equal(result.code, 1);
  assert.match(result.combined, /PROFILES_LAST_SIGN_IN_RECONCILE_FAILED/);
});

test("missing URL exits 1", async () => {
  const mock = await startMockServer((_req, res) => {
    res.writeHead(200);
    res.end("{}");
  });

  const result = await runCaller({ PRODUCTION_URL: "", WEB_APP_URL: "" }, mock.baseUrl);
  await mock.close();

  assert.equal(result.code, 1);
  assert.match(result.combined, /missing_url/);
});

test("missing account id exits 1", async () => {
  const mock = await startMockServer((_req, res) => {
    res.writeHead(200);
    res.end("{}");
  });

  const result = await runCaller({ IAM_CRON_SERVICE_ACCOUNT_ID: "" }, mock.baseUrl);
  await mock.close();

  assert.equal(result.code, 1);
  assert.match(result.combined, /missing_service_account_id/);
});

test("missing secret exits 1", async () => {
  const mock = await startMockServer((_req, res) => {
    res.writeHead(200);
    res.end("{}");
  });

  const result = await runCaller(
    { IAM_CRON_SERVICE_SECRET: "", CRON_SECRET: "" },
    mock.baseUrl
  );
  await mock.close();

  assert.equal(result.code, 1);
  assert.match(result.combined, /missing_secret/);
});

test("HTTP 401 exits 1", async () => {
  const mock = await startMockServer((_req, res) => {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Unauthorized" }));
  });

  const result = await runCaller({}, mock.baseUrl);
  await mock.close();

  assert.equal(result.code, 1);
  assert.match(result.combined, /PROFILES_LAST_SIGN_IN_RECONCILE_FAILED/);
});

test("HTTP 403 exits 1", async () => {
  const mock = await startMockServer((_req, res) => {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Forbidden" }));
  });

  const result = await runCaller({}, mock.baseUrl);
  await mock.close();

  assert.equal(result.code, 1);
  assert.match(result.combined, /PROFILES_LAST_SIGN_IN_RECONCILE_FAILED/);
});

test("HTTP 429 exits 1", async () => {
  const mock = await startMockServer((_req, res) => {
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Too Many Requests" }));
  });

  const result = await runCaller({}, mock.baseUrl);
  await mock.close();

  assert.equal(result.code, 1);
  assert.match(result.combined, /PROFILES_LAST_SIGN_IN_RECONCILE_FAILED/);
});

test("HTTP 500 exits 1", async () => {
  const mock = await startMockServer((_req, res) => {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Server Error" }));
  });

  const result = await runCaller({}, mock.baseUrl);
  await mock.close();

  assert.equal(result.code, 1);
  assert.match(result.combined, /PROFILES_LAST_SIGN_IN_RECONCILE_FAILED/);
});

test("timeout/network error exits 1", async () => {
  const mock = await startMockServer((_req, _res) => {
    // never respond
  });

  const result = await runCaller({ PROFILES_LAST_SIGN_IN_RECONCILE_TIMEOUT_MS: "200" }, mock.baseUrl);
  await mock.close();

  assert.equal(result.code, 1);
  assert.match(result.combined, /timeout/);
}, 10000);

test("invalid JSON exits 1", async () => {
  const mock = await startMockServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("not-json");
  });

  const result = await runCaller({}, mock.baseUrl);
  await mock.close();

  assert.equal(result.code, 1);
  assert.match(result.combined, /invalid_json/);
});

test("no PII or secret logging", async () => {
  let requestCount = 0;
  const mock = await startMockServer(async (req, res) => {
    requestCount += 1;
    assert.equal(req.headers["x-service-account-secret"], VALID_SECRET);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        successBody({
          updatedCount: 1,
          eligibleAuthPopulated: 2,
        })
      )
    );
  });

  const result = await runCaller({}, mock.baseUrl);
  await mock.close();

  assert.equal(requestCount, 1);
  assert.equal(result.code, 0);
  assert.doesNotMatch(result.combined, new RegExp(VALID_SECRET));
  assert.doesNotMatch(result.combined, /@[a-z0-9.-]+\.[a-z]{2,}/i);
  assert.doesNotMatch(result.combined, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
});

test("one-shot exit behavior (single request)", async () => {
  let requestCount = 0;
  const mock = await startMockServer((_req, res) => {
    requestCount += 1;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(successBody()));
  });

  const result = await runCaller({}, mock.baseUrl);
  await mock.close();

  assert.equal(requestCount, 1);
  assert.equal(result.code, 0);
});

console.log("profiles-last-sign-in reconcile cron caller tests scheduled");
