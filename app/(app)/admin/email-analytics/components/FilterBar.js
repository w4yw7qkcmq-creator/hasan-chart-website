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
    <div className="rounded-[28px] border border-[var(--ui-border)]200 ui-glass-solid p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      {" "}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        {" "}
        <div>
          {" "}
          <p className="text-xs font-black uppercase tracking-[0.18em] admin-text-muted">
            {" "}
            Filters{" "}
          </p>{" "}
          <h2 className="mt-2 text-xl font-black admin-text">
            بحث وفلترة
          </h2>{" "}
        </div>{" "}
        <div className="flex flex-wrap gap-2">
          {" "}
          <button
            type="button"
            onClick={onApply}
            disabled={loading}
            className="rounded-2xl border admin-panel-border admin-panel px-5 py-2.5 text-sm font-black admin-text-muted transition hover:admin-panel disabled:opacity-60"
          >
            {" "}
            تطبيق الفلاتر{" "}
          </button>{" "}
          <button
            type="button"
            onClick={onReset}
            disabled={loading}
            className="rounded-2xl border border-[var(--ui-border)]200 ui-glass-solid px-5 py-2.5 text-sm font-black admin-text-muted transition hover:bg-slate-50 disabled:opacity-60"
          >
            {" "}
            إعادة ضبط{" "}
          </button>{" "}
        </div>{" "}
      </div>{" "}
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {" "}
        <label className="block">
          {" "}
          <span className="mb-2 block text-sm font-bold admin-text-muted">
            البريد الإلكتروني
          </span>{" "}
          <div className="relative">
            {" "}
            <IconSearch className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 admin-text-subtle" />{" "}
            <input
              type="search"
              value={filters.email}
              onChange={(event) => onChange("email", event.target.value)}
              placeholder="example@email.com"
              className="w-full rounded-2xl border border-[var(--ui-border)]200 bg-slate-50 py-3 pr-10 pl-4 text-sm font-medium ui-text-strong outline-none transition focus:admin-panel-border focus:ui-glass-solid"
            />{" "}
          </div>{" "}
        </label>{" "}
        <label className="block">
          {" "}
          <span className="mb-2 block text-sm font-bold admin-text-muted">
            الحالة
          </span>{" "}
          <UiSelect
            value={filters.status}
            onChange={(event) => onChange("status", event.target.value)}
            className="w-full rounded-2xl border border-[var(--ui-border)]200 bg-slate-50 px-4 py-3 text-sm font-medium ui-text-strong outline-none transition focus:admin-panel-border focus:ui-glass-solid"
          >
            {" "}
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {" "}
                {label}{" "}
              </option>
            ))}{" "}
          </UiSelect>{" "}
        </label>{" "}
        <label className="block">
          {" "}
          <span className="mb-2 block text-sm font-bold admin-text-muted">
            نوع الرسالة
          </span>{" "}
          <UiSelect
            value={filters.messageType}
            onChange={(event) => onChange("messageType", event.target.value)}
            className="w-full rounded-2xl border border-[var(--ui-border)]200 bg-slate-50 px-4 py-3 text-sm font-medium ui-text-strong outline-none transition focus:admin-panel-border focus:ui-glass-solid"
          >
            {" "}
            <option value="all">كل الأنواع</option>{" "}
            {messageTypes.map((type) => (
              <option key={type} value={type}>
                {" "}
                {type}{" "}
              </option>
            ))}{" "}
          </UiSelect>{" "}
        </label>{" "}
        <div className="grid grid-cols-2 gap-3">
          {" "}
          <label className="block">
            {" "}
            <span className="mb-2 block text-sm font-bold admin-text-muted">
              من تاريخ
            </span>{" "}
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(event) => onChange("dateFrom", event.target.value)}
              className="w-full rounded-2xl border border-[var(--ui-border)]200 bg-slate-50 px-4 py-3 text-sm font-medium ui-text-strong outline-none transition focus:admin-panel-border focus:ui-glass-solid"
            />{" "}
          </label>{" "}
          <label className="block">
            {" "}
            <span className="mb-2 block text-sm font-bold admin-text-muted">
              إلى تاريخ
            </span>{" "}
            <input
              type="date"
              value={filters.dateTo}
              onChange={(event) => onChange("dateTo", event.target.value)}
              className="w-full rounded-2xl border border-[var(--ui-border)]200 bg-slate-50 px-4 py-3 text-sm font-medium ui-text-strong outline-none transition focus:admin-panel-border focus:ui-glass-solid"
            />{" "}
          </label>{" "}
        </div>{" "}
      </div>{" "}
    </div>
  );
}
