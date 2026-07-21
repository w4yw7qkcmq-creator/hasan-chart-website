import assert from "node:assert/strict";
import {
  AUTH_BOOTSTRAP_MAX_ATTEMPTS,
  AUTH_BOOTSTRAP_RETRY_DELAYS_MS,
  getBootstrapRetryDelayMs,
  isBootstrapRequestCurrent,
  resolveBootstrapAttemptOutcome,
  shouldMarkBootstrapError,
  shouldRunBootstrapRetry,
  simulateBootstrapPhases,
} from "../lib/auth-bootstrap-restore.js";
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

test("restoring status stays on loading UI", () => {
  const phase = resolveAdminGatePhase({
    authReady: false,
    authResolved: false,
    status: "restoring",
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

test("persistent error only after bootstrap completes", () => {
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

test("transient then authenticated bootstrap never shows error phase", () => {
  const phases = simulateBootstrapPhases(["transient_error", "authenticated"]);
  assert.deepEqual(phases, ["loading", "loading", "authenticated"]);
  assert.ok(!phases.includes("error"));
});

test("two transient attempts then authenticated stay loading until success", () => {
  const phases = simulateBootstrapPhases(["transient_error", "transient_error", "authenticated"]);
  assert.deepEqual(phases, ["loading", "loading", "loading", "authenticated"]);
});

test("persistent transient errors end in error phase", () => {
  const phases = simulateBootstrapPhases([
    "transient_error",
    "transient_error",
    "transient_error",
  ]);
  assert.deepEqual(phases, ["loading", "loading", "loading", "error"]);
});

test("confirmed unauthenticated ends in login phase", () => {
  const phases = simulateBootstrapPhases(["unauthenticated"]);
  assert.deepEqual(phases, ["loading", "unauthenticated"]);
});

test("bootstrap retry delays are 250ms then 600ms", () => {
  assert.deepEqual(AUTH_BOOTSTRAP_RETRY_DELAYS_MS, [250, 600]);
  assert.equal(getBootstrapRetryDelayMs(1), 250);
  assert.equal(getBootstrapRetryDelayMs(2), 600);
  assert.equal(getBootstrapRetryDelayMs(3), 600);
});

test("bootstrap allows three total attempts", () => {
  assert.equal(AUTH_BOOTSTRAP_MAX_ATTEMPTS, 3);
  assert.equal(shouldRunBootstrapRetry({ outcome: "transient_error", attempt: 1 }), true);
  assert.equal(shouldRunBootstrapRetry({ outcome: "transient_error", attempt: 2 }), true);
  assert.equal(shouldRunBootstrapRetry({ outcome: "transient_error", attempt: 3 }), false);
});

test("transient restore does not imply logout", () => {
  const attemptOutcome = resolveBootstrapAttemptOutcome({
    restoreOutcome: "transient_error",
    hasServerSessionUser: false,
    hasSupabaseUser: false,
  });
  assert.equal(attemptOutcome, "transient_error");
  assert.equal(buildTransientRestoreResult("network_timeout").outcome, "transient_error");
  assert.notEqual(buildTransientRestoreResult("network_timeout").outcome, "unauthenticated");
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

test("session fetch retries do not mean logout", () => {
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

test("stale bootstrap request is ignored", () => {
  assert.equal(isBootstrapRequestCurrent(2, 1), false);
  assert.equal(isBootstrapRequestCurrent(2, 2), true);
});

test("stale bootstrap does not mark auth error", () => {
  assert.equal(
    shouldMarkBootstrapError({
      currentRequestId: 2,
      requestId: 1,
      mounted: true,
      authenticated: false,
    }),
    false
  );
});

test("current bootstrap can mark auth error when unauthenticated", () => {
  assert.equal(
    shouldMarkBootstrapError({
      currentRequestId: 2,
      requestId: 2,
      mounted: true,
      authenticated: false,
    }),
    true
  );
});

test("bootstrap never marks error once authenticated", () => {
  assert.equal(
    shouldMarkBootstrapError({
      currentRequestId: 2,
      requestId: 2,
      mounted: true,
      authenticated: true,
    }),
    false
  );
});

console.log(`\n${passed}/${passed} admin auth guard tests passed`);
