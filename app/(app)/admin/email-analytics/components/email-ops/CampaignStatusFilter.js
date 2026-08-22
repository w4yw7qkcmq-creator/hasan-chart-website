"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevronDown } from "../icons-ops";
import { CAMPAIGN_STATUS_FILTER_OPTIONS } from "./labels";

export function CampaignStatusFilter({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = CAMPAIGN_STATUS_FILTER_OPTIONS.find((o) => o.value === value) || CAMPAIGN_STATUS_FILTER_OPTIONS[0];

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-w-[160px] items-center justify-between gap-2 rounded-[18px] border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-white"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected.label}
        <IconChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute left-0 z-20 mt-2 max-h-72 min-w-full overflow-auto rounded-[18px] border border-slate-200 bg-white p-1.5 shadow-xl dark:border-cyan-300/15 dark:bg-[#07142f]"
        >
          {CAMPAIGN_STATUS_FILTER_OPTIONS.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={value === option.value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`block w-full rounded-xl px-3 py-2 text-right text-sm font-bold ${
                  value === option.value
                    ? "bg-cyan-50 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-200"
                    : "text-slate-700 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/10"
                }`}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
