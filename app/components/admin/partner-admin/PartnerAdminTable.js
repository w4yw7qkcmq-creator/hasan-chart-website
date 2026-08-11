"use client";

export default function PartnerAdminTable({ children, className = "", sticky = true }) {
  return (
    <div className={`pa-table-wrap admin-table-wrap ${className}`.trim()}>
      <table className={`pa-table admin-table ${sticky ? "pa-table--sticky" : ""}`.trim()}>
        {children}
      </table>
    </div>
  );
}
