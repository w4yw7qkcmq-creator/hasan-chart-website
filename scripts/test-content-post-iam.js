import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { permissionForRoute } from "../lib/iam/route-permissions.js";
import { IAM_PERMISSIONS } from "../lib/iam/constants.js";
import { permissionForAdminPage } from "../lib/iam/page-permissions.js";

describe("content IAM permissions", () => {
  it("maps admin content routes", () => {
    assert.equal(permissionForRoute("GET", "/api/admin/content-posts"), IAM_PERMISSIONS.CONTENT_READ);
    assert.equal(permissionForRoute("POST", "/api/admin/content-posts"), IAM_PERMISSIONS.CONTENT_MANAGE);
    assert.equal(permissionForRoute("POST", "/api/admin/content-posts/[id]/publish"), IAM_PERMISSIONS.CONTENT_PUBLISH);
    assert.equal(permissionForRoute("POST", "/api/admin/content-posts/upload/authorize"), IAM_PERMISSIONS.CONTENT_MANAGE);
  });

  it("maps admin pages", () => {
    assert.equal(permissionForAdminPage("/admin/academy"), IAM_PERMISSIONS.CONTENT_READ);
    assert.equal(permissionForAdminPage("/admin/results"), IAM_PERMISSIONS.CONTENT_READ);
  });
});

console.log("content IAM permissions tests loaded");
