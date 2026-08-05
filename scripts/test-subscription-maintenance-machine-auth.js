#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  verifyWorkerRouteAccess,
  verifyMachineIdentityWithClient,
  hashServiceSecret,
  resetWorkerAuthMetrics,
  setSupabaseAdmin,
  resetSupabaseAdmin,
  DEV_TEST_PEPPER,
} from "../worker/lib/machine-auth.js";
import { IAM_PERMISSIONS } from "../lib/iam/constants.js";

const accountId = "subscription-maintenance-worker";
const secret = "sub-maint-test-secret-0123456789";
let hash;

function mockSupabase({ enabled = true, revoked = false, permissions = [] } = {}) {
  return {
    from(table) {
      if (table === "iam_service_accounts") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: accountId,
                  label: accountId,
                  secret_hash: hash,
                  enabled,
                  revoked_at: revoked ? new Date().toISOString() : null,
                },
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      if (table === "iam_service_account_permissions") {
        return {
          select: () => ({
            eq: async () => ({ data: permissions, error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function req(headers = {}) {
  return { headers, socket: { remoteAddress: "127.0.0.1" } };
}

async function main() {
  process.env.IAM_SERVICE_SECRET_PEPPER = DEV_TEST_PEPPER;
  process.env.IAM_WORKER_AUTH = "true";
  process.env.IAM_WORKER_LEGACY_FALLBACK = "false";
  hash = hashServiceSecret(secret, accountId);
  setSupabaseAdmin(
    mockSupabase({
      permissions: [
        { permission_id: IAM_PERMISSIONS.SYSTEM_CRON_READ, effect: "allow" },
        { permission_id: IAM_PERMISSIONS.SUBSCRIPTIONS_READ, effect: "allow" },
        { permission_id: IAM_PERMISSIONS.SUBSCRIPTIONS_MANAGE, effect: "allow" },
      ],
    })
  );
  resetWorkerAuthMetrics();

  const ok = await verifyWorkerRouteAccess(req({
    "x-service-account-id": accountId,
    "x-service-account-secret": secret,
  }), {
    allowedServiceAccountIds: [accountId],
    requiredPermission: IAM_PERMISSIONS.SUBSCRIPTIONS_MANAGE,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.mode, "machine");

  const wrong = await verifyWorkerRouteAccess(req({
    "x-service-account-id": accountId,
    "x-service-account-secret": "wrong",
  }), {
    allowedServiceAccountIds: [accountId],
    requiredPermission: IAM_PERMISSIONS.SUBSCRIPTIONS_MANAGE,
  });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.status, 401);

  const cross = await verifyWorkerRouteAccess(req({
    "x-service-account-id": "instant-analysis-worker",
    "x-service-account-secret": secret,
  }), {
    allowedServiceAccountIds: [accountId],
    requiredPermission: IAM_PERMISSIONS.SUBSCRIPTIONS_MANAGE,
  });
  assert.equal(cross.ok, false);
  assert.equal(cross.status, 403);

  process.env.IAM_WORKER_LEGACY_FALLBACK = "true";
  process.env.CRON_SECRET = "legacy-cron-secret";
  const legacyDenied = await verifyWorkerRouteAccess(req({
    authorization: "Bearer legacy-cron-secret",
    "x-service-account-id": accountId,
    "x-service-account-secret": "wrong",
  }), {
    allowedServiceAccountIds: [accountId],
    requiredPermission: IAM_PERMISSIONS.SUBSCRIPTIONS_MANAGE,
  });
  assert.equal(legacyDenied.ok, false);

  const legacyOk = await verifyWorkerRouteAccess(req({
    authorization: "Bearer legacy-cron-secret",
  }), {
    allowedServiceAccountIds: [accountId],
    requiredPermission: IAM_PERMISSIONS.SUBSCRIPTIONS_MANAGE,
  });
  assert.equal(legacyOk.ok, true);
  assert.equal(legacyOk.mode, "legacy");

  resetSupabaseAdmin();
  console.log("subscription-maintenance machine-auth tests PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
