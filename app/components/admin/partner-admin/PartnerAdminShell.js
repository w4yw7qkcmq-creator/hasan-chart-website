"use client";

export default function PartnerAdminShell({ children, className = "" }) {
  return (
    <main className={`pa-shell admin-theme-page ${className}`.trim()} dir="rtl">
      <div className="pa-shell__inner">{children}</div>
    </main>
  );
}
