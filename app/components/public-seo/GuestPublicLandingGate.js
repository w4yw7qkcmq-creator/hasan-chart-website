"use client";

import { useAuth } from "../AuthProvider";
import { useRequireAuth } from "../../hooks/useRequireAuth";

/**
 * VIP-style pages: show SSR landing for guests and while auth is resolving.
 * When initialAuthenticated (server-validated session), skip guest landing on first paint.
 */
export function AuthGuestLandingGate({ landing, children, initialAuthenticated = false }) {
  const { authResolved, user } = useAuth();

  if (initialAuthenticated) {
    if (authResolved && !user?.email) {
      return landing;
    }

    return children;
  }

  if (!authResolved || !user?.email) {
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
  const { authResolved, user, sessionPending, isAuthenticated, shouldShowLogin } =
    useRequireAuth();

  if (initialAuthenticated) {
    if (shouldShowLogin || (authResolved && !isAuthenticated)) {
      return landing;
    }

    if (sessionPending || !user?.email) {
      return authenticatedPendingFallback ?? children;
    }

    if (typeof children === "function") {
      return children({ user });
    }

    return children;
  }

  if (sessionPending || shouldShowLogin || !isAuthenticated) {
    return landing;
  }

  if (typeof children === "function") {
    return children({ user });
  }

  return children;
}
