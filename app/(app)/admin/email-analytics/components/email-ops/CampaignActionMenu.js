"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconMore } from "../icons-ops";

function getAvailableActions(status) {
  const s = String(status || "").trim();
  const actions = [{ key: "view", label: "عرض التفاصيل", href: true }];

  if (s === "sending") actions.push({ key: "pause", label: "إيقاف مؤقت", danger: false });
  if (s === "paused") actions.push({ key: "resume", label: "استكمال", danger: false });
  if (["draft", "ready", "sending", "paused"].includes(s)) {
    actions.push({ key: "cancel", label: "إلغاء الحملة", danger: true });
  }

  return actions;
}

export function CampaignActionMenu({ campaignId, status, onAction, confirmDanger = true }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const ref = useRef(null);
  const actions = getAvailableActions(status);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const handleClick = (action) => {
    if (action.href) return;
    if (action.danger && confirmDanger) {
      setConfirm(action);
      setOpen(false);
      return;
    }
    onAction?.(action.key);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="إجراءات الحملة"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
      >
        <IconMore className="h-5 w-5" />
      </button>

      {open ? (
        <div className="absolute left-0 z-20 mt-2 min-w-[180px] overflow-hidden rounded-[18px] border border-slate-200 bg-white p-1.5 shadow-xl dark:border-cyan-300/15 dark:bg-[#07142f]">
          {actions.map((action) =>
            action.href ? (
              <Link
                key={action.key}
                href={`/admin/email-analytics/campaigns/${campaignId}`}
                className="block rounded-xl px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/10"
                onClick={() => setOpen(false)}
              >
                {action.label}
              </Link>
            ) : (
              <button
                key={action.key}
                type="button"
                onClick={() => handleClick(action)}
                className={`block w-full rounded-xl px-3 py-2 text-right text-sm font-bold ${
                  action.danger
                    ? "text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
                    : "text-slate-700 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/10"
                }`}
              >
                {action.label}
              </button>
            )
          )}
        </div>
      ) : null}

      {confirm ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 dark:border-cyan-300/15 dark:bg-[#07142f]">
            <h3 className="text-lg font-black">تأكيد {confirm.label}</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">هل أنت متأكد من تنفيذ هذا الإجراء؟</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-xl border px-4 py-2 font-bold" onClick={() => setConfirm(null)}>
                إلغاء
              </button>
              <button
                type="button"
                className="rounded-xl bg-red-600 px-4 py-2 font-black text-white"
                onClick={() => {
                  onAction?.(confirm.key);
                  setConfirm(null);
                }}
              >
                تأكيد
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
