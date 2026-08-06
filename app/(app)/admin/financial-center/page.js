"use client";
import Link from "next/link";
import "../admin-theme.css";
import FinancialCenterPanel from "../components/FinancialCenterPanel";
export default function AdminFinancialCenterPage() {
  return (
    <div className="admin-standalone-page admin-standalone-page--calm">
      {" "}
      <div className="admin-standalone-page__toolbar">
        {" "}
        <Link href="/admin" className="admin-standalone-back-link">
          {" "}
          ← العودة إلى لوحة الإدارة{" "}
        </Link>{" "}
      </div>{" "}
      <FinancialCenterPanel standalone />{" "}
    </div>
  );
}
