import test from "node:test";
import assert from "node:assert/strict";
import { validatePageMatrix } from "../lib/iam/page-matrix-validator.js";
import {
  permissionForAdminPage,
  normalizeAdminPagePath,
  ADMIN_PAGE_PERMISSIONS,
} from "../lib/iam/page-permissions.js";
import { IAM_PERMISSIONS } from "../lib/iam/constants.js";

test("Page permission matrix", async (t) => {
  await t.test("all discovered admin pages have permissions", () => {
    const result = validatePageMatrix();
    const blocking = result.issues.filter((issue) => issue.type !== "is_admin_only_page");
    assert.equal(blocking.length, 0, JSON.stringify(blocking, null, 2));
    assert.equal(result.ok, true);
    assert.ok(result.pageCount >= 10);
  });

  await t.test("known admin routes map to explicit permissions", () => {
    assert.equal(permissionForAdminPage("/admin"), IAM_PERMISSIONS.DASHBOARD_READ);
    assert.equal(permissionForAdminPage("/admin/users"), IAM_PERMISSIONS.USERS_READ);
    assert.equal(permissionForAdminPage("/admin/iam"), IAM_PERMISSIONS.IAM_READ);
    assert.equal(permissionForAdminPage("/admin/news"), IAM_PERMISSIONS.NEWS_READ);
    assert.equal(
      permissionForAdminPage("/admin/users/110006c0-1ba7-4278-8f8a-4ce51cccd338"),
      IAM_PERMISSIONS.USERS_READ
    );
  });

  await t.test("normalized dynamic admin paths", () => {
    assert.equal(
      normalizeAdminPagePath("/admin/partners/abc-123-def"),
      "/admin/partners/[id]"
    );
    assert.equal(
      normalizeAdminPagePath("/admin/users/110006c0-1ba7-4278-8f8a-4ce51cccd338"),
      "/admin/users/[userId]"
    );
  });

  await t.test("matrix has no duplicate path keys", () => {
    const keys = Object.keys(ADMIN_PAGE_PERMISSIONS);
    assert.equal(keys.length, new Set(keys).size);
  });
});
