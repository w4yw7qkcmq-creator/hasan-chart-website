"use client";

import { IconSearch } from "./icons";

const STATUS_OPTIONS = [
  ["all", "كل الحالات"],
  ["sent", "تم الإرسال"],
  ["delivered", "تم التسليم"],
  ["failed", "فشل"],
  ["bounced", "مرتد"],
  ["complained", "شكوى"],
  ["delayed", "تأخير"],
];

export function FilterBar({
  filters,
  messageTypes = [],
  onChange,
  onApply,
  onReset,
  loading = false,
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] dark:border-cyan-300/15 dark:bg-white/[0.045] dark:shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">
            Filters
          </p>
          <h2 className="mt-2 text-xl font-black text-slate-950 dark:text-white">بحث وفلترة</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onApply}
            disabled={loading}
            className="rounded-2xl border border-cyan-200 bg-cyan-50 px-5 py-2.5 text-sm font-black text-cyan-900 transition hover:bg-cyan-100 disabled:opacity-60 dark:border-cyan-300/20 dark:bg-cyan-400/10 dark:text-cyan-100 dark:hover:bg-cyan-400/20"
          >
            تطبيق الفلاتر
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={loading}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-cyan-300/10 dark:bg-black/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
          >
            إعادة ضبط
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">البريد الإلكتروني</span>
          <div className="relative">
            <IconSearch className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={filters.email}
              onChange={(event) => onChange("email", event.target.value)}
              placeholder="example@email.com"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pr-10 pl-4 text-sm font-medium text-slate-900 outline-none transition focus:border-cyan-300 focus:bg-white dark:border-cyan-300/15 dark:bg-black/20 dark:text-white dark:focus:border-cyan-400/40"
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">الحالة</span>
          <select
            value={filters.status}
            onChange={(event) => onChange("status", event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-cyan-300 focus:bg-white dark:border-cyan-300/15 dark:bg-black/20 dark:text-white dark:focus:border-cyan-400/40"
          >
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">نوع الرسالة</span>
          <select
            value={filters.messageType}
            onChange={(event) => onChange("messageType", event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-cyan-300 focus:bg-white dark:border-cyan-300/15 dark:bg-black/20 dark:text-white dark:focus:border-cyan-400/40"
          >
            <option value="all">كل الأنواع</option>
            {messageTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">من تاريخ</span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(event) => onChange("dateFrom", event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-cyan-300 focus:bg-white dark:border-cyan-300/15 dark:bg-black/20 dark:text-white dark:focus:border-cyan-400/40"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300">إلى تاريخ</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(event) => onChange("dateTo", event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-cyan-300 focus:bg-white dark:border-cyan-300/15 dark:bg-black/20 dark:text-white dark:focus:border-cyan-400/40"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
