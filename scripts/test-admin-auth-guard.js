import assert from "node:assert/strict";
import {
  buildAdminLoginRedirect,
  resolveAdminGatePhase,
  shouldAdminEscCloseOverlay,
  shouldRedirectAdminTo403,
  shouldRedirectAdminToLogin,
} from "../lib/admin-auth-guard.js";
import {
  buildAuthenticatedRestoreResult,
  buildTransientRestoreResult,
  buildUnauthenticatedRestoreResult,
  classifySessionRestoreResponse,
  shouldRetrySessionRestore,
} from "../lib/auth-session-restore.js";

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

test("loading phase does not redirect to login", () => {
  const phase = resolveAdminGatePhase({
    authReady: false,
    authResolved: false,
    status: "loading",
  });
  assert.equal(phase, "loading");
  assert.equal(shouldRedirectAdminToLogin(phase), false);
});

test("valid admin session does not redirect", () => {
  const phase = resolveAdminGatePhase({
    authReady: true,
    authResolved: true,
    status: "authenticated",
    profileReady: true,
    isAuthenticated: true,
    isAdmin: true,
  });
  assert.equal(phase, "authenticated");
  assert.equal(shouldRedirectAdminToLogin(phase), false);
  assert.equal(shouldRedirectAdminTo403(phase), false);
});

test("unauthenticated causes one login redirect decision", () => {
  const phase = resolveAdminGatePhase({
    authReady: true,
    authResolved: true,
    status: "unauthenticated",
    profileReady: true,
    isAuthenticated: false,
    isAdmin: false,
  });
  assert.equal(phase, "unauthenticated");
  assert.equal(shouldRedirectAdminToLogin(phase), true);
});

test("authenticated non-admin shows unauthorized phase", () => {
  const phase = resolveAdminGatePhase({
    authReady: true,
    authResolved: true,
    status: "authenticated",
    profileReady: true,
    isAuthenticated: true,
    isAdmin: false,
  });
  assert.equal(phase, "unauthorized");
  assert.equal(shouldRedirectAdminTo403(phase), true);
  assert.equal(shouldRedirectAdminToLogin(phase), false);
});

test("network error keeps loading/error without login redirect", () => {
  const phase = resolveAdminGatePhase({
    authReady: true,
    authResolved: true,
    status: "error",
    profileReady: true,
    isAuthenticated: false,
    isAdmin: false,
  });
  assert.equal(phase, "error");
  assert.equal(shouldRedirectAdminToLogin(phase), false);
});

test("server authenticated payload is trusted even if client restore fails", () => {
  const payload = {
    authenticated: true,
    user: { id: "1", email: "admin@example.com", role: "admin" },
    session: { access_token: "a", refresh_token: "r" },
    isAdmin: true,
  };
  const classification = classifySessionRestoreResponse({ ok: true, status: 200 }, payload);
  assert.equal(classification.outcome, "authenticated");
  const restored = buildAuthenticatedRestoreResult(payload, { clientRestored: false });
  assert.equal(restored.outcome, "authenticated");
  assert.equal(restored.sessionUser.email, "admin@example.com");
});

test("transient restore errors can retry and do not mean logout", () => {
  const transient = buildTransientRestoreResult("network_timeout");
  assert.equal(transient.outcome, "transient_error");
  assert.equal(shouldRetrySessionRestore("transient_error", 1, 3), true);
  assert.equal(shouldRetrySessionRestore("transient_error", 3, 3), false);
  assert.equal(buildUnauthenticatedRestoreResult().outcome, "unauthenticated");
});

test("admin login redirect keeps safe return path", () => {
  assert.equal(
    buildAdminLoginRedirect("/admin/users/abc"),
    "/login?redirect=%2Fadmin%2Fusers%2Fabc"
  );
});

test("Esc closes overlays only when one is open", () => {
  assert.equal(shouldAdminEscCloseOverlay({ modalOpen: true }), true);
  assert.equal(shouldAdminEscCloseOverlay({ quickPreviewOpen: true }), true);
  assert.equal(shouldAdminEscCloseOverlay({ commandPaletteOpen: true }), true);
  assert.equal(shouldAdminEscCloseOverlay({}), false);
});

console.log(`\n${passed}/${passed} admin auth guard tests passed`);
