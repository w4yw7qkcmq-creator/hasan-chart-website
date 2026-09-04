"use client";

import {
  resolveProtectedAuthPhase,
  shouldRedirectProtectedToLogin,
} from "../../lib/auth-guard";
import { useAuth } from "../components/AuthProvider";

export function useRequireAuth() {
  const { authResolved, profileReady, status, user } = useAuth();
  const phase = resolveProtectedAuthPhase({ authResolved, status, user });

  return {
    authResolved,
    profileReady,
    status,
    user,
    phase,
    sessionPending: phase === "loading",
    isAuthenticated: phase === "authenticated",
    shouldShowLogin: shouldRedirectProtectedToLogin(phase),
  };
}
