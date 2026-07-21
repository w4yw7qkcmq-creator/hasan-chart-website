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
}) {
  const sessionInitializing = !authReady || !authResolved || status === "loading";

  if (sessionInitializing) {
    return "loading";
  }

  if (status === "authenticated" && isAuthenticated) {
    if (!profileReady) {
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
