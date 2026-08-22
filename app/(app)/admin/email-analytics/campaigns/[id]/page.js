"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAdminFetch } from "../../lib/useAdminFetch";
import { CampaignProgress } from "../../components/email-ops/CampaignProgress";
import { EmailKpiCard } from "../../components/email-ops/EmailKpiCard";
import { EmailOpsDetailSkeleton } from "../../components/email-ops/EmailOpsSkeleton";
import { EmailStatusBadge } from "../../components/email-ops/EmailStatusBadge";
import { getDeliveryStatusLabel } from "../../components/email-ops/labels";
import { formatRelativeTimeAr } from "../../components/email-ops/utils";
import { EmailEmptyState } from "../../components/email-ops/EmailEmptyState";
import { IconAlert } from "../../components/icons-ops";

export default function CampaignDetailPage({ params }) {
  const adminFetch = useAdminFetch();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const campaignId = params.id;

  const load = useCallback(async () => {
    const res = await adminFetch(`/api/admin/email-campaigns/${campaignId}`);
    const data = await res.json();
    if (data.success) setDetail(data);
    setLoading(false);
  }, [adminFetch, campaignId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) return <EmailOpsDetailSkeleton />;

  if (!detail) {
    return (
      <EmailEmptyState
        icon={IconAlert}
        title="تعذر تحميل الحملة"
        description="تحقق من المعرف أو حاول مرة أخرى."
      />
    );
  }

  const { campaign, deliveryBreakdown } = detail;
  const audienceStats = campaign.metadata?.audienceStats || {};
  const exclusionReasonLabels = audienceStats.exclusionReasonLabels || {};

  const kpiItems = [
    { label: "الجمهور", value: campaign.eligible_count, tone: "blue" },
    { label: "في الطابور", value: campaign.queued_count, tone: "cyan" },
    { label: "تم التسليم", value: campaign.delivered_count, tone: "green" },
    { label: "فشل", value: campaign.failed_count, tone: "red" },
    { label: "ارتداد", value: campaign.bounced_count ?? 0, tone: "orange" },
    { label: "شكاوى", value: campaign.complained_count ?? 0, tone: "orange" },
    { label: "إلغاء اشتراك", value: campaign.unsubscribed_count ?? 0, tone: "gray" },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200/80 bg-white/95 p-5 dark:border-cyan-300/15 dark:bg-[#07142f]/75 md:p-7">
        <Link href="/admin/email-analytics/campaigns" className="text-sm font-bold text-cyan-600 hover:underline">
          ← الحملات
        </Link>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black md:text-3xl">{campaign.name}</h1>
              <EmailStatusBadge status={campaign.status} kind="campaign" />
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{campaign.subject}</p>
            <p className="mt-2 text-xs text-slate-500">
              {campaign.created_at ? `أُنشئت ${formatRelativeTimeAr(campaign.created_at)}` : null}
              {campaign.enqueue_completed_at ? " · اكتمل الإدراج في الطابور" : ""}
            </p>
          </div>
          <div className="w-full max-w-md">
            <CampaignProgress campaign={campaign} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {kpiItems.map((item) => (
          <EmailKpiCard key={item.label} compact label={item.label} value={item.value ?? 0} tone={item.tone} />
        ))}
      </div>

      {Object.keys(exclusionReasonLabels).length ? (
        <section className="rounded-[28px] border border-slate-200/80 bg-white/95 p-5 dark:border-cyan-300/15 dark:bg-[#07142f]/60 md:p-6">
          <h2 className="text-lg font-black">الاستبعادات</h2>
          <p className="mt-1 text-sm text-slate-500">أسباب استبعاد المستلمين من لقطة الجمهور</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {Object.entries(exclusionReasonLabels).map(([reason, info]) => (
              <div key={reason} className="flex items-center justify-between rounded-[20px] border border-slate-200 px-4 py-3 dark:border-white/10">
                <span className="text-sm font-bold">{info.label || reason}</span>
                <strong className="text-lg font-black">{info.count}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-[28px] border border-slate-200/80 bg-white/95 p-5 dark:border-cyan-300/15 dark:bg-[#07142f]/60 md:p-6">
        <h2 className="text-lg font-black">التسليم</h2>
        <p className="mt-1 text-sm text-slate-500">توزيع حالات التسليم للمستلمين</p>
        {Object.keys(deliveryBreakdown || {}).length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {Object.entries(deliveryBreakdown).map(([status, count]) => (
              <div key={status} className="rounded-[20px] border border-slate-200 p-4 dark:border-white/10">
                <EmailStatusBadge status={status} kind="delivery" />
                <p className="mt-2 text-2xl font-black">{count}</p>
                <p className="text-xs text-slate-500">{getDeliveryStatusLabel(status)}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmailEmptyState title="لا توجد بيانات تسليم بعد" description="ستظهر النتائج بعد بدء الإرسال." />
        )}
      </section>
    </div>
  );
}
