"use client";

import { getAdminStatusKey, getAdminStatusLabel } from "../(app)/admin/admin-dashboard-helpers";

const PARTNER_STATUS_CLASS = {
  pending: "admin-badge--pending",
  approved: "admin-badge--approved",
  rejected: "admin-badge--rejected",
  paid: "admin-badge--paid",
  active: "admin-badge--active",
  suspended: "admin-badge--suspended",
  registered: "admin-badge--approved",
};

const PARTNER_STATUS_LABELS = {
  pending: "معلق",
  approved: "معتمد",
  rejected: "مرفوض",
  paid: "مدفوع",
  active: "نشط",
  suspended: "موقوف",
  registered: "مسجل",
};

function resolveDashboardLabel(status) {
  if (status === "triggered") return "تم الوصول";
  if (status === "active") return "نشط";
  if (status === "مكتمل") return "مكتمل";
  return status || "غير محدد";
}

function resolveDashboardClass(status) {
  if (status === "triggered" || status === "مكتمل") {
    return "user-dashboard-badge--done";
  }
  if (status === "active") {
    return "user-dashboard-badge--active";
  }
  return "user-dashboard-badge--new";
}

export default function StatusBadge({ status, variant = "admin-request" }) {
  if (variant === "partner") {
    const key = String(status || "").toLowerCase();

    return (
      <span className={`admin-badge ${PARTNER_STATUS_CLASS[key] || "admin-badge--suspended"}`}>
        {PARTNER_STATUS_LABELS[key] || status}
      </span>
    );
  }

  if (variant === "analysis") {
    const isDone = status === "مكتمل";
    const isPending = status === "قيد المراجعة" || !status;
    const badgeClass = isDone
      ? "user-dashboard-badge--done"
      : isPending
      ? "user-dashboard-badge--new"
      : "user-dashboard-badge--active";

    return (
      <span className={`user-dashboard-badge ${badgeClass}`}>{status || "قيد المراجعة"}</span>
    );
  }

  if (variant === "dashboard") {
    return (
      <span className={`user-dashboard-badge ${resolveDashboardClass(status)}`}>
        {resolveDashboardLabel(status)}
      </span>
    );
  }

  const isReviewed = getAdminStatusKey(status) === "reviewed";

  return (
    <span className={`admin-badge shrink-0 ${isReviewed ? "admin-badge--reviewed" : "admin-badge--pending"}`}>
      {getAdminStatusLabel(status)}
    </span>
  );
}
