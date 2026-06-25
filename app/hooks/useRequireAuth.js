"use client";

import { useAuth } from "../components/AuthProvider";

export function useRequireAuth() {
  const { authResolved, status, user } = useAuth();

  const sessionPending = !authResolved || status === "loading";
  const isAuthenticated =
    authResolved && status === "authenticated" && Boolean(user?.email);
  const shouldShowLogin =
    authResolved && status === "unauthenticated" && !user?.email;

  return {
    authResolved,
    status,
    user,
    sessionPending,
    isAuthenticated,
    shouldShowLogin,
  };
}
