"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAdminFetch } from "../../lib/useAdminFetch";

export default function CampaignDetailPage({ params }) {
  const adminFetch = useAdminFetch();
  const [detail, setDetail] = useState(null);
  const campaignId = params.id;

  const load = useCallback(async () => {
    const res = await adminFetch(`/api/admin/email-campaigns/${campaignId}`);
    const data = await res.json();
    if (data.success) setDetail(data);
  }, [adminFetch, campaignId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  if (!detail) return <p className="p-6">جاري التحميل...</p>;

  const { campaign, deliveryBreakdown } = detail;
  const audienceStats = campaign.metadata?.audienceStats || {};
  const exclusionReasonLabels = audienceStats.exclusionReasonLabels || {};

  return (
    <main className="rounded-[34px] border border-slate-200 bg-white p-6 shadow-lg dark:border-cyan-300/15 dark:bg-[#07142f]/80">
      <Link href="/admin/email-analytics/campaigns" className="text-sm text-cyan-600">← الحملات</Link>
      <h1 className="mt-3 text-2xl font-black">{campaign.name}</h1>
      <p className="text-slate-500">
        {campaign.status} · {campaign.category || "marketing"} · {campaign.subject}
        {campaign.enqueue_completed_at ? " · enqueue complete" : ""}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ["eligible", campaign.eligible_count],
          ["queued", campaign.queued_count],
          ["delivered", campaign.delivered_count],
          ["failed", campaign.failed_count],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border p-4">
            <div className="text-xs uppercase">{k}</div>
            <div className="text-2xl font-black">{v ?? 0}</div>
          </div>
        ))}
      </div>

      {Object.keys(exclusionReasonLabels).length ? (
        <section className="mt-8">
          <h2 className="font-black">أسباب الاستبعاد (Audience Snapshot)</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {Object.entries(exclusionReasonLabels).map(([reason, info]) => (
              <li key={reason} className="flex justify-between rounded-xl border px-3 py-2">
                <span>{info.label || reason}</span>
                <strong>{info.count}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="font-black">Delivery breakdown</h2>
        <pre className="mt-2 overflow-auto rounded-2xl bg-slate-50 p-4 text-xs dark:bg-black/30">{JSON.stringify(deliveryBreakdown, null, 2)}</pre>
      </section>
    </main>
  );
}
