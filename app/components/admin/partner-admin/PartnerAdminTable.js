"use client";

export default function PartnerAdminTable({
  children,
  className = "",
  sticky = true,
  scroll = true,
}) {
  const wrapClass = scroll ? "pa-scroll-table" : "pa-table-wrap admin-table-wrap";

  return (
    <div className={`${wrapClass} ${className}`.trim()}>
      <table className={`pa-table admin-table ${sticky ? "pa-table--sticky" : ""}`.trim()}>
        {children}
      </table>
    </div>
  );
}
