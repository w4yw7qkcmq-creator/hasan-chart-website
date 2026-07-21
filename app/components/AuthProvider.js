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
  const [authResolved, setAuthResolved] = useState(false);
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);
  const [profileReady, setProfileReady] = useState(false);
  const enrichRequestRef = useRef(0);
  const initCompleteRef = useRef(false);
  const initInFlightRef = useRef(false);

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
        setUser(null);
        setStatus("unauthenticated");
        setProfileReady(true);
        setAuthResolved(true);
        return;
      }

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
    setUser(null);
    setStatus("unauthenticated");
    setProfileReady(true);
    setAuthResolved(true);
  }, []);

  const resolveAuthUserWithRetry = useCallback(async () => {
    let { user: authUser, error } = await resolveSupabaseAuthUser();

    if (authUser?.email) {
      return { authUser, error: null };
    }

    await new Promise((resolve) => setTimeout(resolve, 120));
    ({ user: authUser, error } = await resolveSupabaseAuthUser());

    return { authUser, error };
  }, []);

  useEffect(() => {
    let active = true;

    async function initAuth() {
      if (initInFlightRef.current) return;
      initInFlightRef.current = true;
      initCompleteRef.current = false;
      setStatus("loading");
      setAuthResolved(false);

      try {
        const restored = await restoreSessionFromCookies();

        if (!active) return;

        const { authUser, error } = await resolveAuthUserWithRetry();

        if (!active) return;

        if (authUser?.email) {
          applyAuthenticatedUser(authUser, {
            serverSessionUser: restored.sessionUser,
          });
          return;
        }

        if (restored.sessionUser?.email) {
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

        if (error) {
          console.warn("resolveSupabaseAuthUser skipped:", error.message);
        }

        clearAuthenticatedUser();
      } catch (err) {
        console.warn("initAuth failed:", err?.message || err);
        if (active) {
          clearAuthenticatedUser();
        }
      } finally {
        initInFlightRef.current = false;
        if (active) {
          initCompleteRef.current = true;
        }
      }
    }

    void initAuth();

    return () => {
      active = false;
    };
  }, [applyAuthenticatedUser, clearAuthenticatedUser, resolveAuthUserWithRetry]);

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

        setTimeout(() => {
          if (!active) return;

          void (async () => {
            if (sessionUser?.email) {
              applyAuthenticatedUser(sessionUser);
              return;
            }

            const { user: authUser, error } = await resolveSupabaseAuthUser();

            if (!active) return;

            if (error || !authUser?.email) {
              clearAuthenticatedUser();
              return;
            }

            applyAuthenticatedUser(authUser);
          })();
        }, 0);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [applyAuthenticatedUser, clearAuthenticatedUser]);

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
      authResolved,
      profileReady,
      status,
      user,
      isAdmin,
      acknowledgeSignIn,
      logout,
      updateUser: setUser,
    }),
    [authResolved, profileReady, status, user, isAdmin, acknowledgeSignIn, logout]
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
