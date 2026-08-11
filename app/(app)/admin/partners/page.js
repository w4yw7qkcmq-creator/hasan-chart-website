"use client";

import { Suspense } from "react";
import "../admin-theme.css";
import "../partner-admin-theme.css";
import AdminPartnerCenterHub from "../../../components/admin/AdminPartnerCenterHub";

export default function AdminPartnersPage() {
  return (
    <Suspense
      fallback={
        <main className="admin-theme-page admin-panel p-6">
          <p className="admin-muted">جاري تحميل مركز إدارة الشركاء...</p>
        </main>
      }
    >
      <AdminPartnerCenterHub />
    </Suspense>
  );
}
