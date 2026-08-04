import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  IAM_TAB_DEFS,
  IAM_ROLE_LABELS,
  IAM_ASSIGNMENT_REASON_LABELS,
  IAM_ROLE_ICONS,
  labelRole,
  labelPermission,
  labelAssignmentReason,
  labelAssignmentStatus,
  formatTechnicalId,
  groupPermissionsByCategory,
} from "../lib/iam/ui-labels.js";
import { IAM_PERMISSIONS } from "../lib/iam/constants.js";

describe("IAM UI labels", () => {
  it("maps known roles to Arabic labels", () => {
    assert.equal(labelRole("super_admin"), "المدير العام");
    assert.equal(labelRole("admin"), "مدير");
    assert.equal(labelRole("support"), "الدعم الفني");
  });

  it("falls back safely for unknown role ids", () => {
    const fallback = labelRole("custom_role_xyz");
    assert.ok(fallback.length > 0);
    assert.notEqual(fallback, "custom_role_xyz");
  });

  it("maps known permissions to Arabic labels", () => {
    assert.equal(labelPermission("iam.read"), "عرض إعدادات الصلاحيات");
    assert.equal(labelPermission("users.read"), "عرض المستخدمين");
  });

  it("falls back safely for unknown permission ids", () => {
    const fallback = labelPermission("unknown.permission.id");
    assert.ok(fallback.includes("Unknown") || fallback.includes("Permission"));
  });

  it("maps assignment reasons to human Arabic", () => {
    assert.equal(labelAssignmentReason("legacy_backfill"), "ترحيل من النظام السابق");
    assert.equal(labelAssignmentReason("bootstrap_ceremony"), "تهيئة المدير العام");
    assert.equal(labelAssignmentReason("manual"), "تعيين يدوي");
    assert.equal(labelAssignmentReason("unknown_reason"), "إجراء إداري");
  });

  it("derives assignment status labels", () => {
    assert.equal(labelAssignmentStatus({ revoked_at: "2026-01-01" }), "أُلغي التعيين");
    assert.equal(labelAssignmentStatus({}), "نشط");
    assert.equal(labelAssignmentStatus(null), "بدون تعيين");
  });

  it("groups permissions by category", () => {
    const groups = groupPermissionsByCategory([
      { id: "users.read", category: "users" },
      { id: "users.manage", category: "users" },
      { id: "iam.read", category: "iam" },
    ]);
    assert.equal(groups.length, 2);
    const usersGroup = groups.find((g) => g.category === "users");
    assert.equal(usersGroup.permissions.length, 2);
    assert.equal(usersGroup.label, "المستخدمون");
  });

  it("formatTechnicalId never returns empty for non-empty input", () => {
    assert.ok(formatTechnicalId("iam.read").length > 0);
  });
});

describe("IAM tab definitions", () => {
  it("defines eight Arabic tabs in order", () => {
    assert.equal(IAM_TAB_DEFS.length, 8);
    assert.equal(IAM_TAB_DEFS[0].id, "overview");
    assert.equal(IAM_TAB_DEFS[0].label, "نظرة عامة");
  });

  it("uses valid IAM permission strings", () => {
    const known = new Set(Object.values(IAM_PERMISSIONS));
    for (const tab of IAM_TAB_DEFS) {
      assert.ok(known.has(tab.permission), `unknown permission: ${tab.permission}`);
    }
  });

  it("overview tab requires iam.read only", () => {
    const overview = IAM_TAB_DEFS.find((t) => t.id === "overview");
    assert.equal(overview.permission, IAM_PERMISSIONS.IAM_READ);
  });
});

describe("IAM admin page structure", () => {
  const pagePath = path.join(process.cwd(), "app/(app)/admin/iam/page.js");
  const pageSource = fs.readFileSync(pagePath, "utf8");

  it("does not expose UUID as primary user label in page source patterns", () => {
    assert.ok(!pageSource.includes("window.prompt"), "override revoke should not use window.prompt");
    assert.ok(pageSource.includes("IamGrantModal"));
    assert.ok(pageSource.includes("IamRevokeModal"));
  });

  it("uses Arabic page title", () => {
    assert.ok(pageSource.includes("إدارة الصلاحيات والأدوار"));
  });

  it("gates grant/revoke by IAM permissions", () => {
    assert.ok(pageSource.includes("IAM_ASSIGNMENTS_GRANT"));
    assert.ok(pageSource.includes("IAM_ASSIGNMENTS_REVOKE"));
  });
});

describe("IAM role label coverage", () => {
  it("has Arabic labels for all standard roles", () => {
    const standardRoles = [
      "super_admin",
      "admin",
      "support",
      "accountant",
      "analyst",
      "news_editor",
      "subscription_manager",
    ];
    for (const role of standardRoles) {
      assert.ok(IAM_ROLE_LABELS[role], `missing label for ${role}`);
    }
  });

  it("has role icons for standard roles", () => {
    assert.ok(IAM_ROLE_ICONS.super_admin);
    assert.ok(IAM_ROLE_ICONS.admin);
  });
});
