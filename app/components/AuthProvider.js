"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { isAdminUser } from "../../lib/admin-emails";
import {
  AUTH_BOOTSTRAP_MAX_ATTEMPTS,
  getBootstrapRetryDelayMs,
  isBootstrapRequestCurrent,
  shouldMarkBootstrapError,
  shouldRunBootstrapRetry,
  waitWithAbort,
} from "../../lib/auth-bootstrap-restore";
import { buildAppUser } from "../../lib/auth-profile";
import {
  buildAppUserFromSessionPayload,
  buildMinimalAppUser,
  resolveSupabaseAuthUser,
  restoreSessionFromCookies,
} from "../../lib/auth-session-client";
import { supabase } from "../../lib/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authReady, setAuthReady] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);
  const [profileReady, setProfileReady] = useState(false);
  const enrichRequestRef = useRef(0);
  const initCompleteRef = useRef(false);
  const authenticatedRef = useRef(false);
  const bootstrapRequestRef = useRef(0);
  const bootstrapAbortRef = useRef(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      bootstrapAbortRef.current?.abort();
    };
  }, []);

  const isCurrentBootstrap = useCallback((requestId) => {
    return mountedRef.current && isBootstrapRequestCurrent(bootstrapRequestRef.current, requestId);
  }, []);

  const setBootstrapStatus = useCallback((requestId, nextStatus) => {
    if (!isCurrentBootstrap(requestId)) return;
    setStatus(nextStatus);
  }, [isCurrentBootstrap]);

  const setBootstrapLoadingState = useCallback(
    (requestId, { nextStatus = "loading" } = {}) => {
      if (!isCurrentBootstrap(requestId)) return;
      setStatus(nextStatus);
      setAuthResolved(false);
      setAuthReady(false);
    },
    [isCurrentBootstrap]
  );

  const enrichUserProfile = useCallback(async (authUser) => {
    if (!authUser?.email) {
      if (!mountedRef.current) return;
      setProfileReady(true);
      return;
    }

    const requestId = enrichRequestRef.current + 1;
    enrichRequestRef.current = requestId;

    try {
      const appUser = await Promise.race([
        buildAppUser(authUser, supabase),
        new Promise((resolve) => {
          setTimeout(() => resolve(null), 10_000);
        }),
      ]);

      if (!mountedRef.current || enrichRequestRef.current !== requestId) {
        return;
      }

      if (appUser) {
        setUser(appUser);
      }
    } catch (err) {
      console.warn("Profile enrich skipped:", err?.message || err);
    } finally {
      if (mountedRef.current && enrichRequestRef.current === requestId) {
        setProfileReady(true);
      }
    }
  }, []);

  const applyAuthenticatedUser = useCallback(
    (authUser, { enrichProfile = true, serverSessionUser = null } = {}) => {
      if (!mountedRef.current) return;

      const wasAuthenticated = authenticatedRef.current;
      const minimalUser = serverSessionUser?.email
        ? buildAppUserFromSessionPayload(serverSessionUser)
        : buildMinimalAppUser(authUser);

      if (!minimalUser) {
        authenticatedRef.current = false;
        setUser(null);
        setStatus("unauthenticated");
        setProfileReady(true);
        setAuthResolved(true);
        return;
      }

      authenticatedRef.current = true;
      setUser(minimalUser);
      setStatus("authenticated");
      setAuthResolved(true);

      if (enrichProfile) {
        if (!wasAuthenticated) {
          setProfileReady(false);
        }
        const enrichSource =
          authUser?.email
            ? authUser
            : {
                id: minimalUser.id,
                email: minimalUser.email,
                user_metadata: { role: minimalUser.role },
              };
        void enrichUserProfile(enrichSource);
      } else {
        setProfileReady(true);
      }
    },
    [enrichUserProfile]
  );

  const clearAuthenticatedUser = useCallback(() => {
    if (!mountedRef.current) return;

    enrichRequestRef.current += 1;
    authenticatedRef.current = false;
    setUser(null);
    setStatus("unauthenticated");
    setProfileReady(true);
    setAuthResolved(true);
  }, []);

  const markAuthErrorForRequest = useCallback(
    (requestId) => {
      if (
        !shouldMarkBootstrapError({
          currentRequestId: bootstrapRequestRef.current,
          requestId,
          mounted: mountedRef.current,
          authenticated: authenticatedRef.current,
        })
      ) {
        return;
      }

      enrichRequestRef.current += 1;
      setStatus("error");
      setProfileReady(true);
      setAuthResolved(true);
    },
    []
  );

  const applyRestoredSession = useCallback(
    (restored) => {
      applyAuthenticatedUser(
        {
          id: restored.sessionUser.id,
          email: restored.sessionUser.email,
          user_metadata: { role: restored.sessionUser.role },
        },
        { serverSessionUser: restored.sessionUser }
      );

      if (!restored.restored && restored.session?.access_token && restored.session?.refresh_token) {
        void supabase.auth
          .setSession({
            access_token: restored.session.access_token,
            refresh_token: restored.session.refresh_token,
          })
          .catch((err) => {
            console.warn("Background setSession skipped:", err?.message || err);
          });
      }
    },
    [applyAuthenticatedUser]
  );

  const beginAuthBootstrap = useCallback(() => {
    bootstrapAbortRef.current?.abort();

    const requestId = bootstrapRequestRef.current + 1;
    bootstrapRequestRef.current = requestId;

    const controller = new AbortController();
    bootstrapAbortRef.current = controller;
    initCompleteRef.current = false;

    if (mountedRef.current && !authenticatedRef.current) {
      setAuthReady(false);
      setAuthResolved(false);
      setStatus("loading");
    }

    return { requestId, signal: controller.signal };
  }, []);

  const finishAuthBootstrap = useCallback((requestId) => {
    if (!isCurrentBootstrap(requestId)) return;

    initCompleteRef.current = true;
    setAuthReady(true);
  }, [isCurrentBootstrap]);

  const runAuthBootstrap = useCallback(
    async ({ requestId, signal }) => {
      for (let attempt = 1; attempt <= AUTH_BOOTSTRAP_MAX_ATTEMPTS; attempt += 1) {
        if (!isCurrentBootstrap(requestId)) {
          return "cancelled";
        }

        if (authenticatedRef.current) {
          return "authenticated";
        }

        setBootstrapLoadingState(requestId, {
          nextStatus: attempt === 1 ? "loading" : "restoring",
        });

        try {
          const restored = await restoreSessionFromCookies({ signal });

          if (!isCurrentBootstrap(requestId)) {
            return "cancelled";
          }

          if (authenticatedRef.current) {
            return "authenticated";
          }

          if (restored.outcome === "authenticated" && restored.sessionUser?.email) {
            applyRestoredSession(restored);
            return "authenticated";
          }

          if (restored.outcome === "unauthenticated") {
            const { user: authUser } = await resolveSupabaseAuthUser();

            if (!isCurrentBootstrap(requestId)) {
              return "cancelled";
            }

            if (authenticatedRef.current || authUser?.email) {
              if (authUser?.email) {
                applyAuthenticatedUser(authUser);
              }
              return "authenticated";
            }

            clearAuthenticatedUser();
            return "unauthenticated";
          }

          const { user: authUser } = await resolveSupabaseAuthUser();

          if (!isCurrentBootstrap(requestId)) {
            return "cancelled";
          }

          if (authenticatedRef.current || authUser?.email) {
            if (authUser?.email) {
              applyAuthenticatedUser(authUser);
            }
            return "authenticated";
          }

          if (
            shouldRunBootstrapRetry({
              outcome: "transient_error",
              attempt,
              maxAttempts: AUTH_BOOTSTRAP_MAX_ATTEMPTS,
            })
          ) {
            setBootstrapStatus(requestId, "restoring");
            await waitWithAbort(getBootstrapRetryDelayMs(attempt), signal);
            continue;
          }

          markAuthErrorForRequest(requestId);
          return "error";
        } catch (err) {
          if (err?.name === "AbortError") {
            return "cancelled";
          }

          console.warn("runAuthBootstrap attempt failed:", err?.message || err);

          if (!isCurrentBootstrap(requestId)) {
            return "cancelled";
          }

          if (authenticatedRef.current) {
            return "authenticated";
          }

          if (
            shouldRunBootstrapRetry({
              outcome: "transient_error",
              attempt,
              maxAttempts: AUTH_BOOTSTRAP_MAX_ATTEMPTS,
            })
          ) {
            setBootstrapStatus(requestId, "restoring");
            await waitWithAbort(getBootstrapRetryDelayMs(attempt), signal);
            continue;
          }

          markAuthErrorForRequest(requestId);
          return "error";
        }
      }

      if (
        shouldMarkBootstrapError({
          currentRequestId: bootstrapRequestRef.current,
          requestId,
          mounted: mountedRef.current,
          authenticated: authenticatedRef.current,
        })
      ) {
        markAuthErrorForRequest(requestId);
        return "error";
      }

      return authenticatedRef.current ? "authenticated" : "cancelled";
    },
    [
      applyAuthenticatedUser,
      applyRestoredSession,
      clearAuthenticatedUser,
      isCurrentBootstrap,
      markAuthErrorForRequest,
      setBootstrapLoadingState,
      setBootstrapStatus,
    ]
  );

  useEffect(() => {
    const { requestId, signal } = beginAuthBootstrap();

    void (async () => {
      try {
        await runAuthBootstrap({ requestId, signal });
      } finally {
        finishAuthBootstrap(requestId);
      }
    })();

    return () => {
      bootstrapAbortRef.current?.abort();
    };
  }, [beginAuthBootstrap, finishAuthBootstrap, runAuthBootstrap]);

  useEffect(() => {
    let active = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") {
        if (session?.user?.email && !initCompleteRef.current) {
          applyAuthenticatedUser(session.user);
        }
        return;
      }

      if (event === "SIGNED_OUT") {
        if (!initCompleteRef.current) return;
        clearAuthenticatedUser();
        return;
      }

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        const sessionUser = session?.user ?? null;

        void (async () => {
          if (!active) return;

          if (sessionUser?.email) {
            const wasAuthenticated = authenticatedRef.current;
            applyAuthenticatedUser(sessionUser, {
              enrichProfile: !wasAuthenticated,
            });
            if (wasAuthenticated && event === "TOKEN_REFRESHED" && typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("hc:admin-background-refresh", {
                  detail: { source: "token_refreshed" },
                })
              );
            }
            return;
          }

          const { user: authUser, error } = await resolveSupabaseAuthUser();

          if (!active) return;

          if (error || !authUser?.email) {
            if (!initCompleteRef.current) return;
            clearAuthenticatedUser();
            return;
          }

          applyAuthenticatedUser(authUser);
        })();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [applyAuthenticatedUser, clearAuthenticatedUser]);

  const retryAuth = useCallback(() => {
    const { requestId, signal } = beginAuthBootstrap();

    void (async () => {
      try {
        await runAuthBootstrap({ requestId, signal });
      } finally {
        finishAuthBootstrap(requestId);
      }
    })();
  }, [beginAuthBootstrap, finishAuthBootstrap, runAuthBootstrap]);

  const acknowledgeSignIn = useCallback(
    (authUser) => {
      if (!authUser?.email) return;

      flushSync(() => {
        applyAuthenticatedUser(authUser);
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("hc:session-ready", {
            detail: { email: authUser.email },
          })
        );
      }
    },
    [applyAuthenticatedUser]
  );

  const logout = useCallback(async () => {
    bootstrapAbortRef.current?.abort();

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.warn("Logout cookie clear skipped:", err?.message || err);
    }

    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("Supabase signOut skipped:", err?.message || err);
    }

    clearAuthenticatedUser();
  }, [clearAuthenticatedUser]);

  const isAdminLegacy = useMemo(() => isAdminUser(user), [user]);
  const [iam, setIam] = useState(null);
  const [iamReady, setIamReady] = useState(false);
  const [iamUiEnabled, setIamUiEnabled] = useState(false);
  const [iamApiEnabled, setIamApiEnabled] = useState(false);
  const [iamError, setIamError] = useState(false);

  useLayoutEffect(() => {
    if (status === "authenticated" && user?.email) {
      setIamReady(false);
      setIamError(false);
      setIam(null);
      setIamUiEnabled(false);
      setIamApiEnabled(false);
    }
  }, [status, user?.email]);

  const refreshIam = useCallback(async () => {
    if (!user?.email) {
      setIam(null);
      setIamError(false);
      setIamReady(true);
      return null;
    }
    try {
      const response = await fetch("/api/iam/me", { credentials: "same-origin" });
      if (!response.ok) {
        setIam(null);
        setIamError(true);
        setIamReady(true);
        return null;
      }
      const payload = await response.json();
      const flags = payload.featureFlags || {};
      const uiEnabled = Boolean(flags.IAM_UI);
      const apiEnabled = Boolean(flags.IAM_API);
      setIamUiEnabled(uiEnabled);
      setIamApiEnabled(apiEnabled);
      const perms = payload.permissions || payload.iam?.permissions || [];
      const next = {
        isAdmin: Boolean(payload.isAdmin),
        roleIds: payload.roles || payload.iam?.roleIds || [],
        roleLabels: payload.roleLabels || payload.iam?.roleLabels || [],
        primaryRoleId: payload.primaryRoleId || payload.iam?.primaryRoleId || null,
        primaryRoleLabel: payload.primaryRoleLabel || payload.iam?.primaryRoleLabel || null,
        isSuperAdmin: Boolean(payload.isSuperAdmin ?? payload.iam?.isSuperAdmin),
        source: payload.source || payload.iam?.source || null,
        permissions: new Set(perms),
        can: (permission) => perms.includes(permission),
        bootstrap: payload.bootstrap || payload.iam?.bootstrap,
        featureFlags: flags,
      };
      setIam(next);
      setIamError(false);
      setIamReady(true);
      return next;
    } catch {
      setIam(null);
      setIamError(true);
      setIamReady(true);
      return null;
    }
  }, [user?.email]);

  useEffect(() => {
    if (status === "authenticated" && user?.email) {
      void refreshIam();
    } else if (status === "unauthenticated") {
      setIam(null);
      setIamError(false);
      setIamReady(true);
      setIamUiEnabled(false);
      setIamApiEnabled(false);
    }
  }, [status, user?.email, refreshIam]);

  const isAdmin = useMemo(() => {
    if (iamUiEnabled || iamApiEnabled) {
      if (!iamReady) return false;
      if (iam?.isAdmin != null) return Boolean(iam.isAdmin);
      return false;
    }
    if (iam?.isAdmin != null) return Boolean(iam.isAdmin);
    return isAdminLegacy;
  }, [iam, isAdminLegacy, iamUiEnabled, iamApiEnabled, iamReady]);

  const value = useMemo(
    () => ({
      authReady,
      authResolved,
      profileReady,
      status,
      user,
      isAdmin,
      isAdminLegacy,
      iam,
      iamReady,
      iamUiEnabled,
      iamApiEnabled,
      iamError,
      refreshIam,
      can: (permission) => {
        if ((iamUiEnabled || iamApiEnabled) && iam?.can) return iam.can(permission);
        return isAdminLegacy;
      },
      acknowledgeSignIn,
      logout,
      retryAuth,
      updateUser: setUser,
    }),
    [
      authReady,
      authResolved,
      profileReady,
      status,
      user,
      isAdmin,
      isAdminLegacy,
      iam,
      iamReady,
      iamUiEnabled,
      iamApiEnabled,
      iamError,
      refreshIam,
      acknowledgeSignIn,
      logout,
      retryAuth,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
