"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

function SignalCard({ signal }) {
  return (
    <article className="rounded-[28px] border border-cyan-300/15 bg-black/25 p-6 shadow-[0_20px_70px_rgba(0,102,255,0.14)] backdrop-blur-2xl">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <span className="inline-flex rounded-full border border-yellow-300/20 bg-yellow-400/10 px-4 py-2 text-xs font-black text-yellow-100">
            VIP SPOT
          </span>
          <h3 className="mt-4 text-3xl font-black text-cyan-100">{signal.coin}</h3>
          <p className="mt-2 text-sm text-slate-500">{signal.createdAt}</p>
        </div>
        <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-sm font-black text-emerald-100">
          {signal.status || "نشطة"}
        </span>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs font-bold text-slate-500">منطقة الدخول</p>
          <p className="mt-2 font-black text-cyan-100">{signal.entry || "غير محدد"}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs font-bold text-slate-500">الأهداف</p>
          <p className="mt-2 whitespace-pre-line font-black text-emerald-100">{signal.targets || "غير محدد"}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs font-bold text-slate-500">وقف الخسارة</p>
          <p className="mt-2 font-black text-red-100">{signal.stop_loss || "غير محدد"}</p>
        </div>
      </div>

      {signal.notes && (
        <div className="mt-5 rounded-2xl border border-cyan-300/15 bg-cyan-400/5 p-5">
          <p className="text-sm font-bold text-cyan-200">ملاحظات التوصية</p>
          <p className="mt-2 whitespace-pre-line leading-8 text-slate-200">{signal.notes}</p>
        </div>
      )}
    </article>
  );
}

export default function VipSpotPage() {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadSignals = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("vip_signals")
      .select("*")
      .eq("signal_type", "spot")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("VIP Spot signals error:", error);
      setSignals([]);
      setLoading(false);
      return;
    }

    setSignals(
      (data || []).map((item) => ({
        ...item,
        createdAt: item.created_at ? new Date(item.created_at).toLocaleString("ar") : "",
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    loadSignals();

    const channel = supabase
      .channel("vip-spot-signals")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vip_signals", filter: "signal_type=eq.spot" },
        () => loadSignals()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#020617] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.22),transparent_45%),radial-gradient(circle_at_bottom,rgba(59,130,246,0.18),transparent_35%)]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-20 md:px-6">
        <div className="rounded-[36px] border border-cyan-300/15 bg-white/[0.05] p-8 shadow-[0_30px_120px_rgba(15,23,42,0.8)] backdrop-blur-3xl md:p-12">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-yellow-300/20 bg-yellow-400/10 px-4 py-2 text-sm font-black text-yellow-100">
                ⭐ قسم توصيات VIP Spot
              </div>

              <h1 className="text-4xl font-black md:text-6xl">توصيات Spot الاحترافية</h1>

              <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
                هنا تظهر توصيات السبوت الخاصة بالمشتركين فقط، ويتم تحديثها مباشرة عند نشر توصية جديدة من لوحة الإدارة.
              </p>
            </div>

            <div className="grid h-32 w-32 place-items-center rounded-[32px] border border-cyan-300/20 bg-cyan-400/10 text-6xl shadow-[0_0_50px_rgba(34,211,238,0.18)]">
              ⭐
            </div>
          </div>

          <div className="mt-12">
            {loading ? (
              <div className="rounded-[28px] border border-cyan-300/15 bg-black/20 p-8 text-center text-cyan-100">
                جاري تحميل توصيات Spot...
              </div>
            ) : signals.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-cyan-300/20 bg-black/20 p-10 text-center">
                <div className="mb-4 text-5xl">📭</div>
                <h2 className="text-2xl font-black">لا توجد توصيات Spot حالياً</h2>
                <p className="mt-3 text-slate-400">عند نشر توصية من لوحة الإدارة ستظهر هنا مباشرة.</p>
              </div>
            ) : (
              <div className="grid gap-6">
                {signals.map((signal) => (
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