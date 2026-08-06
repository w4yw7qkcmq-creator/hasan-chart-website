"use client";
import Link from "next/link";
import { EmptyState } from "./EmptyState";
function StatusPill({ status, label }) {
  const tone =
    status === "delivered"
      ? "admin-email-status-success "
      : status === "failed" || status === "bounced"
        ? "admin-email-status-danger "
        : status === "complained"
          ? "border-orange-200 bg-orange-50 text-orange-800 "
          : "admin-panel-border admin-panel admin-text-muted ";
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${tone}`}
    >
      {label}
    </span>
  );
}
function MetricBadge({ value }) {
  return (
    <span className="inline-flex min-w-8 justify-center rounded-full border border-[var(--ui-border)]200 bg-slate-50 px-2.5 py-1 text-xs font-black admin-text-muted">
      {" "}
      {value}{" "}
    </span>
  );
}
function EmailRowCard({ row }) {
  return (
    <Link
      href={`/admin/email-analytics/${row.id}`}
      className="block rounded-[24px] border border-[var(--ui-border)]200 bg-slate-50/80 p-4 no-underline transition hover:admin-panel-border hover:admin-panel"
    >
      {" "}
      <div className="flex flex-wrap items-start justify-between gap-3">
        {" "}
        <div className="min-w-0 flex-1">
          {" "}
          <p className="truncate font-black admin-text">{row.email}</p>{" "}
          <p
            className="mt-1 truncate text-sm font-medium admin-text-muted"
            title={row.subject}
          >
            {" "}
            {row.subject}{" "}
          </p>{" "}
        </div>{" "}
        <StatusPill status={row.status} label={row.statusLabel} />{" "}
      </div>{" "}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold admin-text-muted">
        {" "}
        <div>
          {" "}
          <span className="admin-text-subtle">النوع: </span>{" "}
          {row.messageType}{" "}
        </div>{" "}
        <div>
          {" "}
          <span className="admin-text-subtle">الإرسال: </span>{" "}
          {row.sentAtLabel}{" "}
        </div>{" "}
        <div>
          {" "}
          <span className="admin-text-subtle">الفتح: </span>{" "}
          {row.openedAtLabel}{" "}
        </div>{" "}
        <div className="flex items-center gap-2">
          {" "}
          <span className="admin-text-subtle">التفاعل:</span>{" "}
          <MetricBadge value={row.openCount} />{" "}
          <MetricBadge value={row.clickCount} />{" "}
        </div>{" "}
        <div>
          {" "}
          <span className="admin-text-subtle">الجهاز: </span> {row.device}{" "}
        </div>{" "}
        <div>
          {" "}
          <span className="admin-text-subtle">الدولة: </span> {row.country}{" "}
        </div>{" "}
      </div>{" "}
    </Link>
  );
}
export function EmailTable({ rows = [] }) {
  if (!rows.length) {
    return (
      <div className="overflow-hidden rounded-[28px] border border-[var(--ui-border)]200 ui-glass-solid shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
        {" "}
        <EmptyState description="بعد ربط Webhook أو المزامنة مع Resend ستظهر الرسائل هنا. يمكنك استخدام الفلاتر للبحث فور توفر البيانات." />{" "}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-[28px] border border-[var(--ui-border)]200 ui-glass-solid shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      {" "}
      <div className="border-b border-[var(--ui-border)]200 px-6 py-5">
        {" "}
        <p className="text-xs font-black uppercase tracking-[0.18em] admin-text-muted">
          {" "}
          الرسائل{" "}
        </p>{" "}
        <h2 className="mt-2 text-2xl font-black admin-text">
          سجل الإيميلات
        </h2>{" "}
        <p className="mt-1 text-sm admin-text-subtle">
          {" "}
          {rows.length.toLocaleString("ar")} رسالة — اضغط على أي صف لعرض
          التفاصيل{" "}
        </p>{" "}
      </div>{" "}
      <div className="space-y-3 p-4 lg:hidden">
        {" "}
        {rows.map((row) => (
          <EmailRowCard key={row.id || row.resendId} row={row} />
        ))}{" "}
      </div>{" "}
      <div className="hidden lg:block">
        {" "}
        <table className="w-full text-right text-sm">
          {" "}
          <thead className="bg-slate-50/90 admin-text-muted">
            {" "}
            <tr>
              {" "}
              <th className="px-4 py-4 font-black">البريد</th>{" "}
              <th className="px-4 py-4 font-black">النوع</th>{" "}
              <th className="px-4 py-4 font-black">الموضوع</th>{" "}
              <th className="px-4 py-4 font-black">الحالة</th>{" "}
              <th className="px-4 py-4 font-black">وقت الإرسال</th>{" "}
              <th className="px-4 py-4 font-black">وقت الفتح</th>{" "}
              <th className="px-4 py-4 font-black">مرات الفتح</th>{" "}
              <th className="px-4 py-4 font-black">النقرات</th>{" "}
              <th className="px-4 py-4 font-black">الجهاز</th>{" "}
              <th className="px-4 py-4 font-black">الدولة</th>{" "}
              <th className="px-4 py-4 font-black">عنوان IP</th>{" "}
            </tr>{" "}
          </thead>{" "}
          <tbody>
            {" "}
            {rows.map((row) => (
              <tr
                key={row.id || row.resendId}
                className="group border-t border-[var(--ui-border)]100 transition duration-200 hover:admin-panel"
              >
                {" "}
                <td className="px-4 py-4">
                  {" "}
                  <Link
                    href={`/admin/email-analytics/${row.id}`}
                    className="block font-bold admin-text transition group-hover:admin-text-muted"
                  >
                    {" "}
                    {row.email}{" "}
                  </Link>{" "}
                </td>{" "}
                <td className="px-4 py-4 font-bold admin-text-muted">
                  {row.messageType}
                </td>{" "}
                <td className="max-w-[220px] px-4 py-4">
                  {" "}
                  <Link
                    href={`/admin/email-analytics/${row.id}`}
                    className="block truncate font-medium admin-text-muted transition hover:admin-text-muted"
                    title={row.subject}
                  >
                    {" "}
                    {row.subject}{" "}
                  </Link>{" "}
                </td>{" "}
                <td className="px-4 py-4">
                  {" "}
                  <StatusPill
                    status={row.status}
                    label={row.statusLabel}
                  />{" "}
                </td>{" "}
                <td className="whitespace-nowrap px-4 py-4 font-medium admin-text-muted">
                  {" "}
                  {row.sentAtLabel}{" "}
                </td>{" "}
                <td className="whitespace-nowrap px-4 py-4 font-medium admin-text-muted">
                  {" "}
                  {row.openedAtLabel}{" "}
                </td>{" "}
                <td className="px-4 py-4">
                  {" "}
                  <MetricBadge value={row.openCount} />{" "}
                </td>{" "}
                <td className="px-4 py-4">
                  {" "}
                  <MetricBadge value={row.clickCount} />{" "}
                </td>{" "}
                <td className="px-4 py-4 font-medium admin-text-muted">
                  {row.device}
                </td>{" "}
                <td className="px-4 py-4 font-medium admin-text-muted">
                  {row.country}
                </td>{" "}
                <td className="px-4 py-4 font-mono text-xs admin-text-subtle">
                  {row.ipAddress}
                </td>{" "}
              </tr>
            ))}{" "}
          </tbody>{" "}
        </table>{" "}
      </div>{" "}
    </div>
  );
}
