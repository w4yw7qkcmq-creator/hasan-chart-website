import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildProtectedLoginRedirect,
  resolveProtectedAuthPhase,
  resolveProtectedHref,
  shouldHoldProtectedNavigation,
  shouldRedirectProtectedToLogin,
} from "../lib/auth-guard.js";

const root = process.cwd();

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

test("A: authenticated + initialized → no login redirect", () => {
  const phase = resolveProtectedAuthPhase({
    authResolved: true,
    status: "authenticated",
    user: { email: "user@example.com" },
  });

  assert.equal(phase, "authenticated");
  assert.equal(shouldRedirectProtectedToLogin(phase), false);
});

test("B: authenticated during initial loading → no login redirect", () => {
  const loadingPhase = resolveProtectedAuthPhase({
    authResolved: false,
    status: "loading",
    user: null,
  });
  const restoringPhase = resolveProtectedAuthPhase({
    authResolved: false,
    status: "restoring",
    user: null,
  });

  assert.equal(loadingPhase, "loading");
  assert.equal(restoringPhase, "loading");
  assert.equal(shouldRedirectProtectedToLogin(loadingPhase), false);
  assert.equal(shouldRedirectProtectedToLogin(restoringPhase), false);
  assert.equal(shouldHoldProtectedNavigation(loadingPhase), true);
});

test("C: unauthenticated after auth initialization → login redirect", () => {
  const phase = resolveProtectedAuthPhase({
    authResolved: true,
    status: "unauthenticated",
    user: null,
  });

  assert.equal(phase, "unauthenticated");
  assert.equal(shouldRedirectProtectedToLogin(phase), true);
  assert.equal(buildProtectedLoginRedirect("/subscriptions"), "/login?next=%2Fsubscriptions");
});

test("D: protected href stays on service path while session is loading", () => {
  const href = resolveProtectedHref("/vip-spot", {
    authResolved: false,
    status: "loading",
    user: null,
    loginGate: true,
  });

  assert.equal(href, "/vip-spot");
});

test("E: protected href opens service for authenticated users", () => {
  const href = resolveProtectedHref("/vip-futures", {
    authResolved: true,
    status: "authenticated",
    user: { email: "user@example.com" },
    loginGate: true,
  });

  assert.equal(href, "/vip-futures");
});

test("F: auth error phase does not force login redirect", () => {
  const phase = resolveProtectedAuthPhase({
    authResolved: true,
    status: "error",
    user: null,
  });

  assert.equal(phase, "error");
  assert.equal(shouldRedirectProtectedToLogin(phase), false);
  assert.equal(shouldHoldProtectedNavigation(phase), true);
});

test("G: HomePageClient no longer reads legacy localStorage currentUser", () => {
  const home = readFileSync(join(root, "app/(public)/HomePageClient.js"), "utf8");

  assert.doesNotMatch(home, /localStorage\.getItem\(["']currentUser["']\)/);
  assert.match(home, /useAuth\(/);
  assert.match(home, /resolveProtectedAuthPhase|shouldRedirectProtectedToLogin|shouldHoldProtectedNavigation/);
});

test("H: guest landing gates use confirmed-unauthenticated phase only", () => {
  const gate = readFileSync(
    join(root, "app/components/public-seo/GuestPublicLandingGate.js"),
    "utf8"
  );

  assert.match(gate, /resolveProtectedAuthPhase/);
  assert.match(gate, /shouldRedirectProtectedToLogin/);
  assert.doesNotMatch(gate, /authResolved && !isAuthenticated/);
});

test("I: sidebar href resolver waits for auth resolution", () => {
  const shell = readFileSync(join(root, "app/components/RootLayoutShell.js"), "utf8");
  const publicShell = readFileSync(join(root, "app/components/PublicStaticShell.js"), "utf8");

  assert.match(shell, /resolveProtectedHref/);
  assert.match(publicShell, /resolveProtectedHref/);
  assert.doesNotMatch(shell, /if \(authResolved && currentUser\)/);
  assert.doesNotMatch(publicShell, /if \(authResolved && currentUser\)/);
});

console.log("auth-guard regression tests passed");
