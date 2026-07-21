"use client";

import "./admin-access-loading.css";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import {
  buildAdminLoginRedirect,
  resolveAdminGatePhase,
  shouldRedirectAdminTo403,
  shouldRedirectAdminToLogin,
} from "../../lib/admin-auth-guard";
import { useAuth } from "./AuthProvider";

function AdminAccessLoading({
  title = "جاري التحقق من صلاحيات الإدارة",
  description = "يرجى الانتظار حتى اكتمال فحص الجلسة وصلاحيات الإدارة...",
  action = null,
}) {
  return (
    <main className="admin-access-loading admin-access-loading--calm">
      <div className="admin-access-loading__panel">
        <div className="admin-access-loading__icon" aria-hidden="true">
          ⏳
        </div>
        <h1 className="admin-access-loading__title">{title}</h1>
        <p className="admin-access-loading__desc">{description}</p>
        {action}
      </div>
    </main>
  );
}

export function AdminAccessGate({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { authReady, authResolved, profileReady, user, isAdmin, status, retryAuth } = useAuth();
  const redirectStartedRef = useRef(false);

  const isAuthenticated = status === "authenticated" && Boolean(user?.email);

  const phase = useMemo(
    () =>
      resolveAdminGatePhase({
        authReady,
        authResolved,
        status,
        profileReady,
        isAuthenticated,
        isAdmin,
      }),
    [authReady, authResolved, status, profileReady, isAuthenticated, isAdmin]
  );

  useEffect(() => {
    redirectStartedRef.current = false;
  }, [pathname]);

  useEffect(() => {
    if (!shouldRedirectAdminToLogin(phase)) return;
    if (redirectStartedRef.current) return;

    const loginPath = buildAdminLoginRedirect(pathname);
    if (pathname === "/login") return;

    redirectStartedRef.current = true;
    router.replace(loginPath);
  }, [phase, pathname, router]);

  useEffect(() => {
    if (!shouldRedirectAdminTo403(phase)) return;
    if (redirectStartedRef.current) return;

    redirectStartedRef.current = true;
    router.replace("/403");
  }, [phase, router]);

  if (phase === "loading") {
    return <AdminAccessLoading />;
  }

  if (phase === "error") {
    return (
      <AdminAccessLoading
        title="تعذر التحقق من الجلسة"
        description="حدثت مشكلة مؤقتة أثناء قراءة الجلسة. لن يتم تسجيل خروجك تلقائياً."
        action={
          <button type="button" className="admin-access-loading__retry" onClick={retryAuth}>
            إعادة المحاولة
          </button>
        }
      />
    );
  }

  if (phase === "authenticated") {
    return children;
  }

  if (phase === "unauthorized") {
    return (
      <AdminAccessLoading
        title="غير مصرح"
        description="حسابك مسجل الدخول لكنه لا يملك صلاحيات الإدارة."
      />
    );
  }

  return <AdminAccessLoading />;
}
