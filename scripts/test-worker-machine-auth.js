#!/usr/bin/env node
/**
 * Worker HTTP machine identity tests — dual-mode auth, origin bypass closed, pepper enforcement.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it, beforeEach, afterEach } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);

const machineAuth = require("../worker/lib/machine-auth.js");
const workerSecurity = require("../worker/worker-security.js");
const workerIndexSource = readFileSync("worker/index.js", "utf8");
const workerSecuritySource = readFileSync("worker/worker-security.js", "utf8");
const instantAnalysisWorkerSource = readFileSync("lib/instant-analysis-worker.js", "utf8");

const ENV_BACKUP = { ...process.env };
const TEST_PEPPER = "test-pepper-with-at-least-32-characters-long";
const PRODUCTION_PEPPER = "production-grade-pepper-value-32chars-minimum-ok";

const PRICE_ALERT_GUARD_FILES = [
  "worker/index.js",
  "worker/price-alert-email.js",
  "worker/push-sender.js",
  "worker/create-user-notification.js",
  "worker/notification-delivery-gate.js",
];

const PRICE_ALERT_GUARD_MARKERS = {
  "worker/index.js": [
    "async function checkPriceAlerts()",
    "async function deliverRealPriceAlert(",
    "setInterval(checkPriceAlerts, CHECK_INTERVAL_MS)",
  ],
  "worker/price-alert-email.js": ["sendPriceAlertEmail"],
  "worker/push-sender.js": ["sendPriceAlertPushNotifications"],
  "worker/create-user-notification.js": ["createUserNotification"],
  "worker/notification-delivery-gate.js": ["evaluateDeliveryForRecipient"],
};

function mockReq(headers = {}) {
  return {
    headers: Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
    ),
    socket: { remoteAddress: "127.0.0.1" },
  };
}

function mockSupabaseAccount({ account, permissions = [], failPermissions = false }) {
  return {
    from(table) {
      if (table === "iam_service_accounts") {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: account, error: null };
                  },
                };
              },
            };
          },
          update() {
            return {
              eq() {
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }

      if (table === "iam_service_account_permissions") {
        return {
          select() {
            return {
              eq() {
                if (failPermissions) {
                  return Promise.resolve({ data: null, error: { message: "perm fail" } });
                }
                return Promise.resolve({ data: permissions, error: null });
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

function fileChecksum(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("Price alert isolation guard", () => {
  it("scheduler and notification pipeline markers unchanged", () => {
    for (const [path, markers] of Object.entries(PRICE_ALERT_GUARD_MARKERS)) {
      const source = readFileSync(path, "utf8");
      for (const marker of markers) {
        assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      }
    }
    assert.doesNotMatch(workerSecuritySource, /checkPriceAlerts/);
    assert.doesNotMatch(workerSecuritySource, /deliverRealPriceAlert/);
  });

  it("records checksums for price alert guard files", () => {
    for (const path of PRICE_ALERT_GUARD_FILES) {
      assert.equal(typeof fileChecksum(path), "string");
      assert.equal(fileChecksum(path).length, 64);
    }
  });
});

describe("Pepper enforcement", () => {
  afterEach(() => {
    process.env = { ...ENV_BACKUP };
  });

  it("missing pepper in production-like env → misconfigured", () => {
    process.env.NODE_ENV = "production";
    delete process.env.IAM_SERVICE_SECRET_PEPPER;
    const state = machineAuth.requireServiceSecretPepper();
    assert.equal(state.ok, false);
    assert.equal(state.misconfigured, true);
  });

  it("placeholder pepper in production-like env → misconfigured", () => {
    process.env.NODE_ENV = "production";
    process.env.IAM_SERVICE_SECRET_PEPPER = machineAuth.DEV_TEST_PEPPER;
    const state = machineAuth.requireServiceSecretPepper();
    assert.equal(state.ok, false);
  });

  it("valid pepper in production-like env → configured", () => {
    process.env.NODE_ENV = "production";
    process.env.IAM_SERVICE_SECRET_PEPPER = PRODUCTION_PEPPER;
    const state = machineAuth.requireServiceSecretPepper();
    assert.equal(state.ok, true);
    assert.equal(state.configured, true);
  });

  it("missing pepper in test env uses explicit test fallback", () => {
    process.env.NODE_ENV = "test";
    delete process.env.IAM_SERVICE_SECRET_PEPPER;
    const state = machineAuth.requireServiceSecretPepper();
    assert.equal(state.ok, true);
    assert.equal(state.testFallback, true);
  });
});

describe("verifyMachineIdentityWithClient", () => {
  const secret = "machine-secret-123";
  const accountId = "instant-analysis-worker";
  let hash;

  const baseAccount = {
    id: accountId,
    label: "Instant Analysis Worker",
    secret_hash: null,
    enabled: true,
    revoked_at: null,
  };

  const permissions = [{ permission_id: "analysis.manage", effect: "allow" }];

  beforeEach(() => {
    process.env = { ...ENV_BACKUP, NODE_ENV: "test", IAM_SERVICE_SECRET_PEPPER: TEST_PEPPER };
    hash = machineAuth.hashServiceSecret(secret, accountId);
    baseAccount.secret_hash = hash;
  });

  afterEach(() => {
    process.env = { ...ENV_BACKUP };
  });

  it("correct secret passes", async () => {
    const sb = mockSupabaseAccount({ account: baseAccount, permissions });
    const result = await machineAuth.verifyMachineIdentityWithClient(
      sb,
      mockReq({
        "x-service-account-id": accountId,
        "x-service-account-secret": secret,
      })
    );
    assert.equal(result.ok, true);
  });

  it("wrong secret hard fails", async () => {
    const sb = mockSupabaseAccount({ account: baseAccount, permissions });
    const result = await machineAuth.verifyMachineIdentityWithClient(
      sb,
      mockReq({
        "x-service-account-id": accountId,
        "x-service-account-secret": "wrong-secret",
      })
    );
    assert.equal(result.hardFail, true);
    assert.equal(result.status, 401);
  });

  it("disabled account rejected", async () => {
    const sb = mockSupabaseAccount({
      account: { ...baseAccount, enabled: false },
      permissions,
    });
    const result = await machineAuth.verifyMachineIdentityWithClient(
      sb,
      mockReq({
        "x-service-account-id": accountId,
        "x-service-account-secret": secret,
      })
    );
    assert.equal(result.status, 403);
  });

  it("revoked account rejected", async () => {
    const sb = mockSupabaseAccount({
      account: { ...baseAccount, revoked_at: new Date().toISOString() },
      permissions,
    });
    const result = await machineAuth.verifyMachineIdentityWithClient(
      sb,
      mockReq({
        "x-service-account-id": accountId,
        "x-service-account-secret": secret,
      })
    );
    assert.equal(result.status, 403);
  });

  it("missing permission rejected", async () => {
    const sb = mockSupabaseAccount({
      account: baseAccount,
      permissions: [{ permission_id: "system.cron.read", effect: "allow" }],
    });
    const result = await machineAuth.verifyMachineIdentityWithClient(
      sb,
      mockReq({
        "x-service-account-id": accountId,
        "x-service-account-secret": secret,
      })
    );
    assert.equal(result.status, 403);
  });

  it("cross-service account id rejected", async () => {
    const result = await machineAuth.verifyMachineIdentityWithClient(
      mockSupabaseAccount({ account: baseAccount, permissions }),
      mockReq({
        "x-service-account-id": "cron",
        "x-service-account-secret": secret,
      })
    );
    assert.equal(result.status, 403);
  });

  it("missing pepper in production returns 503", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.IAM_SERVICE_SECRET_PEPPER;
    const result = await machineAuth.verifyMachineIdentityWithClient(
      mockSupabaseAccount({ account: baseAccount, permissions }),
      mockReq({
        "x-service-account-id": accountId,
        "x-service-account-secret": secret,
      })
    );
    assert.equal(result.status, 503);
    assert.equal(result.misconfigured, true);
  });

  it("supabase permission error returns 503", async () => {
    const sb = mockSupabaseAccount({
      account: baseAccount,
      permissions,
      failPermissions: true,
    });
    const result = await machineAuth.verifyMachineIdentityWithClient(
      sb,
      mockReq({
        "x-service-account-id": accountId,
        "x-service-account-secret": secret,
      })
    );
    assert.equal(result.status, 503);
  });

  it("header alias conflict hard fails", async () => {
    const result = await machineAuth.verifyMachineIdentityWithClient(
      mockSupabaseAccount({ account: baseAccount, permissions }),
      mockReq({
        "x-service-account-id": accountId,
        "x-iam-service-id": "cron",
        "x-service-account-secret": secret,
      })
    );
    assert.equal(result.hardFail, true);
    assert.equal(result.status, 401);
  });

  it("incomplete machine headers hard fail", async () => {
    const result = await machineAuth.verifyMachineIdentityWithClient(
      mockSupabaseAccount({ account: baseAccount, permissions }),
      mockReq({ "x-service-account-id": accountId })
    );
    assert.equal(result.hardFail, true);
    assert.equal(result.status, 401);
  });
});

describe("verifyWorkerApiAccess dual mode", () => {
  const legacySecret = "legacy-worker-secret";
  const accountId = "instant-analysis-worker";
  const machineSecret = "machine-secret-abc";
  let hash;

  beforeEach(() => {
    process.env = {
      ...ENV_BACKUP,
      NODE_ENV: "test",
      IAM_SERVICE_SECRET_PEPPER: TEST_PEPPER,
      IAM_WORKER_AUTH: "true",
      IAM_WORKER_LEGACY_FALLBACK: "true",
      WORKER_API_SECRET: legacySecret,
      CRON_SECRET: "cron-shared-secret",
    };
    hash = machineAuth.hashServiceSecret(machineSecret, accountId);
    machineAuth.resetWorkerAuthMetrics();
    workerSecurity.resetWorkerAuthMetrics();
    machineAuth.setSupabaseAdmin(
      mockSupabaseAccount({
        account: {
          id: accountId,
          secret_hash: hash,
          enabled: true,
          revoked_at: null,
        },
        permissions: [{ permission_id: "analysis.manage", effect: "allow" }],
      })
    );
  });

  afterEach(() => {
    machineAuth.resetSupabaseAdmin();
    process.env = { ...ENV_BACKUP };
  });

  it("correct machine secret → allow", async () => {
    const result = await workerSecurity.verifyWorkerApiAccess(
      mockReq({
        "x-service-account-id": accountId,
        "x-service-account-secret": machineSecret,
      })
    );
    assert.equal(result.ok, true);
    assert.equal(result.mode, "machine");
  });

  it("wrong machine + valid legacy → denied", async () => {
    const result = await workerSecurity.verifyWorkerApiAccess(
      mockReq({
        "x-service-account-id": accountId,
        "x-service-account-secret": "wrong",
        authorization: `Bearer ${legacySecret}`,
      })
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
  });

  it("correct legacy with no machine headers → allow", async () => {
    const result = await workerSecurity.verifyWorkerApiAccess(
      mockReq({ authorization: `Bearer ${legacySecret}` })
    );
    assert.equal(result.ok, true);
    assert.equal(result.mode, "legacy");
  });

  it("wrong legacy → deny", async () => {
    const result = await workerSecurity.verifyWorkerApiAccess(
      mockReq({ authorization: "Bearer wrong-legacy" })
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
  });

  it("allowed Origin only → deny", async () => {
    const result = await workerSecurity.verifyWorkerApiAccess(
      mockReq({ origin: "https://www.hasanchartworld.com" })
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
    assert.equal(workerSecurity.getWorkerAuthMetrics().originRejected, 1);
  });

  it("spoofed Referer only → deny", async () => {
    const result = await workerSecurity.verifyWorkerApiAccess(
      mockReq({ referer: "https://www.hasanchartworld.com/admin" })
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
  });

  it("cookie only → deny", async () => {
    const result = await workerSecurity.verifyWorkerApiAccess(
      mockReq({ cookie: "hc_access_token=fake-session-token" })
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
  });

  it("origin + cookie only → deny", async () => {
    const result = await workerSecurity.verifyWorkerApiAccess(
      mockReq({
        origin: "https://www.hasanchartworld.com",
        cookie: "hc_access_token=fake-session-token",
      })
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
  });

  it("health metrics contain originRejected not origin success", () => {
    const machineAuthSource = readFileSync("worker/lib/machine-auth.js", "utf8");
    assert.doesNotMatch(workerSecuritySource, /recordAuthMetric\("origin"\)/);
    assert.doesNotMatch(workerSecuritySource, /mode:\s*"origin"/);
    assert.match(machineAuthSource, /originRejected/);
    const metrics = workerSecurity.getWorkerAuthMetrics();
    assert.equal(typeof metrics.originRejected, "number");
    assert.equal(metrics.origin, undefined);
  });

  it("health output shape has no secrets", () => {
    const metrics = workerSecurity.getWorkerAuthMetrics();
    const blob = JSON.stringify(metrics);
    assert.doesNotMatch(blob, /secret/i);
    assert.doesNotMatch(blob, /Bearer/i);
    assert.doesNotMatch(blob, /authorization/i);
    assert.equal(typeof metrics.machineAuthConfigured, "boolean");
    assert.equal(typeof metrics.legacyFallbackEnabled, "boolean");
    assert.match(workerIndexSource, /workerHttpAuth:\s*getWorkerAuthMetrics\(\)/);
  });

  it("replay of same valid static secret remains allowed by design", async () => {
    const first = await workerSecurity.verifyWorkerApiAccess(
      mockReq({ authorization: `Bearer ${legacySecret}` })
    );
    const second = await workerSecurity.verifyWorkerApiAccess(
      mockReq({ authorization: `Bearer ${legacySecret}` })
    );
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
  });
});

describe("Website worker request headers", () => {
  it("prefers machine identity headers by default in source", () => {
    assert.match(instantAnalysisWorkerSource, /x-service-account-id/);
    assert.match(instantAnalysisWorkerSource, /IAM_INSTANT_ANALYSIS_WORKER_SECRET/);
  });

  it("keeps legacy bearer fallback when machine secret missing", () => {
    assert.match(instantAnalysisWorkerSource, /IAM_WORKER_LEGACY_FALLBACK/);
    assert.match(instantAnalysisWorkerSource, /Authorization.*Bearer/);
  });

  it("origin auth removed from worker security", () => {
    assert.doesNotMatch(workerSecuritySource, /mode:\s*"origin"/);
    assert.doesNotMatch(workerSecuritySource, /isAllowedBrowserOrigin\(req\)/);
  });
});

console.log("Worker HTTP machine identity tests loaded");
