"use client";

import { useState } from "react";
import { IconAlert, IconChevronDown } from "../icons-ops";
import { formatRelativeTimeAr, parseErrorForDisplay } from "./utils";

const SEVERITY_STYLES = {
  high: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-200 dark:border-red-400/20",
  medium: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-400/20",
  low: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/10 dark:text-slate-300 dark:border-white/10",
};

export function EmailErrorItem({ error, failedAt, outboxId, attempts }) {
  const [open, setOpen] = useState(false);
  const parsed = parseErrorForDisplay(error);
  const severityStyle = SEVERITY_STYLES[parsed.severity] || SEVERITY_STYLES.medium;

  return (
    <article className="rounded-[22px] border border-slate-200/80 bg-white/90 p-4 dark:border-cyan-300/10 dark:bg-white/[0.04]">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-red-200 bg-red-50 text-red-600 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-200">
          <IconAlert className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-black text-slate-900 dark:text-white">{parsed.title}</h4>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${severityStyle}`}>
              {parsed.severity === "high" ? "عالي" : parsed.severity === "low" ? "منخفض" : "متوسط"}
            </span>
          </div>
          <p className="mt-1 text-sm leading-7 text-slate-600 dark:text-slate-300">{parsed.summary}</p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{formatRelativeTimeAr(failedAt)}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
          aria-expanded={open}
        >
          عرض التفاصيل
          <IconChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open ? (
        <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 p-3 text-xs dark:border-white/10 dark:bg-black/20">
          {outboxId ? <p className="mb-2"><span className="font-bold">معرّف الطابور:</span> {outboxId}</p> : null}
          {attempts != null ? <p className="mb-2"><span className="font-bold">المحاولات:</span> {attempts}</p> : null}
          <p className="font-bold text-slate-700 dark:text-slate-200">رسالة المزود:</p>
          <pre className="mt-1 overflow-auto whitespace-pre-wrap break-words text-slate-600 dark:text-slate-400">{error || "—"}</pre>
        </div>
      ) : null}
    </article>
  );
}
