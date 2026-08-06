"use client";

import Link from "next/link";
import { EmptyState } from "./EmptyState";

function StatusPill({ status, label }) {
  const tone =
    status === "delivered"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-300/30 dark:bg-emerald-400/10 dark:text-emerald-100"
      : status === "failed" || status === "bounced"
      ? "border-red-200 bg-red-50 text-red-800 dark:border-red-300/30 dark:bg-red-400/10 dark:text-red-100"
      : status === "complained"
      ? "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-300/30 dark:bg-orange-400/10 dark:text-orange-100"
      : "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-300/30 dark:bg-cyan-400/10 dark:text-cyan-100";

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${tone}`}>{label}</span>
  );
}

function MetricBadge({ value }) {
  return (
    <span className="inline-flex min-w-8 justify-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-black text-slate-700 dark:border-cyan-300/15 dark:bg-black/20 dark:text-slate-200">
      {value}
    </span>
  );
}

function EmailRowCard({ row }) {
  return (
    <Link
      href={`/admin/email-analytics/${row.id}`}
      className="block rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 no-underline transition hover:border-cyan-300 hover:bg-cyan-50/50 dark:border-cyan-300/15 dark:bg-black/20 dark:hover:bg-white/[0.05]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-black text-slate-950 dark:text-white">{row.email}</p>
          <p className="mt-1 truncate text-sm font-medium text-slate-600 dark:text-slate-300" title={row.subject}>
            {row.subject}
          </p>
        </div>
        <StatusPill status={row.status} label={row.statusLabel} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
        <div>
          <span className="text-slate-500 dark:text-slate-400">النوع: </span>
          {row.messageType}
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">الإرسال: </span>
          {row.sentAtLabel}
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">الفتح: </span>
          {row.openedAtLabel}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500 dark:text-slate-400">التفاعل:</span>
          <MetricBadge value={row.openCount} />
          <MetricBadge value={row.clickCount} />
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">الجهاز: </span>
          {row.device}
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">الدولة: </span>
          {row.country}
        </div>
      </div>
    </Link>
  );
}

export function EmailTable({ rows = [] }) {
  if (!rows.length) {
    return (
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)] dark:border-cyan-300/15 dark:bg-white/[0.045] dark:shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
        <EmptyState
          description="بعد ربط Webhook أو المزامنة مع Resend ستظهر الرسائل هنا. يمكنك استخدام الفلاتر للبحث فور توفر البيانات."
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)] dark:border-cyan-300/15 dark:bg-white/[0.045] dark:shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
      <div className="border-b border-slate-200 px-6 py-5 dark:border-cyan-300/15">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">
          الرسائل
        </p>
        <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">سجل الإيميلات</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
          {rows.length.toLocaleString("ar")} رسالة — اضغط على أي صف لعرض التفاصيل
        </p>
      </div>

      <div className="space-y-3 p-4 lg:hidden">
        {rows.map((row) => (
          <EmailRowCard key={row.id || row.resendId} row={row} />
        ))}
      </div>

      <div className="hidden lg:block">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50/90 text-slate-600 dark:bg-black/20 dark:text-slate-300">
            <tr>
              <th className="px-4 py-4 font-black">البريد</th>
              <th className="px-4 py-4 font-black">النوع</th>
              <th className="px-4 py-4 font-black">الموضوع</th>
              <th className="px-4 py-4 font-black">الحالة</th>
              <th className="px-4 py-4 font-black">وقت الإرسال</th>
              <th className="px-4 py-4 font-black">وقت الفتح</th>
              <th className="px-4 py-4 font-black">مرات الفتح</th>
              <th className="px-4 py-4 font-black">النقرات</th>
              <th className="px-4 py-4 font-black">الجهاز</th>
              <th className="px-4 py-4 font-black">الدولة</th>
              <th className="px-4 py-4 font-black">عنوان IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id || row.resendId}
                className="group border-t border-slate-100 transition duration-200 hover:bg-cyan-50/60 dark:border-cyan-300/10 dark:hover:bg-white/[0.04]"
              >
                <td className="px-4 py-4">
                  <Link
                    href={`/admin/email-analytics/${row.id}`}
                    className="block font-bold text-slate-950 transition group-hover:text-cyan-700 dark:text-white dark:group-hover:text-cyan-300"
                  >
                    {row.email}
                  </Link>
                </td>
                <td className="px-4 py-4 font-bold text-slate-700 dark:text-slate-200">{row.messageType}</td>
                <td className="max-w-[220px] px-4 py-4">
                  <Link
                    href={`/admin/email-analytics/${row.id}`}
                    className="block truncate font-medium text-slate-600 transition hover:text-cyan-700 dark:text-slate-300 dark:hover:text-cyan-300"
                    title={row.subject}
                  >
                    {row.subject}
                  </Link>
                </td>
                <td className="px-4 py-4">
                  <StatusPill status={row.status} label={row.statusLabel} />
                </td>
                <td className="whitespace-nowrap px-4 py-4 font-medium text-slate-600 dark:text-slate-300">
                  {row.sentAtLabel}
                </td>
                <td className="whitespace-nowrap px-4 py-4 font-medium text-slate-600 dark:text-slate-300">
                  {row.openedAtLabel}
                </td>
                <td className="px-4 py-4">
                  <MetricBadge value={row.openCount} />
                </td>
                <td className="px-4 py-4">
                  <MetricBadge value={row.clickCount} />
                </td>
                <td className="px-4 py-4 font-medium text-slate-600 dark:text-slate-300">{row.device}</td>
                <td className="px-4 py-4 font-medium text-slate-600 dark:text-slate-300">{row.country}</td>
                <td className="px-4 py-4 font-mono text-xs text-slate-500 dark:text-slate-400">{row.ipAddress}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
