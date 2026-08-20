import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("push unsubscribe ownership enforcement", () => {
  it("route requires session before deletion", () => {
    const source = readFileSync(
      path.join(root, "app/api/push/unsubscribe/route.js"),
      "utf8"
    );

    assert.match(source, /requireSessionUser\(/);
    assert.match(source, /deleteOwnedPushSubscription\(/);
    assert.doesNotMatch(source, /delete\(\)\.eq\("endpoint", endpoint\);/);
  });

  it("server helper scopes delete to user_id and endpoint", () => {
    const source = readFileSync(
      path.join(root, "lib/push-subscriptions-server.js"),
      "utf8"
    );

    assert.match(source, /deleteOwnedPushSubscription/);
    assert.match(source, /\.eq\("endpoint", normalizedEndpoint\)/);
    assert.match(source, /\.eq\("user_id", normalizedUserId\)/);
  });
});

describe("sync-session verification gate", () => {
  it("route verifies tokens before cookie write", () => {
    const routeSource = readFileSync(
      path.join(root, "app/api/auth/sync-session/route.js"),
      "utf8"
    );
    const helperSource = readFileSync(
      path.join(root, "lib/auth-sync-session-server.js"),
      "utf8"
    );

    assert.match(routeSource, /verifySessionTokensForCookieSync/);
    assert.match(routeSource, /applyVerifiedSessionCookies/);
    assert.doesNotMatch(routeSource, /response\.cookies\.set\("hc_access_token", accessToken/);
    assert.match(helperSource, /auth\.setSession\(/);
  });
});

console.log("push unsubscribe security tests loaded");
