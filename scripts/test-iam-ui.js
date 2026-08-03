import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterAdminNavByPermission } from "../app/(app)/admin/components/admin-hub-config.js";
import { ADMIN_HUB_QUICK_NAV_ITEMS } from "../app/(app)/admin/components/admin-hub-config.js";
import {
  resolveAdminGatePhase,
  shouldRedirectAdminTo403,
  shouldRedirectAdminToLogin,
} from "../lib/admin-auth-guard.js";

describe("Admin nav permission filtering", () => {
  const can = (perm) => perm === "users.read" || perm === "dashboard.read";

  it("hides items without permission when IAM UI enabled", () => {
    const filtered = filterAdminNavByPermission(ADMIN_HUB_QUICK_NAV_ITEMS, can, {
      iamUiEnabled: true,
      isAdmin: true,
    });
    assert.ok(filtered.some((i) => i.id === "users"));
    assert.ok(!filtered.some((i) => i.id === "financial"));
  });

  it("shows all permissioned items for admin when IAM UI off", () => {
    const filtered = filterAdminNavByPermission(ADMIN_HUB_QUICK_NAV_ITEMS, () => false, {
      iamUiEnabled: false,
      isAdmin: true,
    });
    assert.ok(filtered.length >= ADMIN_HUB_QUICK_NAV_ITEMS.length - 1);
  });

  it("non-admin with IAM UI off gets only non-permission nav", () => {
    const filtered = filterAdminNavByPermission(ADMIN_HUB_QUICK_NAV_ITEMS, () => false, {
      iamUiEnabled: false,
      isAdmin: false,
    });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].href, "/alerts");
  });

  it("analyst with subscriptions.read only — no subscriptions nav tile (manage required)", () => {
    const analystCan = (perm) =>
      ["users.read", "analysis.read", "analysis.manage", "dashboard.read", "subscriptions.read"].includes(perm);
    const filtered = filterAdminNavByPermission(ADMIN_HUB_QUICK_NAV_ITEMS, analystCan, {
      iamUiEnabled: true,
      isAdmin: true,
    });
    const ids = filtered.map((i) => i.id).filter(Boolean);
    assert.ok(ids.includes("analysis"));
    assert.ok(ids.includes("users"));
    assert.ok(!ids.includes("subscriptions"));
    assert.ok(!ids.includes("financial"));
    assert.ok(!ids.includes("iam"));
  });
});

describe("AdminAccessGate IAM readiness regression", () => {
  it("profileReady=true + iamReady=false + legacy false → loading (no 403 redirect)", () => {
    const phase = resolveAdminGatePhase({
      authReady: true,
      authResolved: true,
      status: "authenticated",
      profileReady: true,
      isAuthenticated: true,
      isAdmin: false,
      iamReady: false,
      iamUiEnabled: true,
    });
    assert.equal(phase, "loading");
    assert.equal(shouldRedirectAdminTo403(phase), false);
  });

  it("iamReady=true + iam.isAdmin=true → authenticated", () => {
    const phase = resolveAdminGatePhase({
      authReady: true,
      authResolved: true,
      status: "authenticated",
      profileReady: true,
      isAuthenticated: true,
      isAdmin: false,
      iamReady: true,
      iamUiEnabled: true,
      iamIsAdmin: true,
    });
    assert.equal(phase, "authenticated");
  });

  it("iamReady=true + iam.isAdmin=false → unauthorized", () => {
    const phase = resolveAdminGatePhase({
      authReady: true,
      authResolved: true,
      status: "authenticated",
      profileReady: true,
      isAuthenticated: true,
      isAdmin: false,
      iamReady: true,
      iamUiEnabled: true,
      iamIsAdmin: false,
    });
    assert.equal(phase, "unauthorized");
  });

  it("unauthenticated → login redirect phase", () => {
    const phase = resolveAdminGatePhase({
      authReady: true,
      authResolved: true,
      status: "unauthenticated",
      profileReady: true,
      isAuthenticated: false,
      isAdmin: false,
      iamReady: true,
    });
    assert.equal(phase, "unauthenticated");
    assert.equal(shouldRedirectAdminToLogin(phase), true);
  });

  it("IAM error after load is fail-closed", () => {
    const phase = resolveAdminGatePhase({
      authReady: true,
      authResolved: true,
      status: "authenticated",
      profileReady: true,
      isAuthenticated: true,
      isAdmin: true,
      iamReady: true,
      iamUiEnabled: true,
      iamApiEnabled: true,
      iamError: true,
    });
    assert.equal(phase, "unauthorized");
    assert.equal(shouldRedirectAdminTo403(phase), true);
  });
});

console.log("IAM UI tests loaded");
