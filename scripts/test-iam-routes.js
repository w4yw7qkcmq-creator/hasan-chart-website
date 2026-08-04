import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateRouteMatrix, assertRouteMatrixValid } from "../lib/iam/route-matrix-validator.js";
import { permissionForRoute } from "../lib/iam/route-permissions.js";
import { IAM_PERMISSIONS } from "../lib/iam/constants.js";

describe("IAM route matrix validator", () => {
  it("validates without mismatches", () => {
    const result = validateRouteMatrix();
    if (!result.ok) {
      console.error(result.issues);
    }
    assert.equal(result.ok, true, `matrix issues: ${JSON.stringify(result.issues)}`);
  });

  it("assertRouteMatrixValid passes", () => {
    assert.doesNotThrow(() => assertRouteMatrixValid());
  });

  it("maps action-based assignments grant", () => {
    assert.equal(
      permissionForRoute("POST", "/api/iam/assignments", "grant"),
      IAM_PERMISSIONS.IAM_ASSIGNMENTS_GRANT
    );
  });

  it("maps action-based sessions force_logout", () => {
    assert.equal(
      permissionForRoute("POST", "/api/iam/sessions", "force_logout"),
      IAM_PERMISSIONS.IAM_SESSIONS_FORCE_LOGOUT
    );
  });

  it("maps health backfill action", () => {
    assert.equal(
      permissionForRoute("POST", "/api/iam/health", "backfill_legacy"),
      IAM_PERMISSIONS.IAM_MANAGE
    );
  });
});

console.log("IAM route matrix tests loaded");
