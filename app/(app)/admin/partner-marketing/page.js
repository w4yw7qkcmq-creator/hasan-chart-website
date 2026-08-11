"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "../admin-theme.css";

const SECTION_TO_TAB = {
  overview: "overview",
  missions: "campaigns",
  campaigns: "campaigns",
  levels: "commissions",
  milestones: "campaigns",
  bonuses: "commissions",
  "qualified-reward": "commissions",
  "service-commissions": "commissions",
  rewards: "commissions",
  fraud: "fraud",
  audit: "audit",
};

function PartnerMarketingRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const section = searchParams.get("section");
    const tab = SECTION_TO_TAB[section] || "campaigns";
    const params = new URLSearchParams();
    params.set("tab", tab);
    router.replace(`/admin/partners?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <main className="admin-theme-page admin-panel p-6">
      <p className="admin-muted">جاري التوجيه إلى مركز إدارة الشركاء...</p>
    </main>
  );
}

export default function AdminPartnerMarketingPage() {
  return (
    <Suspense
      fallback={
        <main className="admin-theme-page admin-panel p-6">
          <p className="admin-muted">جاري التوجيه...</p>
        </main>
      }
    >
      <PartnerMarketingRedirect />
    </Suspense>
  );
}
