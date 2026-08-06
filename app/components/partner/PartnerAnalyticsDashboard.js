"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatPartnerMoney,
  serviceTypeLabel,
  PARTNER_LEADERBOARD_METRICS,
  PARTNER_LEADERBOARD_UI_ENABLED,
} from "../../../lib/partner-shared";
import {
  PartnerBarChart,
  PartnerLineChart,
  PartnerMonthlyComparisonChart,
  PartnerServiceBreakdownChart,
} from "./PartnerAnalyticsCharts";
import { PartnerMetricSkeletonGrid } from "./PartnerLoadingSkeleton";
function AnalyticsMetricCard({ title, value, tone = "blue" }) {
  return (
    <div className={`user-dashboard-metric user-dashboard-metric--${tone}`}>
      {" "}
      <div>
        {" "}
        <p className="user-dashboard-metric__title">{title}</p>{" "}
        <p className="user-dashboard-metric__value">{value}</p>{" "}
      </div>{" "}
    </div>
  );
}
function formatDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
export function PartnerAnalyticsDashboard() {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [charts, setCharts] = useState(null);
  const [topReferrals, setTopReferrals] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardMetric, setLeaderboardMetric] = useState("sales");
  const [error, setError] = useState("");
  const loadInFlightRef = useRef(false);
  const loadLeaderboard = useCallback(async (metric) => {
    if (!PARTNER_LEADERBOARD_UI_ENABLED) return;
    const response = await fetch(
      `/api/partner/leaderboard?metric=${encodeURIComponent(metric)}`,
      { credentials: "include", cache: "no-store" },
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.success) {
      throw new Error(result?.error || "تعذر تحميل الترتيب");
    }
    setLeaderboard(result.leaderboard || []);
  }, []);
  const loadAll = useCallback(async () => {
    if (loadInFlightRef.current) {
      return;
    }
    loadInFlightRef.current = true;
    setLoading(true);
    setError("");
    try {
      const [analyticsRes, chartsRes, referralsRes] = await Promise.all([
        fetch("/api/partner/analytics", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/partner/charts", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/partner/top-referrals", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      const [analyticsData, chartsData, referralsData] = await Promise.all([
        analyticsRes.json().catch(() => ({})),
        chartsRes.json().catch(() => ({})),
        referralsRes.json().catch(() => ({})),
      ]);
      if (!analyticsRes.ok || !analyticsData?.success) {
        throw new Error(analyticsData?.error || "تعذر تحميل الإحصائيات");
      }
      setAnalytics(analyticsData.analytics);
      setCharts(chartsData?.success ? chartsData.charts : null);
      setTopReferrals(
        referralsData?.success ? referralsData.referrals || [] : [],
      );
      if (PARTNER_LEADERBOARD_UI_ENABLED) {
        await loadLeaderboard(leaderboardMetric);
      }
    } catch (loadError) {
      setError(loadError?.message || "تعذر تحميل Analytics");
    } finally {
      loadInFlightRef.current = false;
      setLoading(false);
    }
  }, [leaderboardMetric, loadLeaderboard]);
  useEffect(() => {
    void loadAll();
  }, [loadAll]);
  useEffect(() => {
    if (!PARTNER_LEADERBOARD_UI_ENABLED || loading) return;
    void loadLeaderboard(leaderboardMetric).catch(() => {});
  }, [leaderboardMetric, loading, loadLeaderboard]);
  const commissionSeries = useMemo(
    () =>
      (charts?.commissionsLast30Days || []).map((row) => ({
        date: row.date,
        amount: Number(row.amount || 0),
      })),
    [charts],
  );
  if (loading) {
    return (
      <section className="user-dashboard-panel">
        {" "}
        <div className="user-dashboard-panel__body space-y-6">
          {" "}
          <PartnerMetricSkeletonGrid count={8} />{" "}
          <PartnerMetricSkeletonGrid count={4} />{" "}
        </div>{" "}
      </section>
    );
  }
  if (error) {
    return (
      <section className="user-dashboard-panel">
        {" "}
        <div className="user-dashboard-panel__body">
          {" "}
          <p className="partner-error-text">{error}</p>{" "}
        </div>{" "}
      </section>
    );
  }
  return (
    <div className="space-y-6">
      {" "}
      <section className="user-dashboard-panel">
        {" "}
        <div className="user-dashboard-panel__header">
          {" "}
          <div>
            {" "}
            <h2 className="user-dashboard-panel__title">
              Partner Analytics
            </h2>{" "}
            <p className="user-dashboard-panel__subtitle">
              لوحة إحصائيات احترافية لأداء الإحالات والعمولات
            </p>{" "}
          </div>{" "}
        </div>{" "}
        <div className="user-dashboard-panel__body space-y-6">
          {" "}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {" "}
            <AnalyticsMetricCard
              title="إجمالي الإحالات"
              value={analytics?.totalReferrals ?? 0}
              tone="blue"
            />{" "}
            <AnalyticsMetricCard
              title="الإحالات النشطة"
              value={analytics?.activeReferrals ?? 0}
              tone="green"
            />{" "}
            <AnalyticsMetricCard
              title="الإحالات غير النشطة"
              value={analytics?.inactiveReferrals ?? 0}
              tone="cyan"
            />{" "}
            <AnalyticsMetricCard
              title="إجمالي الاشتراكات"
              value={analytics?.totalSubscriptions ?? 0}
              tone="gold"
            />{" "}
            <AnalyticsMetricCard
              title="إدارة الحسابات"
              value={analytics?.accountManagementCount ?? 0}
              tone="blue"
            />{" "}
            <AnalyticsMetricCard
              title="VIP Spot"
              value={analytics?.vipSpotCount ?? 0}
              tone="cyan"
            />{" "}
            <AnalyticsMetricCard
              title="VIP Futures"
              value={analytics?.vipFuturesCount ?? 0}
              tone="green"
            />{" "}
            <AnalyticsMetricCard
              title="Academy"
              value={analytics?.academyCount ?? 0}
              tone="gold"
            />{" "}
            <AnalyticsMetricCard
              title="إجمالي المبيعات"
              value={formatPartnerMoney(analytics?.totalSales ?? 0)}
              tone="green"
            />{" "}
            <AnalyticsMetricCard
              title="إجمالي العمولات"
              value={formatPartnerMoney(analytics?.totalCommissions ?? 0)}
              tone="blue"
            />{" "}
            <AnalyticsMetricCard
              title="الرصيد المعلق"
              value={formatPartnerMoney(analytics?.balancePending ?? 0)}
              tone="cyan"
            />{" "}
            <AnalyticsMetricCard
              title="الرصيد القابل للسحب"
              value={formatPartnerMoney(analytics?.balanceWithdrawable ?? 0)}
              tone="green"
            />{" "}
            <AnalyticsMetricCard
              title="إجمالي المسحوب"
              value={formatPartnerMoney(analytics?.totalWithdrawn ?? 0)}
              tone="gold"
            />{" "}
            <AnalyticsMetricCard
              title="معدل التحويل"
              value={`${analytics?.conversionRate ?? 0}%`}
              tone="blue"
            />{" "}
            <AnalyticsMetricCard
              title="متوسط قيمة العميل"
              value={formatPartnerMoney(analytics?.averageCustomerValue ?? 0)}
              tone="cyan"
            />{" "}
            <AnalyticsMetricCard
              title="متوسط العمولة/عميل"
              value={formatPartnerMoney(
                analytics?.averageCommissionPerCustomer ?? 0,
              )}
              tone="green"
            />{" "}
          </div>{" "}
        </div>{" "}
      </section>{" "}
      <section className="user-dashboard-panel">
        {" "}
        <div className="user-dashboard-panel__header">
          {" "}
          <h2 className="user-dashboard-panel__title">الرسوم البيانية</h2>{" "}
        </div>{" "}
        <div className="user-dashboard-panel__body grid gap-6 xl:grid-cols-2">
          {" "}
          <div className="partner-chart-card">
            {" "}
            <p className="partner-chart-card__title">
              العمولات — آخر 30 يوماً
            </p>{" "}
            <PartnerLineChart
              items={commissionSeries}
              formatValue={(v) => formatPartnerMoney(v)}
            />{" "}
          </div>{" "}
          <div className="partner-chart-card">
            {" "}
            <p className="partner-chart-card__title">
              الأرباح حسب نوع الخدمة
            </p>{" "}
            <PartnerServiceBreakdownChart
              items={charts?.earningsByService || []}
            />{" "}
          </div>{" "}
          <div className="partner-chart-card xl:col-span-2">
            {" "}
            <p className="partner-chart-card__title">مقارنة آخر 12 شهر</p>{" "}
            <PartnerMonthlyComparisonChart
              items={charts?.monthlyComparison || []}
            />{" "}
          </div>{" "}
          <div className="partner-chart-card">
            {" "}
            <p className="partner-chart-card__title">
              العملاء الجدد شهرياً
            </p>{" "}
            <PartnerBarChart
              items={(charts?.monthlyNewCustomers || []).map((row) => ({
                label: row.month,
                amount: Number(row.count || 0),
              }))}
              formatValue={(v) => `${v} عميل`}
            />{" "}
          </div>{" "}
        </div>{" "}
      </section>{" "}
      <section className="user-dashboard-panel">
        {" "}
        <div className="user-dashboard-panel__header">
          {" "}
          <h2 className="user-dashboard-panel__title">Top Referrals</h2>{" "}
        </div>{" "}
        <div className="user-dashboard-panel__body partner-scroll-panel partner-scroll-panel--table">
          {" "}
          <table className="partner-table">
            {" "}
            <thead>
              {" "}
              <tr>
                {" "}
                <th>الاسم</th> <th>البريد</th> <th>الخدمة</th> <th>المبيعات</th>{" "}
                <th>العمولات</th> <th>التسجيل</th> <th>آخر نشاط</th>{" "}
              </tr>{" "}
            </thead>{" "}
            <tbody>
              {" "}
              {topReferrals.map((item) => (
                <tr key={item.userId || item.username}>
                  {" "}
                  <td>{item.username}</td> <td>{item.email}</td>{" "}
                  <td>{serviceTypeLabel(item.primaryService)}</td>{" "}
                  <td>{formatPartnerMoney(item.totalSales)}</td>{" "}
                  <td>{formatPartnerMoney(item.totalCommissions)}</td>{" "}
                  <td>{formatDate(item.registeredAt)}</td>{" "}
                  <td>{formatDate(item.lastActivityAt)}</td>{" "}
                </tr>
              ))}{" "}
            </tbody>{" "}
          </table>{" "}
          {!topReferrals.length ? (
            <p className="partner-muted mt-3">لا توجد إحالات بارزة بعد.</p>
          ) : null}{" "}
        </div>{" "}
      </section>{" "}
      {/* Partner Leaderboard — hidden until partner base grows. Re-enable: set PARTNER_LEADERBOARD_UI_ENABLED = true in lib/partner-shared.js */}{" "}
      {PARTNER_LEADERBOARD_UI_ENABLED ? (
        <section className="user-dashboard-panel">
          {" "}
          <div className="user-dashboard-panel__header">
            {" "}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {" "}
              <h2 className="user-dashboard-panel__title">
                Partner Leaderboard
              </h2>{" "}
              <UiSelect
                value={leaderboardMetric}
                onChange={(event) => setLeaderboardMetric(event.target.value)}
                className="partner-select w-auto text-sm"
              >
                {" "}
                {PARTNER_LEADERBOARD_METRICS.map((metric) => (
                  <option key={metric.key} value={metric.key}>
                    {" "}
                    {metric.label}{" "}
                  </option>
                ))}{" "}
              </UiSelect>{" "}
            </div>{" "}
          </div>{" "}
          <div className="user-dashboard-panel__body partner-scroll-panel partner-scroll-panel--table">
            {" "}
            <table className="partner-table">
              {" "}
              <thead>
                {" "}
                <tr>
                  {" "}
                  <th>#</th> <th>الشريك</th> <th>المستوى</th> <th>المبيعات</th>{" "}
                  <th>العمولات</th> <th>الإحالات</th> <th>نشط</th>{" "}
                  <th>التحويل</th>{" "}
                </tr>{" "}
              </thead>{" "}
              <tbody>
                {" "}
                {leaderboard.map((item) => (
                  <tr key={item.partnerId}>
                    {" "}
                    <td>{item.rank}</td> <td>{item.username}</td>{" "}
                    <td>{item.tierName}</td>{" "}
                    <td>{formatPartnerMoney(item.totalSales)}</td>{" "}
                    <td>{formatPartnerMoney(item.totalCommissions)}</td>{" "}
                    <td>{item.signupCount}</td>{" "}
                    <td>{item.activeAccountCount}</td>{" "}
                    <td>{item.conversionRate}%</td>{" "}
                  </tr>
                ))}{" "}
              </tbody>{" "}
            </table>{" "}
          </div>{" "}
        </section>
      ) : null}{" "}
    </div>
  );
}
