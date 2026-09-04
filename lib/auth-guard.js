export function buildProtectedLoginRedirect(path, { param = "next" } = {}) {
  const safePath =
    typeof path === "string" && path.startsWith("/") && !path.startsWith("//")
      ? path
      : "/";

  return `/login?${param}=${encodeURIComponent(safePath)}`;
}

/**
 * Single source of truth for protected-route auth phases.
 * Never returns "unauthenticated" while session is still initializing.
 */
export function resolveProtectedAuthPhase({
  authResolved = false,
  status = "loading",
  user = null,
} = {}) {
  if (!authResolved || status === "loading" || status === "restoring") {
    return "loading";
  }

  if (status === "error") {
    return "error";
  }

  if (status === "authenticated" && user?.email) {
    return "authenticated";
  }

  if (status === "unauthenticated") {
    return "unauthenticated";
  }

  return "loading";
}

export function shouldRedirectProtectedToLogin(phase) {
  return phase === "unauthenticated";
}

export function shouldHoldProtectedNavigation(phase) {
  return phase === "loading" || phase === "error";
}

export function resolveProtectedHref(
  href,
  { authResolved, status, user, loginGate = true } = {}
) {
  if (!loginGate) {
    return href;
  }

  const phase = resolveProtectedAuthPhase({ authResolved, status, user });

  if (phase === "authenticated" || shouldHoldProtectedNavigation(phase)) {
    return href;
  }

  return buildProtectedLoginRedirect(href);
}
