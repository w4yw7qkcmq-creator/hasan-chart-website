"use client";
import { UiPageShell } from "../../components/ui";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../components/AuthProvider";
import { useVisibilityRefresh } from "../../hooks/useVisibilityRefresh";
const PublicServiceLanding = dynamic(
  () =>
    import("../../components/public-seo/PublicServiceLanding").then(
      (mod) => mod.default,
    ),
  { ssr: false },
);
const SIGNAL_ACTIVE_MS = 10 * 60 * 1000;
function getSignalStatus(signal) {
  const createdAt = signal.created_at || signal.createdAt;
  if (!createdAt) {
    return signal.status === "منتهية" ? "منتهية" : "نشطة";
  }
  const createdTime = new Date(createdAt).getTime();
  if (!Number.isFinite(createdTime)) {
    return signal.status === "منتهية" ? "منتهية" : "نشطة";
  }
  return Date.now() - createdTime >= SIGNAL_ACTIVE_MS ? "منتهية" : "نشطة";
}
const FILTERS = [
  { key: "all", label: "كل التوصيات" },
  { key: "active", label: "النشطة" },
  { key: "expired", label: "المنتهية" },
];
function SignalCard({ signal }) {
  return (
    <article
      className="overflow-hidden rounded-[30px] border admin-panel-border ui-glass-solid admin-text shadow-[0_22px_80px_rgba(14,165,233,0.18)]"
      onCopy={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {" "}
      <div className="border-b border-[var(--ui-border)]100 admin-panel p-6">
        {" "}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          {" "}
          <div>
            {" "}
            <span className="admin-status-chip-warning inline-flex text-xs">
              {" "}
              VIP FUTURES 🔥{" "}
            </span>{" "}
            <h3 className="mt-4 text-3xl font-black admin-text">
              {signal.coin}
            </h3>{" "}
            <p className="mt-2 text-sm font-bold admin-text-subtle">
              {signal.createdAt}
            </p>{" "}
          </div>{" "}
          {getSignalStatus(signal) === "منتهية" ? (
            <span className="admin-status-chip-danger text-sm">
              {" "}
              منتهية{" "}
            </span>
          ) : (
            <span className="admin-status-chip-success text-sm">
              {" "}
              نشطة{" "}
            </span>
          )}{" "}
        </div>{" "}
      </div>{" "}
      <div className="grid gap-4 p-6 md:grid-cols-3">
        {" "}
        <div className="rounded-2xl border admin-panel-border admin-panel p-5 shadow-sm">
          {" "}
          <p className="text-xs font-black admin-text-muted">
            منطقة الدخول
          </p>{" "}
          <p className="mt-3 font-black admin-text">
            {signal.entry || "غير محدد"}
          </p>{" "}
        </div>{" "}
        <div className="ui-panel-positive shadow-sm">
          {" "}
          <p className="text-xs font-black ui-text-positive">الأهداف</p>{" "}
          <p className="mt-3 whitespace-pre-line font-black admin-text">
            {signal.targets || "غير محدد"}
          </p>{" "}
        </div>{" "}
        <div className="ui-signal-risk-panel shadow-sm">
          {" "}
          <p className="ui-signal-risk-label">وقف الخسارة</p>{" "}
          <p className="mt-3 font-black admin-text">
            {signal.stop_loss || "غير محدد"}
          </p>{" "}
        </div>{" "}
      </div>{" "}
      {signal.notes && (
        <div className="mx-6 mb-6 ui-note-panel">
          {" "}
          <p className="text-sm font-black admin-text">ملاحظات التوصية</p>{" "}
          <p className="mt-2 whitespace-pre-line leading-8 admin-text-muted">
            {signal.notes}
          </p>{" "}
        </div>
      )}{" "}
    </article>
  );
}
export default function VipFuturesPage() {
  const { authResolved, user } = useAuth();
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);
  const [statusTick, setStatusTick] = useState(0);
  const loadInFlightRef = useRef(false);
  const loadSignals = async ({ silent = false } = {}) => {
    if (loadInFlightRef.current) {
      return;
    }
    loadInFlightRef.current = true;
    if (!silent) {
      setLoading(true);
    }
    try {
      const response = await fetch("/api/vip-signals?type=futures&limit=50", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });
      const result = await response.json().catch(() => null);
      if (response.status === 403 && result?.subscriptionExpired) {
        setSubscriptionExpired(true);
        setSignals([]);
        return;
      }
      if (!response.ok || !result?.success) {
        console.error(
          "VIP Futures signals error:",
          result?.error || "Unknown error",
        );
        setSignals([]);
        return;
      }
      setSubscriptionExpired(false);
      setSignals(result.signals || []);
    } catch (error) {
      console.error("VIP Futures signals error:", error);
      setSignals([]);
    } finally {
      loadInFlightRef.current = false;
      if (!silent) {
        setLoading(false);
      }
    }
  };
  useEffect(() => {
    if (!authResolved || !user?.email) return undefined;
    loadSignals();
    const statusTimer = setInterval(() => {
      setStatusTick((value) => value + 1);
    }, 30000);
    return () => {
      clearInterval(statusTimer);
    };
  }, [authResolved, user?.email]);
  useVisibilityRefresh(() => loadSignals({ silent: true }), {
    enabled: authResolved && Boolean(user?.email),
    intervalMs: 15000,
    refreshOnVisible: true,
    refreshOnFocus: false,
  });
  if (!authResolved) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center ui-page-dark admin-text">
        {" "}
        <p className="font-black admin-text-muted">
          جاري التحقق من الجلسة...
        </p>{" "}
      </main>
    );
  }
  if (!user?.email) {
    return <PublicServiceLanding pageKey="vip-futures" />;
  }
  if (subscriptionExpired) {
    return (
      <main className="min-h-screen ui-page-dark px-4 py-20 admin-text">
        {" "}
        <div className="mx-auto max-w-2xl rounded-[36px] border admin-panel-border ui-glass-solid p-10 text-center admin-text shadow-2xl">
          {" "}
          <div className="text-6xl">⚠️</div>{" "}
          <h1 className="mt-6 text-4xl font-black">انتهت صلاحية اشتراكك</h1>{" "}
          <p className="mt-4 text-lg font-bold admin-text-muted">
            {" "}
            انتهت صلاحية الباقة الخاصة بك. قم بتجديد الاشتراك للعودة إلى توصيات
            VIP Futures.{" "}
          </p>{" "}
          <Link
            href="/subscriptions"
            className="mt-8 inline-flex rounded-2xl admin-panel px-8 py-4 font-black admin-text"
          >
            {" "}
            تجديد الاشتراك{" "}
          </Link>{" "}
        </div>{" "}
      </main>
    );
  }
  void statusTick;
  const activeSignals = signals.filter(
    (signal) => getSignalStatus(signal) !== "منتهية",
  );
  const expiredSignals = signals.filter(
    (signal) => getSignalStatus(signal) === "منتهية",
  );
  const filteredSignals =
    selectedFilter === "active"
      ? activeSignals
      : selectedFilter === "expired"
        ? expiredSignals
        : signals;
  return (
    <main
      className="relative min-h-screen overflow-hidden ui-page-dark admin-text select-none"
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      {" "}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.22),transparent_45%),radial-gradient(circle_at_bottom,rgba(59,130,246,0.18),transparent_35%)]" />{" "}
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-20 md:px-6">
        {" "}
        <div className="rounded-[36px] border admin-panel-border ui-glass-solid/90 p-8 admin-text shadow-[0_30px_120px_rgba(14,165,233,0.18)] backdrop-blur-3xl md:p-12">
          {" "}
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            {" "}
            <div>
              {" "}
              <div className="mb-5 inline-flex items-center gap-2 admin-status-chip-warning text-sm">
                {" "}
                🔥 قسم توصيات VIP Futures{" "}
              </div>{" "}
              <h1 className="text-4xl font-black md:text-6xl">
                توصيات Futures الاحترافية
              </h1>{" "}
              <p className="mt-6 max-w-3xl text-lg font-bold leading-8 admin-text-muted">
                {" "}
                هنا تظهر توصيات الفيوتشر الخاصة بالمشتركين فقط، ويتم تحديثها
                مباشرة عند نشر توصية جديدة من لوحة الإدارة.{" "}
              </p>{" "}
            </div>{" "}
            <div className="grid h-32 w-32 place-items-center rounded-[32px] border admin-panel-border admin-panel text-6xl shadow-[0_0_50px_rgba(34,211,238,0.18)]">
              {" "}
              🔥{" "}
            </div>{" "}
          </div>{" "}
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {" "}
            <div className="rounded-3xl border admin-panel-border admin-panel p-5 text-center">
              {" "}
              <p className="text-xs font-black admin-text-muted">
                كل التوصيات
              </p>{" "}
              <p className="mt-2 text-3xl font-black admin-text">
                {signals.length}
              </p>{" "}
            </div>{" "}
            <div className="ui-panel-positive rounded-3xl text-center">
              {" "}
              <p className="text-xs font-black ui-text-positive">
                التوصيات النشطة
              </p>{" "}
              <p className="mt-2 text-3xl font-black admin-text">
                {activeSignals.length}
              </p>{" "}
            </div>{" "}
            <div className="ui-signal-risk-panel rounded-3xl text-center">
              {" "}
              <p className="ui-signal-risk-label">
                التوصيات المنتهية
              </p>{" "}
              <p className="mt-2 text-3xl font-black admin-text">
                {expiredSignals.length}
              </p>{" "}
            </div>{" "}
          </div>{" "}
          <div className="mt-6 flex flex-wrap gap-3">
            {" "}
            {FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setSelectedFilter(filter.key)}
                className={`rounded-2xl px-5 py-3 text-sm font-black transition ${selectedFilter === filter.key ? "admin-panel admin-text shadow-[0_12px_32px_rgba(37,99,235,0.25)]" : "border border-[var(--ui-border)]200 ui-glass-solid admin-text-muted hover:bg-slate-50"}`}
              >
                {" "}
                {filter.label}{" "}
              </button>
            ))}{" "}
          </div>{" "}
          <div className="mt-12">
            {" "}
            {loading ? (
              <div className="rounded-[28px] border admin-panel-border admin-panel p-8 text-center font-black admin-text-muted">
                {" "}
                جاري تحميل توصيات Futures...{" "}
              </div>
            ) : filteredSignals.length === 0 ? (
              <div className="rounded-[28px] border border-dashed admin-panel-border ui-glass-solid p-10 text-center admin-text">
                {" "}
                <div className="mb-4 text-5xl">📭</div>{" "}
                <h2 className="text-2xl font-black">
                  {" "}
                  {selectedFilter === "active"
                    ? "لا توجد توصيات نشطة حالياً"
                    : selectedFilter === "expired"
                      ? "لا توجد توصيات منتهية حالياً"
                      : "لا توجد توصيات Futures حالياً"}{" "}
                </h2>{" "}
                <p className="mt-3 font-bold admin-text-subtle">
                  عند نشر توصية من لوحة الإدارة ستظهر هنا مباشرة.
                </p>{" "}
              </div>
            ) : (
              <div className="grid gap-6">
                {" "}
                {filteredSignals.map((signal) => (
                  <SignalCard key={signal.id} signal={signal} />
                ))}{" "}
              </div>
            )}{" "}
          </div>{" "}
        </div>{" "}
      </div>{" "}
    </main>
  );
}
