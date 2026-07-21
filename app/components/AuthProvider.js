"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { isAdminUser } from "../../lib/admin-emails";
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
  const initInFlightRef = useRef(false);
  const authenticatedRef = useRef(false);

  const enrichUserProfile = useCallback(async (authUser) => {
    if (!authUser?.email) {
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

      if (enrichRequestRef.current !== requestId) {
        return;
      }

      if (appUser) {
        setUser(appUser);
      }
    } catch (err) {
      console.warn("Profile enrich skipped:", err?.message || err);
    } finally {
      if (enrichRequestRef.current === requestId) {
        setProfileReady(true);
      }
    }
  }, []);

  const applyAuthenticatedUser = useCallback(
    (authUser, { enrichProfile = true, serverSessionUser = null } = {}) => {
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
        setProfileReady(false);
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
    enrichRequestRef.current += 1;
    authenticatedRef.current = false;
    setUser(null);
    setStatus("unauthenticated");
    setProfileReady(true);
    setAuthResolved(true);
  }, []);

  const markAuthError = useCallback(() => {
    enrichRequestRef.current += 1;
    setStatus("error");
    setProfileReady(true);
    setAuthResolved(true);
  }, []);

  useEffect(() => {
    let active = true;

    async function initAuth() {
      if (initInFlightRef.current) return;
      initInFlightRef.current = true;
      initCompleteRef.current = false;
      setAuthReady(false);

      if (!authenticatedRef.current) {
        setStatus("loading");
        setAuthResolved(false);
      }

      try {
        const restored = await restoreSessionFromCookies();

        if (!active) return;

        if (restored.outcome === "authenticated" && restored.sessionUser?.email) {
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
          return;
        }

        if (restored.outcome === "transient_error") {
          const { user: authUser } = await resolveSupabaseAuthUser();

          if (!active) return;

          if (authUser?.email) {
            applyAuthenticatedUser(authUser);
            return;
          }

          markAuthError();
          return;
        }

        const { user: authUser } = await resolveSupabaseAuthUser();

        if (!active) return;

        if (authUser?.email) {
          applyAuthenticatedUser(authUser);
          return;
        }

        clearAuthenticatedUser();
      } catch (err) {
        console.warn("initAuth failed:", err?.message || err);
        if (active) {
          markAuthError();
        }
      } finally {
        initInFlightRef.current = false;
        if (active) {
          initCompleteRef.current = true;
          setAuthReady(true);
        }
      }
    }

    void initAuth();

    return () => {
      active = false;
    };
  }, [applyAuthenticatedUser, clearAuthenticatedUser, markAuthError]);

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
            applyAuthenticatedUser(sessionUser);
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
    if (initInFlightRef.current) return;

    setAuthReady(false);
    setAuthResolved(false);
    setStatus("loading");

    void (async () => {
      initInFlightRef.current = true;
      initCompleteRef.current = false;

      try {
        const restored = await restoreSessionFromCookies();

        if (restored.outcome === "authenticated" && restored.sessionUser?.email) {
          applyAuthenticatedUser(
            {
              id: restored.sessionUser.id,
              email: restored.sessionUser.email,
              user_metadata: { role: restored.sessionUser.role },
            },
            { serverSessionUser: restored.sessionUser }
          );
          return;
        }

        if (restored.outcome === "transient_error") {
          const { user: authUser } = await resolveSupabaseAuthUser();

          if (authUser?.email) {
            applyAuthenticatedUser(authUser);
            return;
          }

          markAuthError();
          return;
        }

        const { user: authUser } = await resolveSupabaseAuthUser();

        if (authUser?.email) {
          applyAuthenticatedUser(authUser);
          return;
        }

        clearAuthenticatedUser();
      } catch (err) {
        console.warn("retryAuth failed:", err?.message || err);
        markAuthError();
      } finally {
        initInFlightRef.current = false;
        initCompleteRef.current = true;
        setAuthReady(true);
      }
    })();
  }, [applyAuthenticatedUser, clearAuthenticatedUser, markAuthError]);

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

  const isAdmin = useMemo(() => isAdminUser(user), [user]);

  const value = useMemo(
    () => ({
      authReady,
      authResolved,
      profileReady,
      status,
      user,
      isAdmin,
      acknowledgeSignIn,
      logout,
      retryAuth,
      updateUser: setUser,
    }),
    [authReady, authResolved, profileReady, status, user, isAdmin, acknowledgeSignIn, logout, retryAuth]
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
