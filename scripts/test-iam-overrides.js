import test from "node:test";
import assert from "node:assert/strict";
import { computeEffectivePermissions } from "../lib/iam/resolve-permissions.js";
import { PERMISSION_EFFECT } from "../lib/iam/constants.js";
import {
  grantPermissionOverride,
  revokePermissionOverride,
} from "../lib/iam/overrides.js";

test("IAM overrides semantics", async (t) => {
  await t.test("deny wins over allow in effective permissions", () => {
    const allow = new Set(["news.read", "news.publish", "news.manage"]);
    const deny = new Set(["news.publish"]);
    const effective = computeEffectivePermissions(allow, deny);
    assert.equal(effective.has("news.read"), true);
    assert.equal(effective.has("news.manage"), true);
    assert.equal(effective.has("news.publish"), false);
  });

  await t.test("grantPermissionOverride requires reason", async () => {
    const fakeSb = {};
    const result = await grantPermissionOverride(fakeSb, {
      actorId: "actor",
      actorIam: { isSuperAdmin: true },
      targetUserId: "target",
      permissionId: "news.publish",
      effect: PERMISSION_EFFECT.DENY,
      reason: "",
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  });

  await t.test("revokePermissionOverride requires reason", async () => {
    const fakeSb = {};
    const result = await revokePermissionOverride(fakeSb, {
      actorId: "actor",
      reason: "",
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  });
});
