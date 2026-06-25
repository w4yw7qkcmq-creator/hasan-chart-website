"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./AuthProvider";

function AdminAccessLoading() {
  return (
    <main className="relative min-h-[calc(100vh-120px)] overflow-hidden rounded-[34px] border border-cyan-300/10 bg-[#020617] p-6 text-white shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(0,102,255,0.32),transparent_30%),linear-gradient(135deg,#020617,#07142f,#030712)]" />
      <div className="relative z-10 flex min-h-[calc(100vh-180px)] items-center justify-center text-center">
        <div className="max-w-md rounded-[32px] border border-cyan-300/15 bg-white/[0.045] p-8 backdrop-blur-2xl">
          <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] border border-cyan-300/25 bg-cyan-400/10 text-4xl">
            ⏳
          </div>
          <h1 className="text-3xl font-black">جاري التحقق من الجلسة</h1>
          <p className="mt-3 leading-7 text-slate-400">يرجى الانتظار حتى اكتمال فحص صلاحيات الإدارة...</p>
        </div>
      </div>
    </main>
  );
}

export function AdminAccessGate({ children }) {
  const router = useRouter();
  const { authResolved, status, isAdmin } = useAuth();

  useEffect(() => {
    if (!authResolved) return;

    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }

    if (status === "authenticated" && !isAdmin) {
      router.replace("/403");
    }
  }, [authResolved, status, isAdmin, router]);

  if (!authResolved || status === "loading") {
    return <AdminAccessLoading />;
  }

  if (status === "unauthenticated" || !isAdmin) {
    return <AdminAccessLoading />;
  }

  return children;
}
