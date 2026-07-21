"use client";

import "./admin-access-loading.css";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAuth } from "./AuthProvider";

function AdminAccessLoading({ title = "جاري التحقق من صلاحيات الإدارة" }) {
  return (
    <main className="admin-access-loading admin-access-loading--calm">
      <div className="admin-access-loading__panel">
        <div className="admin-access-loading__icon" aria-hidden="true">
          ⏳
        </div>
        <h1 className="admin-access-loading__title">{title}</h1>
        <p className="admin-access-loading__desc">يرجى الانتظار حتى اكتمال فحص الجلسة وصلاحيات الإدارة...</p>
      </div>
    </main>
  );
}

function buildAdminLoginRedirect(pathname) {
  const safePath =
    typeof pathname === "string" && pathname.startsWith("/admin") && !pathname.startsWith("//")
      ? pathname
      : "/admin";
  return `/login?next=${encodeURIComponent(safePath)}`;
}

export function AdminAccessGate({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { authResolved, profileReady, user, isAdmin, status } = useAuth();
  const redirectStartedRef = useRef(false);

  const sessionInitializing = !authResolved || status === "loading";
  const isAuthenticated = status === "authenticated" && Boolean(user?.email);

  useEffect(() => {
    redirectStartedRef.current = false;
  }, [pathname]);

  useEffect(() => {
    if (sessionInitializing) return;
    if (isAuthenticated) return;
    if (status !== "unauthenticated") return;
    if (redirectStartedRef.current) return;

    redirectStartedRef.current = true;
    router.replace(buildAdminLoginRedirect(pathname));
  }, [sessionInitializing, isAuthenticated, status, router, pathname]);

  useEffect(() => {
    if (sessionInitializing || !isAuthenticated) return;
    if (!profileReady) return;
    if (isAdmin) return;

    router.replace("/403");
  }, [sessionInitializing, isAuthenticated, profileReady, isAdmin, router]);

  if (sessionInitializing) {
    return <AdminAccessLoading />;
  }

  if (isAuthenticated && isAdmin) {
    return children;
  }

  if (isAuthenticated && !profileReady) {
    return <AdminAccessLoading />;
  }

  if (isAuthenticated && profileReady && !isAdmin) {
    return <AdminAccessLoading title="غير مصرح" />;
  }

  return <AdminAccessLoading title="جاري التحويل إلى تسجيل الدخول" />;
}
