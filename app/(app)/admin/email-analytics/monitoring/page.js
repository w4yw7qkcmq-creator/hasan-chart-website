"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminFetch } from "../lib/useAdminFetch";
import { useVisibilityRefresh } from "../../../../hooks/useVisibilityRefresh";
import { EmailEmptyState } from "../components/email-ops/EmailEmptyState";
import { EmailErrorItem } from "../components/email-ops/EmailErrorItem";
import { EmailKpiCard } from "../components/email-ops/EmailKpiCard";
import { EmailOpsKpiSkeleton } from "../components/email-ops/EmailOpsSkeleton";
import { EmailOpsPageHeader } from "../components/email-ops/EmailOpsPageHeader";
import { QueueHealthHero } from "../components/email-ops/QueueHealthHero";
import { deriveQueueHealth, formatRelativeTimeAr } from "../components/email-ops/utils";
import { getQueueStatusLabel } from "../components/email-ops/labels";
import { IconAlert, IconInbox } from "../components/icons-ops";

const KPI_CONFIG = [
  { key: "pending", tone: "amber", hint: "في انتظار المعالجة" },
  { key: "processing", tone: "blue", hint: "قيد الإرسال الآن" },
  { key: "accepted", tone: "cyan", hint: "قبلها مزود البريد" },
  { key: "sent", tone: "green", hint: "تم الإرسال بنجاح" },
  { key: "failed", tone: "red", hint: "تحتاج مراجعة" },
  { key: "skipped", tone: "gray", hint: "تم التجاوز" },
  { key: "uncertain", tone: "orange", hint: "حالة غير مؤكدة" },
];

export default function EmailMonitoringPage() {
  const adminFetch = useAdminFetch();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState("");

  const load = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        setError("");
        const res = await adminFetch("/api/admin/email-outbox?limit=5000");
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "تعذر تحميل الطابور");
        setMetrics(data.metrics);
        setLastRefresh(formatRelativeTimeAr(new Date().toISOString()).replace("منذ ", "منذ ") || "الآن");
      } catch (err) {
        setError(err.message || "تعذر تحميل الطابور");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [adminFetch]
  );

  useEffect(() => {
    load();
  }, [load]);

  useVisibilityRefresh(() => load({ silent: true }), 20000);

  const health = useMemo(() => deriveQueueHealth(metrics), [metrics]);
  const counts = metrics?.counts || {};

  return (
    <div className="space-y-6">
      <EmailOpsPageHeader
        eyebrow="مركز عمليات البريد"
        title="مراقبة الإرسال"
        description="تابع حالة طابور البريد وعمليات التسليم والأخطاء لحظة بلحظة."
        statusLabel={health.label === "سليم" ? "النظام يعمل بشكل طبيعي" : health.label}
        statusLevel={health.level}
        lastRefresh={lastRefresh ? `آخر تحديث ${lastRefresh}` : null}
        onRefresh={() => load({ silent: true })}
        refreshing={refreshing}
      />

      {error ? (
        <div className="rounded-[24px] border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <EmailOpsKpiSkeleton count={7} />
      ) : metrics ? (
        <>
          <QueueHealthHero metrics={metrics} />

          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {KPI_CONFIG.map(({ key, tone, hint }) => (
              <EmailKpiCard
                key={key}
                label={getQueueStatusLabel(key)}
                value={counts[key] ?? 0}
                tone={tone}
                hint={hint}
              />
            ))}
          </section>

          <section className="rounded-[28px] border border-slate-200/80 bg-white/95 p-5 dark:border-cyan-300/15 dark:bg-[#07142f]/60 md:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black">أحدث الأخطاء</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">آخر حالات الفشل في عينة الطابور</p>
              </div>
            </div>

            {metrics.recentFailures?.length ? (
              <div className="space-y-3">
                {metrics.recentFailures.slice(0, 10).map((row) => (
                  <EmailErrorItem
                    key={row.id}
                    error={row.error}
                    failedAt={row.failedAt}
                    outboxId={row.id}
                    attempts={row.attempts}
                  />
                ))}
              </div>
            ) : (
              <EmailEmptyState
                icon={IconInbox}
                title="لا توجد أخطاء حديثة"
                description="نظام البريد يعمل دون أخطاء في العينة الحالية."
              />
            )}
          </section>

          {counts.pending === 0 && !metrics.recentFailures?.length ? (
            <EmailEmptyState
              icon={IconAlert}
              title="لا توجد رسائل بانتظار الإرسال"
              description="كل شيء محدث حاليًا."
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
