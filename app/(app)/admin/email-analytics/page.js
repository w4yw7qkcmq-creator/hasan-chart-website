"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityChart } from "./components/ActivityChart";
import { EmailTable } from "./components/EmailTable";
import { FilterBar } from "./components/FilterBar";
import { DashboardSkeleton } from "./components/Skeleton";
import { buildStatCards, StatCard } from "./components/StatCard";
import { IconRefresh } from "./components/icons";
import { WebhookStatusBanner } from "./components/WebhookStatusBanner";
import { buildAnalyticsQuery, useAdminFetch } from "./lib/useAdminFetch";
import { useVisibilityRefresh } from "../../../hooks/useVisibilityRefresh";

const EMPTY_SUMMARY = {
  totalSent: 0,
  delivered: 0,
  openRate: 0,
  clickRate: 0,
  failed: 0,
  bounced: 0,
  complaints: 0,
  deliverability: 0,
  opened: 0,
  clicked: 0,
};

const EMPTY_ACTIVITY = {
  last24Hours: 0,
  lastHour: 0,
  averageSendTime: "—",
  topMessageType: "—",
  topMessageTypeCount: 0,
};

const DEFAULT_FILTERS = {
  email: "",
  status: "all",
  messageType: "all",
  dateFrom: "",
  dateTo: "",
};

