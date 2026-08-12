#!/usr/bin/env node
/**
 * Full 25-scenario matrix for admin user classification + CRM closure.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  resolveUserClassificationSignals,
  resolveStoredOrComputedClassification,
  USER_CLASSIFICATION,
  getUserClassificationLabel,
} from "../lib/user-classification.js";
import { normalizeAdminClassificationInput } from "../lib/user-classification-admin.js";
import { ALLOWED_ADMIN_USER_ACTIONS } from "../lib/admin-user-management-action-handler.js";
import { permissionForLifecycleAction } from "../lib/iam/action-permissions.js";
import { buildAdminUserListRequestParams, DEFAULT_ADMIN_USER_CLIENT_FILTERS } from "../lib/admin-user-list-request.js";

describe("BLACK OVERLAY scenarios", () => {
  it("1 CRM click uses Link prefetch without drawer backdrop", () => {
    const source = readFileSync("app/(app)/admin/components/admin-users/AdminUsersTable.js", "utf8");
    assert.match(source, /prefetch/);
    assert.doesNotMatch(source, /admin-user-drawer__backdrop/);
  });

  it("2 AdminAccessGate avoids full-screen loading during admin nav", () => {
    const gate = readFileSync("app/components/AdminAccessGate.js", "utf8");
    assert.match(gate, /adminSessionEstablishedRef/);
    assert.match(gate, /return children/);
  });

  it("3 CRM button local loading only", () => {
    const source = readFileSync("app/(app)/admin/components/admin-users/AdminUsersTable.js", "utf8");
    assert.match(source, /جارٍ الفتح/);
  });
});

describe("CLASSIFICATION policy scenarios", () => {
  it("4 explicit fixture metadata => E2E", () => {
    const result = resolveUserClassificationSignals(
      { email: "smoke-e2e-user@e2e.hasanchartworld.test", username: "smoke-e2e-user" },
      { user_metadata: { e2e: true } }
    );
    assert.equal(result.classification, USER_CLASSIFICATION.E2E);
  });

  it("5 known test domain without e2e prefix => TEST", () => {
    const result = resolveUserClassificationSignals({
      email: "p-a-123@test.local",
      username: "PartnerA123",
    });
    assert.equal(result.classification, USER_CLASSIFICATION.TEST);
  });

  it("6 normal production account is not TEST/E2E", () => {
    const result = resolveUserClassificationSignals({
      email: "user@gmail.com",
      username: "ahmad_trader",
      created_at: "2025-01-01T00:00:00Z",
      last_sign_in_at: "2026-01-01T00:00:00Z",
    });
    assert.notEqual(result.classification, USER_CLASSIFICATION.TEST);
    assert.notEqual(result.classification, USER_CLASSIFICATION.E2E);
  });

  it("7 ambiguous username => UNKNOWN/SUSPECTED", () => {
    const result = resolveUserClassificationSignals({
      email: "someone@gmail.com",
      username: "ProdA991",
    });
    assert.ok(
      result.classification === USER_CLASSIFICATION.SUSPECTED ||
        result.classification === USER_CLASSIFICATION.UNKNOWN
    );
  });

  it("8 admin on production domain => INTERNAL", () => {
    const result = resolveUserClassificationSignals({
      email: "admin@hasanchartworld.com",
      role: "admin",
    });
    assert.equal(result.classification, USER_CLASSIFICATION.INTERNAL);
  });

  it("9 self-change blocked in server module", () => {
    const source = readFileSync("lib/user-classification-admin.js", "utf8");
    assert.match(source, /adminId === normalizedUserId/);
  });

  it("10 partner/public blocked via admin actions route permission", () => {
    const route = readFileSync("app/api/admin/user-management/[userId]/actions/route.js", "utf8");
    assert.match(route, /USERS_MANAGE/);
    assert.match(sourceActionHandler(), /update_user_classification/);
  });

  it("11 server-side filter param wired", () => {
    const params = buildAdminUserListRequestParams({
      clientFilters: { ...DEFAULT_ADMIN_USER_CLIENT_FILTERS, userClassification: "test" },
    });
    assert.equal(params.userClassification, "test");
  });

  it("12 pagination retains classification filter", () => {
    const p1 = buildAdminUserListRequestParams({
      page: 1,
      clientFilters: { ...DEFAULT_ADMIN_USER_CLIENT_FILTERS, userClassification: "e2e" },
    });
    const p2 = buildAdminUserListRequestParams({
      page: 2,
      clientFilters: { ...DEFAULT_ADMIN_USER_CLIENT_FILTERS, userClassification: "e2e" },
    });
    assert.equal(p1.userClassification, p2.userClassification);
    assert.notEqual(p1.page, p2.page);
  });

  it("13 search + classification compose", () => {
    const params = buildAdminUserListRequestParams({
      searchQuery: "ahmad",
      clientFilters: { ...DEFAULT_ADMIN_USER_CLIENT_FILTERS, userClassification: "real" },
    });
    assert.equal(params.search, "ahmad");
    assert.equal(params.userClassification, "real");
  });

  it("14 cohort + classification compose", () => {
    const params = buildAdminUserListRequestParams({
      registrationCohort: "week",
      clientFilters: { ...DEFAULT_ADMIN_USER_CLIENT_FILTERS, userClassification: "unknown" },
    });
    assert.ok(params.registeredFrom);
    assert.equal(params.userClassification, "unknown");
  });

  it("15 CSV includes Arabic classification column", () => {
    const source = readFileSync(
      "app/(app)/admin/components/admin-user-management-ux-helpers.js",
      "utf8"
    );
    assert.match(source, /نوع الحساب/);
    assert.match(source, /userClassificationLabel/);
  });

  it("16 no delete in classification modules", () => {
    const cls = readFileSync("lib/user-classification-admin.js", "utf8");
    assert.doesNotMatch(cls, /\.delete\(/);
    assert.doesNotMatch(cls, /auth\.admin\.deleteUser/);
  });

  it("17 classification update does not touch subscriptions", () => {
    const cls = readFileSync("lib/user-classification-admin.js", "utf8");
    assert.doesNotMatch(cls, /subscription_requests/);
  });

  it("18 classification update does not touch financial tables", () => {
    const cls = readFileSync("lib/user-classification-admin.js", "utf8");
    assert.doesNotMatch(cls, /financial/);
    assert.doesNotMatch(cls, /payment_proof/);
  });
});

describe("CRM/PREVIEW scenarios", () => {
  it("19 classification badge in CRM center view", () => {
    const source = readFileSync("app/(app)/admin/components/AdminUserCenterView.js", "utf8");
    assert.match(source, /au-classification-badge/);
    assert.match(source, /buildClassificationBanner/);
  });

  it("20 email/UUID from server overview section contract", () => {
    const source = readFileSync("lib/admin-user-management.js", "utf8");
    assert.match(source, /userClassification/);
    assert.match(source, /formatUserBase/);
  });

  it("21 tabs use client state + URL sync", () => {
    const source = readFileSync("app/(app)/admin/components/AdminUserCenterView.js", "utf8");
    assert.match(source, /handleTabChange/);
    assert.match(source, /router\.replace/);
  });

  it("22 preview drawer escape + focus trap hooks", () => {
    const source = readFileSync("app/(app)/admin/components/AdminUserQuickPreviewDrawer.js", "utf8");
    assert.match(source, /Escape/);
    assert.match(source, /focus/);
    assert.match(source, /فتح CRM الكامل/);
  });

  it("23 empty states in drawer shell", () => {
    const source = readFileSync("app/(app)/admin/components/AdminUserDrawerShell.js", "utf8");
    assert.match(source, /SectionEmptyDataState/);
  });

  it("24 RTL/mobile CRM theme", () => {
    const theme = readFileSync("app/(app)/admin/admin-crm-theme.css", "utf8");
    assert.match(theme, /@media \(max-width: 640px\)/);
  });

  it("25 dark/light CRM tokens", () => {
    const theme = readFileSync("app/(app)/admin/admin-crm-theme.css", "utf8");
    assert.match(theme, /html\.dark/);
    assert.match(theme, /--crm-surface/);
  });
});

describe("IAM + authority", () => {
  it("manual classification action allowed set + permission", () => {
    assert.equal(ALLOWED_ADMIN_USER_ACTIONS.has("update_user_classification"), true);
    assert.equal(permissionForLifecycleAction("update_user_classification"), "users.manage");
  });

  it("admin manual stored value wins over computed", () => {
    const resolved = resolveStoredOrComputedClassification({
      email: "e2e@test.local",
      user_classification: "real",
      user_classification_source: "admin_manual",
    });
    assert.equal(resolved.classification, USER_CLASSIFICATION.REAL);
    assert.equal(resolved.source, "admin_manual");
  });

  it("stored UNKNOWN falls through to computed REAL", () => {
    const resolved = resolveStoredOrComputedClassification({
      email: "trader@gmail.com",
      username: "ahmad_trader",
      created_at: "2025-01-01T00:00:00Z",
      last_sign_in_at: "2026-01-01T00:00:00Z",
      user_classification: "unknown",
    });
    assert.equal(resolved.classification, USER_CLASSIFICATION.REAL);
    assert.equal(resolved.source, "computed");
  });

  it("stored TEST blocks computed REAL", () => {
    const resolved = resolveStoredOrComputedClassification({
      email: "trader@gmail.com",
      username: "ahmad_trader",
      user_classification: "test",
    });
    assert.equal(resolved.classification, USER_CLASSIFICATION.TEST);
  });

  it("validates admin classification input", () => {
    assert.equal(normalizeAdminClassificationInput("TEST"), USER_CLASSIFICATION.TEST);
    assert.throws(() => normalizeAdminClassificationInput("bogus"));
  });

  it("Arabic labels exported", () => {
    assert.equal(getUserClassificationLabel("real"), "مستخدم حقيقي");
    assert.equal(getUserClassificationLabel("e2e"), "حساب آلي للاختبارات");
  });
});

function sourceActionHandler() {
  return readFileSync("lib/admin-user-management-action-handler.js", "utf8");
}

console.log("admin user full matrix tests loaded");
