"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/email-analytics", label: "نظرة عامة", exact: true },
  { href: "/admin/email-analytics/monitoring", label: "مراقبة الإرسال" },
  { href: "/admin/email-analytics/compose", label: "إرسال جماعي" },
  { href: "/admin/email-analytics/campaigns", label: "الحملات" },
];

export function OperationsTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2 rounded-[24px] border border-slate-200 bg-white/80 p-2 dark:border-cyan-300/15 dark:bg-white/[0.04]">
      {TABS.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-2xl px-4 py-2 text-sm font-black transition ${
              active
                ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/20"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
