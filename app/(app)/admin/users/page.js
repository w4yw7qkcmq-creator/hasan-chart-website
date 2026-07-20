"use client";

import "../admin-theme.css";
import { useEffect, useState } from "react";
import { useAuth } from "../../../components/AuthProvider";
import AdminUserManagementPanel from "../components/AdminUserManagementPanel";

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [currentAdminUserId, setCurrentAdminUserId] = useState("");

  useEffect(() => {
    setCurrentAdminUserId(String(user?.id || ""));
  }, [user?.id]);

  return (
    <div className="admin-standalone-page">
      <AdminUserManagementPanel standalone currentAdminUserId={currentAdminUserId} />
    </div>
  );
}
