"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminFetch } from "../lib/useAdminFetch";
import { CampaignActionMenu } from "../components/email-ops/CampaignActionMenu";
import { CampaignProgress } from "../components/email-ops/CampaignProgress";
import { CampaignStatusFilter } from "../components/email-ops/CampaignStatusFilter";
import { EmailEmptyState } from "../components/email-ops/EmailEmptyState";
import { EmailKpiCard } from "../components/email-ops/EmailKpiCard";
import { EmailOpsPageHeader } from "../components/email-ops/EmailOpsPageHeader";
import { EmailOpsTableSkeleton } from "../components/email-ops/EmailOpsSkeleton";
import { EmailStatusBadge } from "../components/email-ops/EmailStatusBadge";
import { EmailPrimaryButton, EmailTextInput } from "../components/email-ops/EmailFormField";
import { formatRelativeTimeAr } from "../components/email-ops/utils";
import { IconMail, IconPlus } from "../components/icons-ops";

export default function CampaignsListPage() {
  const adminFetch = useAdminFetch();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const q = status === "all" ? "" : `&status=${encodeURIComponent(status)}`;
    const res = await adminFetch(`/api/admin/email-campaigns?page=1&pageSize=50${q}`);
    const data = await res.json();
    if (data.success) {
      setRows(data.rows || []);
      setTotal(data.total || 0);
    }
    setLoading(false);
  }, [adminFetch, status]);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (id, action) => {
    await adminFetch(`/api/admin/email-campaigns/${id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    load();
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => String(r.name || "").toLowerCase().includes(q));
  }, [rows, search]);

  const headerStats = useMemo(() => {
    const counts = { sending: 0, completed: 0, draft: 0, failed: 0 };
    for (const row of rows) {
      if (counts[row.status] != null) counts[row.status] += 1;
    }
    return counts;
  }, [rows]);

  return (
    <div className="space-y-6">
      <EmailOpsPageHeader
        eyebrow="مركز عمليات البريد"
        title="الحملات البريدية"
        description="إدارة الحملات التسويقية، متابعة التقدم، ومراجعة نتائج التسليم."
        actions={
          <Link
            href="/admin/email-analytics/compose"
            className="inline-flex items-center justify-center gap-2 rounded-[18px] bg-gradient-to-l from-blue-700 via-blue-600 to-cyan-400 px-5 py-3 text-sm font-black text-white shadow-lg shadow-cyan-500/20 transition hover:-translate-y-0.5"
          >
            <IconPlus className="h-4 w-4" />
            إنشاء حملة
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <EmailKpiCard compact label="إجمالي الحملات" value={total} tone="blue" />
        <EmailKpiCard compact label="قيد الإرسال" value={headerStats.sending} tone="cyan" />
        <EmailKpiCard compact label="مكتملة" value={headerStats.completed} tone="green" />
        <EmailKpiCard compact label="مسودات" value={headerStats.draft} tone="neutral" />
      </div>

      <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200/80 bg-white/95 p-4 dark:border-cyan-300/15 dark:bg-[#07142f]/60 md:flex-row md:items-center">
        <EmailTextInput
          className="md:max-w-sm"
          placeholder="بحث باسم الحملة..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <CampaignStatusFilter value={status} onChange={setStatus} />
      </div>

      {loading ? (
        <EmailOpsTableSkeleton rows={6} />
      ) : filteredRows.length === 0 ? (
        <EmailEmptyState
          icon={IconMail}
          title="لا توجد حملات"
          description="ابدأ بإنشاء حملة جديدة من زر «إنشاء حملة»."
          action={
            <Link href="/admin/email-analytics/compose">
              <EmailPrimaryButton>إنشاء حملة</EmailPrimaryButton>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredRows.map((row) => (
            <article
              key={row.id}
              className="rounded-[24px] border border-slate-200/80 bg-white/95 p-4 dark:border-cyan-300/15 dark:bg-[#07142f]/60 md:p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/email-analytics/campaigns/${row.id}`} className="text-lg font-black text-cyan-700 hover:underline dark:text-cyan-300">
                      {row.name}
                    </Link>
                    <EmailStatusBadge status={row.status} kind="campaign" />
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {row.created_at ? formatRelativeTimeAr(row.created_at) : "—"}
                  </p>
                </div>

                <div className="grid flex-1 grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  <div>
                    <p className="text-xs text-slate-500">الجمهور</p>
                    <p className="font-black">{row.eligible_count ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">التسليم</p>
                    <p className="font-black">{row.delivered_count ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">الأخطاء</p>
                    <p className="font-black text-red-600 dark:text-red-300">{row.failed_count ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">آخر تحديث</p>
                    <p className="font-bold">{row.updated_at ? formatRelativeTimeAr(row.updated_at) : "—"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 lg:w-48">
                  <div className="min-w-0 flex-1">
                    <CampaignProgress campaign={row} showBadge={false} />
                  </div>
                  <CampaignActionMenu
                    campaignId={row.id}
                    status={row.status}
                    onAction={(action) => runAction(row.id, action)}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
