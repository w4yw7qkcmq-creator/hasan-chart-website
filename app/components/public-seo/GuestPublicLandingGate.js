"use client";

import {
  resolveProtectedAuthPhase,
  shouldHoldProtectedNavigation,
  shouldRedirectProtectedToLogin,
} from "../../../lib/auth-guard";
import { useAuth } from "../AuthProvider";
import { useRequireAuth } from "../../hooks/useRequireAuth";

/**
 * VIP-style pages: show SSR landing for guests and while auth is resolving.
 * When initialAuthenticated (server-validated session), skip guest landing on first paint.
 */
export function AuthGuestLandingGate({ landing, children, initialAuthenticated = false }) {
  const { authResolved, status, user } = useAuth();
  const phase = resolveProtectedAuthPhase({ authResolved, status, user });

  if (initialAuthenticated) {
    if (shouldRedirectProtectedToLogin(phase)) {
      return landing;
    }

    return children;
  }

  if (phase !== "authenticated") {
    return landing;
  }

  return children;
}

/**
 * useRequireAuth pages: show SSR landing for guests and while session is pending.
 * When initialAuthenticated, use authenticatedPendingFallback instead of marketing landing.
 */
export function RequireAuthGuestLandingGate({
  landing,
  children,
  initialAuthenticated = false,
  authenticatedPendingFallback = null,
}) {
  const { user, phase, sessionPending, shouldShowLogin } = useRequireAuth();

  if (initialAuthenticated) {
    if (shouldShowLogin) {
      return landing;
    }

    if (sessionPending || shouldHoldProtectedNavigation(phase) || !user?.email) {
      return authenticatedPendingFallback ?? children;
    }

    if (typeof children === "function") {
      return children({ user });
    }

    return children;
  }

  if (sessionPending || shouldShowLogin || phase !== "authenticated") {
    return landing;
  }

  if (typeof children === "function") {
    return children({ user });
  }

  return children;
}
