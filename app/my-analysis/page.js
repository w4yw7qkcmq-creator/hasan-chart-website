"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

function StatusBadge({ status }) {
  const isDone = status === "مكتمل";
  const isPending = status === "قيد المراجعة" || !status;

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-black ${
        isDone
          ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"
          : isPending
          ? "border-amber-300/25 bg-amber-400/10 text-amber-200"
          : "border-cyan-300/25 bg-cyan-400/10 text-cyan-200"
      }`}
    >
      {status || "قيد المراجعة"}
    </span>
  );
}

function StatCard({ title, value, icon, subtitle }) {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-6 shadow-[0_18px_55px_rgba(0,102,255,0.14)] backdrop-blur-2xl">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-cyan-400/10" />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-slate-400">{title}</p>
          <h3 className="mt-3 text-4xl font-black text-white">{value}</h3>
          <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
        </div>
        <div className="grid h-14 w-14 place-items-center rounded-2xl border border-cyan-300/20 bg-black/25 text-2xl shadow-[0_0_30px_rgba(0,163,255,0.18)]">
          {icon}
        </div>
      </div>
    </div>
  );
}
export default function MyAnalysisPage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState("all");
  const [dataMode, setDataMode] = useState("supabase");
  const [loading, setLoading] = useState(true);
  const [replyNotice, setReplyNotice] = useState("");
  const [loadError, setLoadError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [openImage, setOpenImage] = useState(null);
  const normalizeRequest = (item) => ({
    id: item.id,
    userEmail: item.user_email || item.userEmail,
    username: item.username || item.user_name || "",
    coin: item.coin || item.symbol || "غير محدد",
    frame: item.frame || item.timeframe || "غير محدد",
    status: item.status || "قيد المراجعة",
    reply: item.reply || "",
    replyImage: item.reply_image || item.replyImage || "",
    createdAt: item.created_at
      ? new Date(item.created_at).toLocaleString("ar")
      : item.createdAt || "",
  });

  const loadRequests = async (user) => {
    setLoading(true);
    setLoadError("");

    if (!user?.email) {
      setRequests([]);
      setLoading(false);
      setLoadError("لم يتم العثور على إيميل المستخدم. سجّل الدخول من جديد.");
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    try {
      const response = await fetch("/api/my-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          email: user.email,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        setRequests([]);
        setLoadError(result?.error || "تعذر تحميل طلبات التحليل.");
        return;
      }

      const formattedRequests = Array.isArray(result.requests)
        ? result.requests.map(normalizeRequest)
        : [];

      setRequests(formattedRequests);
      setDataMode("api");
      setLastUpdated(new Date().toLocaleTimeString("ar"));
      console.log("طلبات التحليل المحملة من API:", formattedRequests);

      const latestReply = formattedRequests.find((item) => item.reply && item.status === "مكتمل");
      if (latestReply) {
        setReplyNotice(`📩 وصل رد الإدارة على طلب تحليل ${latestReply.coin}`);
      }
    } catch (err) {
      console.error("Load requests API error:", err);
      setRequests([]);
      setLoadError(
        err?.name === "AbortError"
          ? "تحميل الطلبات أخذ وقت طويل. اضغط إعادة التحميل أو افتح الصفحة من جديد."
          : "حدث خطأ أثناء تحميل طلبات التحليل."
      );
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    let channel;
    let refreshInterval;

    const start = async () => {
      let user = JSON.parse(localStorage.getItem("currentUser") || "null");

      if (!user?.email) {
        const session = JSON.parse(localStorage.getItem("hasan-chart-auth-session") || "null");
        user = session?.user?.email
          ? {
              email: session.user.email,
              username: session.user.user_metadata?.username || session.user.email,
              role: session.user.user_metadata?.role || "user",
            }
          : null;
      }

      if (!isMounted) return;

      setCurrentUser(user);
      console.log("تحميل طلبات المستخدم:", user);
      await loadRequests(user);

      if (!isMounted || !user?.email) return;

      channel = supabase
        .channel(`my-analysis-requests-${user.email}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "analysis_requests",
            filter: `user_email=eq.${String(user.email || "").trim().toLowerCase()}`,
          },
          () => loadRequests(user)
        )
        .subscribe((status) => {
          console.log("My analysis realtime status:", status);
        });

      refreshInterval = setInterval(() => {
        if (!document.hidden) {
          console.log("تحديث تلقائي للطلبات...");
          loadRequests(user);
        }
      }, 10000);
    };

    start();

    return () => {
      isMounted = false;
      if (refreshInterval) clearInterval(refreshInterval);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const stats = useMemo(() => {
    const completed = requests.filter((item) => item.status === "مكتمل").length;
    const pending = requests.filter((item) => item.status !== "مكتمل").length;
    const withReply = requests.filter((item) => item.reply).length;
    return { completed, pending, withReply };
  }, [requests]);

  const filteredRequests = useMemo(() => {
    if (filter === "completed") return requests.filter((item) => item.status === "مكتمل");
    if (filter === "pending") return requests.filter((item) => item.status !== "مكتمل");
    if (filter === "reply") return requests.filter((item) => item.reply);
    return requests;
  }, [requests, filter]);

  if (!currentUser) {
    return (
      <main className="relative min-h-[calc(100vh-120px)] overflow-hidden rounded-[34px] border border-cyan-300/10 bg-[#020617] p-6 text-white shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(0,102,255,0.32),transparent_30%),linear-gradient(135deg,#020617,#07142f,#030712)]" />
        <div className="relative z-10 flex min-h-[calc(100vh-180px)] items-center justify-center text-center">
          <div className="max-w-md rounded-[32px] border border-cyan-300/15 bg-white/[0.045] p-8 backdrop-blur-2xl">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] border border-cyan-300/25 bg-cyan-400/10 text-4xl">🔐</div>
            <h1 className="text-3xl font-black">سجّل الدخول أولاً</h1>
            <p className="mt-3 leading-7 text-slate-400">ادخل إلى حسابك لعرض طلباتك وردود الإدارة.</p>
            <Link href="/login" className="mt-6 block rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-6 py-4 font-black text-white">
              الدخول للحساب
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative overflow-hidden rounded-[34px] border border-cyan-300/10 bg-[#020617] text-white shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(0,102,255,0.35),transparent_30%),radial-gradient(circle_at_86%_35%,rgba(34,211,238,0.16),transparent_30%),linear-gradient(135deg,#020617,#07142f_48%,#030712)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.13] bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:76px_76px]" />

      <div className="relative z-10 space-y-7 p-4 md:p-6">
        {replyNotice && (
          <div className="fixed left-5 top-5 z-[999] max-w-md rounded-[26px] border border-emerald-300/25 bg-emerald-400/95 p-5 text-black shadow-[0_22px_70px_rgba(16,185,129,0.35)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-black">{replyNotice}</p>
                <p className="mt-1 text-sm font-bold text-black/70">افتح الطلب في الأسفل لمشاهدة الرد والصورة.</p>
              </div>
              <button
                onClick={() => setReplyNotice("")}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black/10 font-black"
              >
                ✕
              </button>
            </div>
          </div>
        )}
        {openImage && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-3 backdrop-blur-md">
            <button
              onClick={() => setOpenImage(null)}
              className="absolute left-4 top-4 z-10 grid h-12 w-12 place-items-center rounded-2xl border border-white/15 bg-white/10 text-2xl font-black text-white"
              aria-label="إغلاق الصورة"
            >
              ✕
            </button>

            <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-[26px] border border-cyan-300/20 bg-[#020617] p-3 shadow-[0_0_80px_rgba(0,163,255,0.25)]">
              <img
                src={openImage}
                alt="صورة التحليل المكبرة"
                className="mx-auto h-auto max-h-none w-full max-w-none rounded-2xl object-contain"
              />
            </div>
          </div>
        )}
        <section className="relative overflow-hidden rounded-[34px] border border-cyan-300/15 bg-gradient-to-br from-[#07142f]/85 via-[#040b1c]/90 to-[#020617]/95 p-7 md:p-9 shadow-2xl backdrop-blur-2xl">
          <div className="absolute -left-24 top-10 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl" />
          <div className="absolute bottom-0 right-20 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div>
              <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-xs font-black text-cyan-200">
                ANALYSIS CENTER
              </span>
              <h1 className="mt-5 text-4xl font-black leading-tight md:text-5xl">
                طلباتي وردود الإدارة
              </h1>
              <p className="mt-4 max-w-2xl leading-8 text-slate-300">
               تابع جميع طلبات التحليل الخاصة بك، حالة كل طلب، وردود الإدارة مع صور التحليل في مكان واحد.
              </p>
            </div>

            <Link
              href="/#analysis"
              className="rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-6 py-4 text-center font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.32)] transition hover:scale-[1.02]"
            >
              طلب تحليل جديد
            </Link>
          </div>
        </section>

        {loading && (
          <section className="space-y-4 rounded-[30px] border border-cyan-300/15 bg-white/[0.045] p-5 text-center text-cyan-100 shadow-2xl backdrop-blur-2xl">
            <p>جاري تحميل طلبات التحليل...</p>
            <button
              onClick={() => loadRequests(currentUser)}
              className="rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-5 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20"
            >
              إعادة التحميل
            </button>
          </section>
        )}

        {!loading && loadError && (
          <section className="rounded-[30px] border border-red-300/20 bg-red-500/10 p-5 text-center text-red-100 shadow-2xl backdrop-blur-2xl">
            <p className="font-black">{loadError}</p>
            <button
              onClick={() => loadRequests(currentUser)}
              className="mt-4 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-5 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20"
            >
              تحديث الطلبات
            </button>
          </section>
        )}

        {!loading && !loadError && lastUpdated && (
          <section className="rounded-[24px] border border-cyan-300/10 bg-white/[0.03] p-4 text-center text-xs font-bold text-slate-400 shadow-2xl backdrop-blur-2xl">
            آخر تحديث: {lastUpdated}
          </section>
        )}

        <section className="grid gap-5 md:grid-cols-3">
          <StatCard title="كل الطلبات" value={requests.length} icon="🧠" subtitle="إجمالي طلباتك" />
          <StatCard title="قيد المراجعة" value={stats.pending} icon="⏳" subtitle="بانتظار رد الإدارة" />
          <StatCard title="تم الرد عليها" value={stats.withReply} icon="📩" subtitle="طلبات تحتوي على رد" />
        </section>

        <section className="rounded-[30px] border border-cyan-300/15 bg-white/[0.045] p-4 shadow-2xl backdrop-blur-2xl md:p-5">
          <div className="flex flex-wrap gap-3">
            {[
              ["all", "كل الطلبات"],
              ["pending", "قيد المراجعة"],
              ["completed", "مكتملة"],
              ["reply", "يوجد رد"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-2xl border px-5 py-3 text-sm font-black transition ${
                  filter === key
                    ? "border-cyan-300/40 bg-cyan-400/20 text-cyan-100 shadow-[0_0_25px_rgba(0,163,255,0.18)]"
                    : "border-white/10 bg-black/20 text-slate-300 hover:border-cyan-300/30 hover:bg-cyan-400/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {!loading && filteredRequests.length === 0 ? (
          <section className="rounded-[30px] border border-dashed border-cyan-300/20 bg-white/[0.035] p-10 text-center shadow-2xl backdrop-blur-2xl">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] border border-cyan-300/20 bg-cyan-400/10 text-4xl">📭</div>
            <h2 className="text-2xl font-black">لا توجد طلبات هنا</h2>
            <p className="mt-3 text-slate-400">ابدأ بإرسال طلب تحليل جديد وسيظهر هنا مباشرة.</p>
            <Link href="/#analysis" className="mx-auto mt-6 inline-block rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-6 py-4 font-black text-white">
              إرسال طلب الآن
            </Link>
          </section>
        ) : !loading ? (
          <section className="grid gap-5">
            {filteredRequests.map((req) => (
              <article
                key={req.id}
                className="relative overflow-hidden rounded-[30px] border border-cyan-300/15 bg-white/[0.045] p-6 shadow-2xl backdrop-blur-2xl transition hover:border-cyan-300/35 hover:shadow-[0_24px_70px_rgba(0,102,255,0.20)]"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(34,211,238,0.12),transparent_30%)]" />
                <div className="relative z-10">
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-3xl font-black text-white">{req.coin}</h2>
                        <StatusBadge status={req.status} />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3 text-sm">
                        <span className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-slate-300">
                          الفريم: <b className="text-cyan-200">{req.frame}</b>
                        </span>
                        <span className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-slate-300">
                          التاريخ: {req.createdAt}
                        </span>
                      </div>
                    </div>

                    <Link
                      href="/#analysis"
                      className="rounded-2xl border border-cyan-300/15 bg-cyan-400/10 px-5 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20"
                    >
                      طلب جديد
                    </Link>
                  </div>

                  {req.reply ? (
                    <div className="mt-6 rounded-[26px] border border-emerald-300/25 bg-emerald-400/10 p-5 shadow-[0_0_45px_rgba(16,185,129,0.10)]">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-xl">📩</div>
                        <div>
                          <h3 className="font-black text-emerald-100">✅ وصل رد الإدارة</h3>
                          <p className="text-xs text-slate-500">تم إرسال الرد من فريق HasaN CharT</p>
                        </div>
                      </div>
                      <div className="max-w-full whitespace-pre-wrap break-words rounded-[22px] border border-white/10 bg-black/20 p-4 text-right text-base leading-8 text-slate-100 [overflow-wrap:anywhere]">
                        {req.reply}
                      </div>

                      {req.replyImage && (
                        <div className="mt-5">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-sm font-bold text-slate-400">صورة التحليل</p>
                            <button
                              onClick={() => setOpenImage(req.replyImage)}
                              className="rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-400/20"
                            >
                              تكبير الصورة 🔍
                            </button>
                          </div>

                          <button
                            onClick={() => setOpenImage(req.replyImage)}
                            className="block w-full overflow-hidden rounded-3xl border border-white/10 bg-black/25 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.35)]"
                          >
                            <img
                              src={req.replyImage}
                              alt="صورة التحليل"
                              className="mx-auto max-h-[560px] w-full rounded-2xl object-contain"
                            />
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-6 rounded-[26px] border border-amber-300/15 bg-amber-400/5 p-5">
                      <div className="flex items-center gap-3">
                        <div className="grid h-11 w-11 place-items-center rounded-2xl border border-amber-300/20 bg-amber-400/10 text-xl">⏳</div>
                        <div>
                          <h3 className="font-black text-amber-100">لم يتم إرسال الرد بعد</h3>
                          <p className="mt-1 text-sm text-slate-400">سيظهر رد الإدارة هنا فور إرساله.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}