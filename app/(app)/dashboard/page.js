"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.push("/");
  }, [router]);

  return (
    <main className="min-h-screen bg-[#020617] text-white flex items-center justify-center">
      <p>جاري تحويلك إلى الصفحة الرئيسية...</p>
    </main>
  );
}