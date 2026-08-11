"use client";

import "../../admin-theme.css";
import "../../admin-crm-theme.css";
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useAuth } from "../../../../components/AuthProvider";
import { AdminUserCenterView } from "../../components/AdminUserCenterView";

function AdminUserDetailPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [currentAdminUserId, setCurrentAdminUserId] = useState("");
  const userId = String(params?.userId || "").trim();
  const initialTab = String(searchParams?.get("tab") || "overview").trim();

  useEffect(() => {
    setCurrentAdminUserId(String(user?.id || ""));
  }, [user?.id]);

  if (!userId) {
    return (
      <div className="admin-standalone-page p-6">
        <p className="font-black text-red-300">معرّف المستخدم غير صالح.</p>
      </div>
    );
  }

  return (
    <div className="admin-standalone-page admin-standalone-page--calm">
      <AdminUserCenterView
        userId={userId}
        currentAdminUserId={currentAdminUserId}
        layoutMode="page"
        initialTab={initialTab}
      />
    </div>
  );
}

export default function AdminUserDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="admin-standalone-page p-6">
          <p className="font-black">جاري تحميل CRM...</p>
        </div>
      }
    >
      <AdminUserDetailPageInner />
    </Suspense>
  );
}
