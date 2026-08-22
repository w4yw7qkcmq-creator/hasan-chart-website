"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconChart, IconInbox, IconMail, IconSend } from "../icons-ops";

const TAB_ICONS = {
  overview: IconChart,
  monitoring: IconInbox,
  compose: IconSend,
  campaigns: IconMail,
};

const TABS = [
  { href: "/admin/email-analytics", label: "نظرة عامة", key: "overview", exact: true },
  { href: "/admin/email-analytics/monitoring", label: "مراقبة الإرسال", key: "monitoring" },
  { href: "/admin/email-analytics/compose", label: "إرسال جماعي", key: "compose" },
  { href: "/admin/email-analytics/campaigns", label: "الحملات", key: "campaigns" },
];

export function EmailOpsTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="تبويبات مركز عمليات البريد"
      className="overflow-x-auto rounded-[28px] border border-slate-200/80 bg-white/90 p-2 shadow-[0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur-sm dark:border-cyan-300/15 dark:bg-[#07142f]/70 dark:shadow-[0_12px_40px_rgba(0,0,0,0.25)]"
    >
      <div className="flex min-w-max gap-2">
        {TABS.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = TAB_ICONS[tab.key] || IconMail;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`group relative flex items-center gap-2.5 rounded-[22px] px-4 py-3 text-sm font-black transition-all duration-200 md:px-5 ${
                active
                  ? "bg-gradient-to-l from-blue-600 via-cyan-500 to-cyan-400 text-white shadow-lg shadow-cyan-500/25"
                  : "text-slate-600 hover:bg-slate-100/90 dark:text-slate-200 dark:hover:bg-white/10"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-cyan-600 dark:text-cyan-300"}`} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
