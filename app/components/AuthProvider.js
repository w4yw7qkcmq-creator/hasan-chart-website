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
import { isAdminUser } from "../../lib/admin-emails";
import { buildAppUser } from "../../lib/auth-profile";
import {
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

  const enrichUserProfile = useCallback(async (authUser) => {
    if (!authUser?.email) {
      setProfileReady(true);
      return;
    }

    const requestId = enrichRequestRef.current + 1;
    enrichRequestRef.current = requestId;

    try {
      const appUser = await buildAppUser(authUser, supabase);

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
    (authUser, { enrichProfile = true } = {}) => {
      const minimalUser = buildMinimalAppUser(authUser);

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
        void enrichUserProfile(authUser);
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

  useEffect(() => {
    let active = true;

    async function initAuth() {
      await restoreSessionFromCookies();

      const { user: authUser, error } = await resolveSupabaseAuthUser();

      if (!active) return;

      if (error || !authUser?.email) {
        clearAuthenticatedUser();
        return;
      }

      applyAuthenticatedUser(authUser);
    }

    void initAuth();

    return () => {
      active = false;
    };
  }, [applyAuthenticatedUser, clearAuthenticatedUser]);

  useEffect(() => {
    let active = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;

      if (event === "SIGNED_OUT") {
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
      applyAuthenticatedUser(authUser);
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
