"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { isAdminUser } from "../../lib/admin-emails";
import {
  applySessionAfterLogin,
  resetAuthBootstrap,
  runAuthBootstrap,
} from "../../lib/auth-bootstrap";
import { supabase } from "../../lib/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authResolved, setAuthResolved] = useState(false);
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);

  useEffect(() => {
    let active = true;

    runAuthBootstrap().then((result) => {
      if (!active) return;

      setUser(result.user);
      setStatus(result.status);
      setAuthResolved(true);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!authResolved) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "INITIAL_SESSION") return;

      if (event === "SIGNED_OUT") {
        resetAuthBootstrap();
        setUser(null);
        setStatus("unauthenticated");
        return;
      }

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        const result = await runAuthBootstrap();
        setUser(result.user);
        setStatus(result.status);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [authResolved]);

  const establishSession = useCallback(async (session) => {
    setStatus("loading");
    setAuthResolved(false);

    const result = await applySessionAfterLogin(session);

    setUser(result.user);
    setStatus(result.status);
    setAuthResolved(true);

    return result;
  }, []);

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

    resetAuthBootstrap();
    setUser(null);
    setStatus("unauthenticated");
    setAuthResolved(true);
  }, []);

  const isAdmin = useMemo(() => isAdminUser(user), [user]);

  const value = useMemo(
    () => ({
      authResolved,
      status,
      user,
      isAdmin,
      establishSession,
      logout,
      updateUser: setUser,
    }),
    [authResolved, status, user, isAdmin, establishSession, logout]
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
