export function buildAdminLoginRedirect(pathname, { param = "redirect" } = {}) {
  const safePath =
    typeof pathname === "string" && pathname.startsWith("/admin") && !pathname.startsWith("//")
      ? pathname
      : "/admin";

  return `/login?${param}=${encodeURIComponent(safePath)}`;
}

export function resolveAdminGatePhase({
  authReady = false,
  authResolved = false,
  status = "loading",
  profileReady = false,
  isAuthenticated = false,
  isAdmin = false,
  keepAuthenticatedDuringProfileEnrich = false,
}) {
  const sessionInitializing =
    !authReady || !authResolved || status === "loading" || status === "restoring";

  if (sessionInitializing) {
    return "loading";
  }

  if (status === "authenticated" && isAuthenticated) {
    if (!profileReady) {
      if (keepAuthenticatedDuringProfileEnrich && isAdmin) {
        return "authenticated";
      }
      return "loading";
    }

    if (!isAdmin) {
      return "unauthorized";
    }

    return "authenticated";
  }

  if (status === "error") {
    return "error";
  }

  if (status === "unauthenticated") {
    return "unauthenticated";
  }

  return "loading";
}

export function shouldKeepAdminGateAuthenticatedDuringProfileEnrich({
  status = "loading",
  isAuthenticated = false,
  profileReady = false,
  isAdmin = false,
} = {}) {
  return status === "authenticated" && isAuthenticated && isAdmin && !profileReady;
}

export function shouldRedirectAdminToLogin(phase) {
  return phase === "unauthenticated";
}

export function shouldRedirectAdminTo403(phase) {
  return phase === "unauthorized";
}

export function shouldAdminEscCloseOverlay({
  modalOpen = false,
  quickPreviewOpen = false,
  commandPaletteOpen = false,
  paymentProofOpen = false,
} = {}) {
  return modalOpen || quickPreviewOpen || commandPaletteOpen || paymentProofOpen;
}
