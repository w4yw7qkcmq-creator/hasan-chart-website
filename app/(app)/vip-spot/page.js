"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../components/AuthProvider";
import { useVisibilityRefresh } from "../../hooks/useVisibilityRefresh";

const PublicServiceLanding = dynamic(
  () =>
    import("../../components/public-seo/PublicServiceLanding").then(
      (mod) => mod.default
    ),
  { ssr: false }
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
      className="overflow-hidden rounded-[30px] border border-cyan-200/70 bg-white text-slate-950 shadow-[0_22px_80px_rgba(14,165,233,0.18)]"
      onCopy={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="border-b border-slate-100 bg-gradient-to-l from-cyan-50 via-sky-50 to-white p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-black text-amber-700">
              VIP SPOT ⭐
            </span>
            <h3 className="mt-4 text-3xl font-black text-slate-950">{signal.coin}</h3>
            <p className="mt-2 text-sm font-bold text-slate-500">{signal.createdAt}</p>
          </div>
          {getSignalStatus(signal) === "منتهية" ? (
            <span className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-black text-red-700">
              منتهية
            </span>
          ) : (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700">
              نشطة
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 p-6 md:grid-cols-3">
        <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-5 shadow-sm">
          <p className="text-xs font-black text-cyan-700">منطقة الدخول</p>
          <p className="mt-3 font-black text-slate-950">{signal.entry || "غير محدد"}</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
          <p className="text-xs font-black text-emerald-700">الأهداف</p>
          <p className="mt-3 whitespace-pre-line font-black text-slate-950">{signal.targets || "غير محدد"}</p>
        </div>
        <div className="rounded-2xl border border-red-100 bg-red-50 p-5 shadow-sm">
          <p className="text-xs font-black text-red-700">وقف الخسارة</p>
          <p className="mt-3 font-black text-slate-950">{signal.stop_loss || "غير محدد"}</p>
        </div>
      </div>

      {signal.notes && (
        <div className="mx-6 mb-6 rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <p className="text-sm font-black text-blue-700">ملاحظات التوصية</p>
          <p className="mt-2 whitespace-pre-line leading-8 text-slate-700">{signal.notes}</p>
        </div>
      )}
    </article>
  );
}

export default function VipSpotPage() {
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
      const response = await fetch("/api/vip-signals?type=spot&limit=50", {
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
        console.error("VIP Spot signals error:", result?.error || "Unknown error");
        setSignals([]);
        return;
      }

      setSubscriptionExpired(false);
      setSignals(result.signals || []);
    } catch (error) {
      console.error("VIP Spot signals error:", error);
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
      <main className="flex min-h-[50vh] items-center justify-center bg-[#020617] text-white">
        <p className="font-black text-cyan-200">جاري التحقق من الجلسة...</p>
      </main>
    );
  }

  if (!user?.email) {
    return <PublicServiceLanding pageKey="vip-spot" />;
  }

  if (subscriptionExpired) {
    return (
      <main className="min-h-screen bg-[#020617] px-4 py-20 text-white">
        <div className="mx-auto max-w-2xl rounded-[36px] border border-red-200/30 bg-white p-10 text-center text-slate-950 shadow-2xl">
          <div className="text-6xl">⚠️</div>
          <h1 className="mt-6 text-4xl font-black">انتهت صلاحية اشتراكك</h1>
          <p className="mt-4 text-lg font-bold text-slate-600">
            انتهت صلاحية الباقة الخاصة بك. قم بتجديد الاشتراك للعودة إلى توصيات VIP Spot.
          </p>
          <Link
            href="/subscriptions"
            className="mt-8 inline-flex rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-8 py-4 font-black text-white"
          >
            تجديد الاشتراك
          </Link>
        </div>
      </main>
    );
  }

  void statusTick;

  const activeSignals = signals.filter((signal) => getSignalStatus(signal) !== "منتهية");
  const expiredSignals = signals.filter((signal) => getSignalStatus(signal) === "منتهية");

  const filteredSignals =
    selectedFilter === "active"
      ? activeSignals
      : selectedFilter === "expired"
        ? expiredSignals
        : signals;

  return (
    <main
      className="relative min-h-screen overflow-hidden bg-[#020617] text-white select-none"
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.22),transparent_45%),radial-gradient(circle_at_bottom,rgba(59,130,246,0.18),transparent_35%)]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-20 md:px-6">
        <div className="rounded-[36px] border border-cyan-200/70 bg-white/90 p-8 text-slate-950 shadow-[0_30px_120px_rgba(14,165,233,0.18)] backdrop-blur-3xl md:p-12">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-black text-amber-700">
                ⭐ قسم توصيات VIP Spot
              </div>

              <h1 className="text-4xl font-black md:text-6xl">توصيات Spot الاحترافية</h1>

              <p className="mt-6 max-w-3xl text-lg font-bold leading-8 text-slate-600">
                هنا تظهر توصيات السبوت الخاصة بالمشتركين فقط، ويتم تحديثها مباشرة عند نشر توصية جديدة من لوحة الإدارة.
              </p>
            </div>

            <div className="grid h-32 w-32 place-items-center rounded-[32px] border border-cyan-200 bg-cyan-50 text-6xl shadow-[0_0_50px_rgba(34,211,238,0.18)]">
              ⭐
            </div>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-cyan-100 bg-cyan-50 p-5 text-center">
              <p className="text-xs font-black text-cyan-700">كل التوصيات</p>
              <p className="mt-2 text-3xl font-black text-slate-950">{signals.length}</p>
            </div>
            <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5 text-center">
              <p className="text-xs font-black text-emerald-700">التوصيات النشطة</p>
              <p className="mt-2 text-3xl font-black text-slate-950">{activeSignals.length}</p>
            </div>
            <div className="rounded-3xl border border-red-100 bg-red-50 p-5 text-center">
              <p className="text-xs font-black text-red-700">التوصيات المنتهية</p>
              <p className="mt-2 text-3xl font-black text-slate-950">{expiredSignals.length}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setSelectedFilter(filter.key)}
                className={`rounded-2xl px-5 py-3 text-sm font-black transition ${
                  selectedFilter === filter.key
                    ? "bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 text-white shadow-[0_12px_32px_rgba(37,99,235,0.25)]"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="mt-12">
            {loading ? (
              <div className="rounded-[28px] border border-cyan-200 bg-cyan-50 p-8 text-center font-black text-cyan-700">
                جاري تحميل توصيات Spot...
              </div>
            ) : filteredSignals.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-cyan-200 bg-white p-10 text-center text-slate-950">
                <div className="mb-4 text-5xl">📭</div>
                <h2 className="text-2xl font-black">
                  {selectedFilter === "active"
                    ? "لا توجد توصيات نشطة حالياً"
                    : selectedFilter === "expired"
                      ? "لا توجد توصيات منتهية حالياً"
                      : "لا توجد توصيات Spot حالياً"}
                </h2>
                <p className="mt-3 font-bold text-slate-500">عند نشر توصية من لوحة الإدارة ستظهر هنا مباشرة.</p>
              </div>
            ) : (
              <div className="grid gap-6">
                {filteredSignals.map((signal) => (
                  <SignalCard key={signal.id} signal={signal} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