export default function EmailAnalyticsPage() {
  const adminFetch = useAdminFetch();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [todayActivity, setTodayActivity] = useState(EMPTY_ACTIVITY);
  const [chartSeries, setChartSeries] = useState({ "24h": [], "7d": [], "30d": [] });
  const [rows, setRows] = useState([]);
  const [messageTypes, setMessageTypes] = useState([]);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(DEFAULT_FILTERS);
  const [webhookHealth, setWebhookHealth] = useState({
    webhookUrl: "/api/webhooks/resend",
    webhookSecretConfigured: false,
    webhookConnected: false,
    webhookStatus: "setup_required",
    lastWebhookEventAt: null,
    lastWebhookEventType: null,
    lastWebhookEventLabel: null,
  });

  const mountedRef = useRef(true);
  const loadRequestRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadRequestRef.current += 1;
    };
  }, []);

  const loadAnalytics = useCallback(
    async ({ syncResend = false, silent = false, nextFilters = appliedFilters } = {}) => {
      const requestId = ++loadRequestRef.current;

      if (!silent) setLoading(true);
      else setRefreshing(true);

      try {
        const query = buildAnalyticsQuery(nextFilters, { syncResend });
        const response = await adminFetch(`/api/admin/email-analytics${query}`, {
          method: "GET",
          cache: "no-store",
        });

        const result = await response.json().catch(() => ({}));

        if (!mountedRef.current || requestId !== loadRequestRef.current) return;

        if (response.status === 401 || response.status === 403) {
          throw new Error(result?.error || "تعذر تحميل تحليلات البريد");
        }

        if (!response.ok || !result?.success) {
          throw new Error(result?.error || "تعذر تحميل تحليلات البريد");
        }

        setSummary(result.summary || EMPTY_SUMMARY);
        setTodayActivity(result.todayActivity || EMPTY_ACTIVITY);
        setChartSeries(result.chartSeries || { "24h": [], "7d": [], "30d": [] });
        setRows(result.rows || []);
        setMessageTypes(result.messageTypes || []);
        setWebhookHealth({
          webhookUrl: result.webhookUrl || "/api/webhooks/resend",
          webhookSecretConfigured: Boolean(result.webhookSecretConfigured),
          webhookConnected: Boolean(result.webhookConnected),
          webhookStatus: result.webhookStatus || "setup_required",
          lastWebhookEventAt: result.lastWebhookEventAt || null,
          lastWebhookEventType: result.lastWebhookEventType || null,
          lastWebhookEventLabel: result.lastWebhookEventLabel || null,
        });
        setError("");
        setLastUpdatedAt(new Date().toLocaleString("ar"));
      } catch (loadError) {
        if (!mountedRef.current || requestId !== loadRequestRef.current) return;
        setError(loadError?.message || "تعذر تحميل تحليلات البريد");
      } finally {
        if (mountedRef.current && requestId === loadRequestRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [adminFetch, appliedFilters]
  );

  useEffect(() => {
    loadAnalytics({ syncResend: true });
  }, []);

  useVisibilityRefresh(() => loadAnalytics({ silent: true }), {
    intervalMs: 30000,
    refreshOnVisible: false,
    refreshOnFocus: false,
  });

  const statCards = useMemo(() => buildStatCards(summary), [summary]);

  const handleFilterChange = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const handleApplyFilters = () => {
    setAppliedFilters(filters);
    loadAnalytics({ silent: true, nextFilters: filters });
  };

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    loadAnalytics({ silent: true, nextFilters: DEFAULT_FILTERS });
  };

  if (loading) {
    return (
      <main className="relative min-h-[calc(100vh-120px)] overflow-hidden rounded-[34px] border border-slate-200 bg-slate-50 p-4 text-slate-900 shadow-lg dark:border-cyan-300/10 dark:bg-[#020617] dark:text-white md:p-6">
        <DashboardSkeleton />
      </main>
    );
  }

  if (error) {
    return (
      <main className="relative min-h-[calc(100vh-120px)] overflow-hidden rounded-[34px] border border-slate-200 bg-slate-50 p-6 text-slate-900 shadow-lg dark:border-cyan-300/10 dark:bg-[#020617] dark:text-white">
        <div className="flex min-h-[50vh] items-center justify-center text-center">
          <div className="max-w-md rounded-[32px] border border-slate-200 bg-white p-8 dark:border-cyan-300/15 dark:bg-white/[0.045]">
            <p className="text-xl font-black">{error}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative z-0 overflow-hidden rounded-[34px] border border-slate-200 bg-slate-50 text-slate-900 shadow-lg dark:border-cyan-300/10 dark:bg-[#020617] dark:text-white dark:shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(0,102,255,0.08),transparent_30%),radial-gradient(circle_at_86%_35%,rgba(34,211,238,0.06),transparent_30%)] dark:bg-[radial-gradient(circle_at_12%_8%,rgba(0,102,255,0.35),transparent_30%),radial-gradient(circle_at_86%_35%,rgba(34,211,238,0.16),transparent_30%),linear-gradient(135deg,#020617,#07142f_48%,#030712)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] dark:opacity-[0.13] bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:76px_76px]" />

      <div className="relative z-10 space-y-8 p-4 md:p-6">
        <section className="relative overflow-hidden rounded-[34px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] dark:border-cyan-300/15 dark:bg-gradient-to-br dark:from-[#07142f]/85 dark:via-[#040b1c]/90 dark:to-[#020617]/95 md:p-9">
          <div className="absolute -left-24 top-10 h-64 w-64 rounded-full bg-blue-600/10 blur-3xl dark:bg-blue-600/20" />
          <div className="absolute bottom-0 right-20 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
            <div>
              <span className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-800 dark:border-cyan-300/20 dark:bg-cyan-400/10 dark:text-cyan-100">
                Email Operations Center
              </span>
              <h1 className="mt-5 text-3xl font-black leading-tight md:text-5xl">مركز عمليات البريد</h1>
              <p className="mt-4 max-w-3xl leading-8 text-slate-600 dark:text-slate-200">
                نظرة عامة على التسليم والتحليلات — استخدم التبويبات للمراقبة، الإرسال الجماعي، والحملات.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/admin"
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 font-black text-slate-900 transition duration-200 hover:-translate-y-0.5 hover:bg-slate-50 dark:border-cyan-300/20 dark:bg-cyan-400/10 dark:text-cyan-100 dark:hover:bg-cyan-400/20"
              >
                ← لوحة الإدارة
              </Link>
              <button
                type="button"
                onClick={() => loadAnalytics({ syncResend: true, silent: true })}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-5 py-3 font-black text-cyan-900 transition duration-200 hover:-translate-y-0.5 hover:bg-cyan-100 disabled:opacity-60 dark:border-cyan-300/20 dark:bg-cyan-400/10 dark:text-cyan-100 dark:hover:bg-cyan-400/20"
              >
                <IconRefresh className="h-4 w-4" spinning={refreshing} />
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="relative z-10 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-sm dark:border-cyan-300/15 dark:bg-white/[0.045]">
            <span className="font-bold text-slate-700 dark:text-cyan-100">
              {refreshing ? "جاري تحديث البيانات..." : "تحديث تلقائي كل 30 ثانية"}
            </span>
            <span className="text-slate-500 dark:text-slate-300">
              {lastUpdatedAt ? `آخر تحديث: ${lastUpdatedAt}` : "بانتظار أول تحديث"}
            </span>
          </div>
        </section>

        <WebhookStatusBanner webhook={webhookHealth} />

        {loading ? (
          <DashboardSkeleton />
        ) : (
          <>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {statCards.map((card, index) => (
                <StatCard key={card.title} {...card} delay={index * 40} />
              ))}
            </section>

            <ActivityChart chartSeries={chartSeries} todayActivity={todayActivity} />

            <FilterBar
              filters={filters}
              messageTypes={messageTypes}
              onChange={handleFilterChange}
              onApply={handleApplyFilters}
              onReset={handleResetFilters}
              loading={refreshing}
            />

            <EmailTable rows={rows} />
          </>
        )}
      </div>
    </main>
  );
}
