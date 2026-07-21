"use client";

import "../../admin-theme.css";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "../../../../components/AuthProvider";
import { AdminUserCenterView } from "../../components/AdminUserCenterView";

export default function AdminUserDetailPage() {
  const params = useParams();
  const { user } = useAuth();
  const [currentAdminUserId, setCurrentAdminUserId] = useState("");
  const userId = String(params?.userId || "").trim();

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
      <AdminUserCenterView userId={userId} currentAdminUserId={currentAdminUserId} layoutMode="page" />
    </div>
  );
}
