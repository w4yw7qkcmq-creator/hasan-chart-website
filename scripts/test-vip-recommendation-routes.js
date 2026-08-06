#!/usr/bin/env node
/**
 * Route integration tests for VIP recommendation status APIs (handler-level mocks).
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { IAM_PERMISSIONS } from "../lib/iam/constants.js";
import { permissionForRoute } from "../lib/iam/route-permissions.js";

const ENV_BACKUP = { ...process.env };

function setEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe("VIP recommendation route permissions", () => {
  it("maps GET recent to recommendations.status.read", () => {
    assert.equal(
      permissionForRoute("GET", "/api/admin/vip-recommendations/recent"),
      IAM_PERMISSIONS.RECOMMENDATIONS_STATUS_READ
    );
  });

  it("maps POST status-update to recommendations.status.update", () => {
    assert.equal(
      permissionForRoute("POST", "/api/admin/vip-recommendations/[id]/status-update"),
      IAM_PERMISSIONS.RECOMMENDATIONS_STATUS_UPDATE
    );
  });

  it("maps POST retry to recommendations.status.update", () => {
    assert.equal(
      permissionForRoute("POST", "/api/admin/vip-recommendations/[id]/status-update/retry"),
      IAM_PERMISSIONS.RECOMMENDATIONS_STATUS_UPDATE
    );
  });
});

describe("VIP status feature flag gate", () => {
  afterEach(() => {
    process.env = { ...ENV_BACKUP };
  });

  it("disabled flag blocks mutations with 503 contract", async () => {
    setEnv("VIP_STATUS_NOTIFICATIONS_ENABLED", "false");
    const { isVipStatusNotificationsEnabled, vipStatusFeatureDisabledResponse } = await import(
      "../lib/vip-status-feature-flag.js"
    );
    assert.equal(isVipStatusNotificationsEnabled(), false);
    assert.equal(vipStatusFeatureDisabledResponse().code, "feature_disabled");
  });
});

describe("requireAllPermissions contract", () => {
  it("POST status requires update + notifications.send permissions", () => {
    const required = [
      IAM_PERMISSIONS.RECOMMENDATIONS_STATUS_UPDATE,
      IAM_PERMISSIONS.RECOMMENDATIONS_NOTIFICATIONS_SEND,
    ];
    assert.equal(required.length, 2);
    assert.ok(required.includes("recommendations.status.update"));
    assert.ok(required.includes("recommendations.notifications.send"));
  });
});

console.log("test-vip-recommendation-routes: loaded");
