"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRequireAuth } from "../hooks/useRequireAuth";
import StatusBadge from "../components/StatusBadge";
import { supabase } from "../../lib/supabase";

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

function AnalysisCardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-[26px] border border-cyan-300/15 bg-white/[0.045] p-4 shadow-[0_14px_42px_rgba(0,102,255,0.12)] backdrop-blur-2xl">
      <div className="animate-pulse space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-28 rounded-full bg-white/10" />
          <div className="h-8 w-20 rounded-full bg-white/10" />
        </div>
        <div className="h-4 w-3/4 rounded-xl bg-white/10" />
        <div className="h-20 rounded-[22px] bg-white/10" />
      </div>
    </div>
  );
}

function SessionLoadingState() {
  return (
    <main className="relative min-h-[calc(100vh-120px)] overflow-hidden rounded-[34px] border border-cyan-300/10 bg-[#020617] p-6 text-white shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(0,102,255,0.32),transparent_30%),linear-gradient(135deg,#020617,#07142f,#030712)]" />
      <div className="relative z-10 space-y-7 p-4 md:p-6">
        <div className="h-40 animate-pulse rounded-[34px] border border-cyan-300/15 bg-white/[0.045]" />
        <div className="grid gap-5 md:grid-cols-3">
          <AnalysisCardSkeleton />
          <AnalysisCardSkeleton />
          <AnalysisCardSkeleton />
        </div>
        <p className="text-center text-sm font-bold text-slate-400">جاري التحقق من الجلسة...</p>
      </div>
    </main>
  );
}

function formatArabicDateTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("ar-SY-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Damascus",
  }).format(date);
}
export default function MyAnalysisPage() {
  const { user: currentUser, sessionPending, shouldShowLogin } = useRequireAuth();
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState("all");
  const [dataMode, setDataMode] = useState("supabase");
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [replyNotice, setReplyNotice] = useState("");
  const [loadError, setLoadError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);
  const [fullImageOpen, setFullImageOpen] = useState(false);
  const [imageLoadingId, setImageLoadingId] = useState(null);
  const selectedAnalysisRef = useRef(null);
  const requestsRef = useRef([]);
  const hasLoadedOnceRef = useRef(false);
  const loadInFlightRef = useRef(false);
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
      ? formatArabicDateTime(item.created_at)
      : formatArabicDateTime(item.createdAt) || "",
  });

  const openAnalysis = async (request) => {
    if (!request) return;

    setFullImageOpen(false);
    setImageLoadingId(request.id);
    setSelectedAnalysis(request);

    try {
      if (!request?.id || !currentUser?.email || request.replyImage) return;

      const response = await fetch(
        `/api/my-analysis-image?id=${encodeURIComponent(request.id)}`,
        {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        }
      );

      const result = await response.json().catch(() => null);

      if (response.ok && result?.success && result?.reply_image) {
        const updatedRequest = {
          ...request,
          replyImage: result.reply_image,
        };

        setSelectedAnalysis(updatedRequest);
        setRequests((prev) =>
          prev.map((item) =>
            item.id === request.id ? { ...item, replyImage: result.reply_image } : item
          )
        );
      }
    } catch (err) {
      console.warn("Analysis image loading skipped:", err?.message || err);
    } finally {
      setImageLoadingId(null);
    }
  };

  useEffect(() => {
    selectedAnalysisRef.current = selectedAnalysis;
  }, [selectedAnalysis]);

  useEffect(() => {
    if (!replyNotice) return;

    const timer = setTimeout(() => {
      setReplyNotice("");
    }, 5000);

    return () => clearTimeout(timer);
  }, [replyNotice]);

  useEffect(() => {
    requestsRef.current = requests;
  }, [requests]);

  const loadRequests = useCallback(async (user, { background = false } = {}) => {
    if (loadInFlightRef.current) {
      return;
    }

    loadInFlightRef.current = true;

    const hasExistingData = requestsRef.current.length > 0 || hasLoadedOnceRef.current;

    if (background || hasExistingData) {
      setIsFetching(true);
    } else {
      setIsLoading(true);
    }

    setLoadError("");

    if (!user?.email) {
      if (!hasExistingData) setRequests([]);
      setIsLoading(false);
      setIsFetching(false);
      if (!sessionPending) {
        setLoadError("لم يتم العثور على إيميل المستخدم. سجّل الدخول من جديد.");
      }
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch("/api/my-analysis", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        signal: controller.signal,
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        if (!hasExistingData) setRequests([]);
        setLoadError(result?.error || "تعذر تحميل طلبات التحليل.");
        return;
      }

      const formattedRequests = Array.isArray(result.requests)
        ? result.requests.map(normalizeRequest)
        : [];

      const previousReplyIds = new Set(
        requestsRef.current.filter((item) => item.reply).map((item) => item.id)
      );
      const newReply = formattedRequests.find(
        (item) => item.reply && item.status === "مكتمل" && !previousReplyIds.has(item.id)
      );

      setRequests(formattedRequests);
      hasLoadedOnceRef.current = true;
      setDataMode("api");
      setLastUpdated(
        new Intl.DateTimeFormat("ar-SY-u-nu-latn", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
          timeZone: "Asia/Damascus",
        }).format(new Date())
      );

      if (newReply && background) {
        setReplyNotice(`📩 وصل رد الإدارة على طلب تحليل ${newReply.coin}`);
      }

      if (process.env.NODE_ENV !== "production") {
        console.log("طلبات التحليل المحملة من API:", formattedRequests.length);
      }
    } catch (err) {
      console.error("Load requests API error:", err);
      if (!hasExistingData) setRequests([]);
      setLoadError(
        err?.name === "AbortError"
          ? "تحميل الطلبات أخذ وقت طويل بسبب حجم صور التحليل. اضغط تحديث الطلبات مرة أخرى."
          : "حدث خطأ أثناء تحميل طلبات التحليل."
      );
    } finally {
      clearTimeout(timeoutId);
      loadInFlightRef.current = false;
      setIsLoading(false);
      setIsFetching(false);
    }
  }, [sessionPending]);

  useEffect(() => {
    if (sessionPending) return;

    if (shouldShowLogin) {
      setIsLoading(false);
      setIsFetching(false);
      return;
    }

    let isMounted = true;
    let channel;
    let refreshInterval;
    let refreshIfIdle;
    let onVisibilityChange;

    const start = async () => {
      const user = currentUser;

      if (!isMounted || !user?.email) return;

      if (process.env.NODE_ENV !== "production") {
        console.log("تحميل طلبات المستخدم:", user);
      }
      await loadRequests(user);

      if (!isMounted || !user?.email) return;

      refreshIfIdle = () => {
        if (!selectedAnalysisRef.current) {
          void loadRequests(user, { background: true });
        }
      };

      onVisibilityChange = () => {
        if (document.visibilityState === "visible") refreshIfIdle();
      };

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
          () => {
            if (selectedAnalysisRef.current) {
              setReplyNotice("📩 وصل تحديث جديد على طلبات التحليل. أغلق التحليل لتحديث القائمة.");
              return;
            }

            void loadRequests(user, { background: true });
          }
        )
        .subscribe((status) => {
          if (process.env.NODE_ENV !== "production" && status === "SUBSCRIBED") {
            console.log("My analysis realtime connected");
          }
        });

      refreshInterval = setInterval(() => {
        if (document.hidden) return;
        refreshIfIdle();
      }, 15000);
      window.addEventListener("focus", refreshIfIdle);
      document.addEventListener("visibilitychange", onVisibilityChange);
    };

    void start();

    return () => {
      isMounted = false;
      if (refreshInterval) clearInterval(refreshInterval);
      if (refreshIfIdle) {
        window.removeEventListener("focus", refreshIfIdle);
      }
      if (onVisibilityChange) {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
      if (channel) supabase.removeChannel(channel);
    };
  }, [sessionPending, shouldShowLogin, currentUser, loadRequests]);

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

  if (sessionPending) {
    return <SessionLoadingState />;
  }

  if (shouldShowLogin) {
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
          <div className="fixed left-5 top-5 z-[999] max-w-md overflow-hidden rounded-[28px] border border-cyan-200/40 bg-gradient-to-br from-cyan-300 via-sky-400 to-blue-500 p-5 text-white shadow-[0_24px_80px_rgba(0,132,255,0.38)] backdrop-blur-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-black text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]">{replyNotice}</p>
                <p className="mt-1 text-sm font-bold text-white/90">افتح الطلب في الأسفل لمشاهدة الرد والصورة.</p>
              </div>
              <button
                onClick={() => setReplyNotice("")}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/20 font-black text-white transition hover:bg-white/30"
              >
                ✕
              </button>
            </div>
            <div className="absolute bottom-0 left-0 h-1 w-full bg-white/30">
              <div className="h-full animate-pulse bg-white" />
            </div>
          </div>
        )}
        {selectedAnalysis && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-3 backdrop-blur-md">
            <div className="relative max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-[30px] border border-cyan-300/20 bg-[#020617] shadow-[0_0_80px_rgba(0,163,255,0.25)]">
              <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-cyan-300/25 bg-gradient-to-l from-[#1263c7] via-[#0b3b78] to-[#06162f] p-4 shadow-[0_16px_45px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                <div className="text-right">
                  <h2 className="text-2xl font-black !text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.95)]">{selectedAnalysis.coin}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-black !text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.95)]">
                    <span>الفريم:</span>
                    <span dir="ltr" className="rounded-full bg-white/10 px-2 py-1">{selectedAnalysis.frame}</span>
                    <span>•</span>
                    <span>التاريخ:</span>
                    <span dir="ltr" className="rounded-full bg-white/10 px-2 py-1">{selectedAnalysis.createdAt}</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setFullImageOpen(false);
                    setSelectedAnalysis(null);
                  }}
                  className="rounded-2xl border border-white/25 bg-gradient-to-l from-blue-700 via-blue-600 to-cyan-500 px-4 py-2 text-sm font-black text-white shadow-[0_0_22px_rgba(0,163,255,0.35)] transition hover:scale-[1.02]"
                >
                  إغلاق التحليل ✕
                </button>
              </div>

              <div className="max-h-[calc(92vh-82px)] space-y-5 overflow-auto p-4 md:p-6">
                <div className="rounded-[24px] border border-emerald-300/20 bg-emerald-400/10 p-4">
                  <h3 className="mb-3 font-black text-emerald-100">✅ رد الإدارة</h3>
                  <div className="whitespace-pre-wrap break-words rounded-[20px] border border-white/10 bg-black/25 p-4 text-right text-base leading-8 text-slate-100 [overflow-wrap:anywhere]">
                    {selectedAnalysis.reply || "لم يتم إرسال الرد بعد."}
                  </div>
                </div>

                {imageLoadingId === selectedAnalysis.id && (
                  <div className="rounded-[24px] border border-cyan-300/20 bg-cyan-400/10 p-4 text-center text-sm font-bold text-cyan-100">
                    جاري تحميل صورة التحليل...
                  </div>
                )}
                {selectedAnalysis.replyImage && (
                  <div className="rounded-[24px] border border-cyan-300/20 bg-cyan-400/10 p-4">
                    <p className="mb-3 text-sm font-bold text-cyan-100">صورة التحليل</p>
                    <Image
                      src={selectedAnalysis.replyImage}
                      alt="صورة التحليل"
                      width={1200}
                      height={900}
                      loading="lazy"
                      sizes="(max-width: 768px) 100vw, 800px"
                      className="mx-auto max-h-[74vh] w-full rounded-2xl object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => setFullImageOpen(true)}
                      className="mt-3 inline-block rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20"
                    >
                      تكبير الصورة داخل الموقع
                    </button>
                    {fullImageOpen && (
                      <div className="fixed inset-y-0 left-0 right-0 z-[10000] flex items-center justify-center bg-[#020817] p-0 backdrop-blur-lg md:right-[305px]">
                        <button
                          type="button"
                          onClick={() => setFullImageOpen(false)}
                          className="absolute left-5 top-5 z-10 rounded-2xl border border-white/25 bg-gradient-to-l from-blue-700 via-blue-600 to-cyan-500 px-5 py-3 text-sm font-black !text-white shadow-[0_0_25px_rgba(0,163,255,0.35)]"
                        >
                          إغلاق الصورة ✕
                        </button>

                        <Image
                          src={selectedAnalysis.replyImage}
                          alt="صورة التحليل بالحجم الكامل"
                          width={1600}
                          height={1200}
                          loading="lazy"
                          sizes="100vw"
                          className="h-screen w-full rounded-none object-contain shadow-[0_0_80px_rgba(0,0,0,0.65)] md:h-screen md:w-full"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
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

        {isFetching ? (
          <section className="rounded-[24px] border border-cyan-300/10 bg-cyan-400/10 px-4 py-3 text-center text-xs font-bold text-cyan-100 shadow-2xl backdrop-blur-2xl">
            جاري التحديث...
          </section>
        ) : null}

        {isLoading && requests.length === 0 ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <AnalysisCardSkeleton />
            <AnalysisCardSkeleton />
            <AnalysisCardSkeleton />
          </section>
        ) : null}

        {!isLoading && loadError && requests.length === 0 ? (
          <section className="rounded-[30px] border border-red-300/20 bg-red-500/10 p-5 text-center text-red-100 shadow-2xl backdrop-blur-2xl">
            <p className="font-black">{loadError}</p>
            <button
              onClick={() => void loadRequests(currentUser)}
              className="mt-4 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-5 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20"
            >
              تحديث الطلبات
            </button>
          </section>
        ) : null}

        {loadError && requests.length > 0 ? (
          <section className="rounded-[24px] border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-center text-xs font-bold text-amber-100">
            {loadError}
          </section>
        ) : null}

        {!isLoading && !loadError && lastUpdated ? (
          <section className="rounded-[24px] border border-cyan-300/10 bg-white/[0.03] p-4 text-center text-xs font-bold text-slate-400 shadow-2xl backdrop-blur-2xl">
            آخر تحديث: {lastUpdated}
          </section>
        ) : null}

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

        {!isLoading && filteredRequests.length === 0 ? (
          <section className="rounded-[30px] border border-dashed border-cyan-300/20 bg-white/[0.035] p-10 text-center shadow-2xl backdrop-blur-2xl">
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] border border-cyan-300/20 bg-cyan-400/10 text-4xl">📭</div>
            <h2 className="text-2xl font-black">لا توجد طلبات هنا</h2>
            <p className="mt-3 text-slate-400">ابدأ بإرسال طلب تحليل جديد وسيظهر هنا مباشرة.</p>
            <Link href="/#analysis" className="mx-auto mt-6 inline-block rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-6 py-4 font-black text-white">
              إرسال طلب الآن
            </Link>
          </section>
        ) : filteredRequests.length > 0 ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredRequests.map((req) => (
              <article
                key={req.id}
                className="relative overflow-hidden rounded-[26px] border border-cyan-300/15 bg-white/[0.045] p-4 shadow-[0_14px_42px_rgba(0,102,255,0.12)] backdrop-blur-2xl transition hover:border-cyan-300/35 hover:shadow-[0_20px_55px_rgba(0,102,255,0.18)]"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(34,211,238,0.12),transparent_30%)]" />
                <div className="relative z-10">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-2xl font-black text-white">{req.coin}</h2>
                        <StatusBadge status={req.status} variant="analysis" />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-slate-300">
                          الفريم: <b className="text-cyan-200">{req.frame}</b>
                        </span>
                        <span className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-slate-300">
                          التاريخ: <b dir="ltr" className="text-cyan-200">{req.createdAt}</b>
                        </span>
                      </div>
                    </div>
                  </div>

                  {req.reply ? (
                    <div className="mt-4 rounded-[22px] border border-emerald-300/20 bg-emerald-400/10 p-3">
                      <div className="mb-3 flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-lg">📩</div>
                        <div>
                          <h3 className="font-black text-emerald-100">✅ وصل رد الإدارة</h3>
                          <p className="text-xs text-slate-500">تم إرسال الرد من فريق HasaN CharT</p>
                        </div>
                      </div>

                      <p className="line-clamp-3 rounded-[18px] border border-white/10 bg-black/20 p-3 text-right text-sm leading-7 text-slate-100 [overflow-wrap:anywhere]">
                        {req.reply}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openAnalysis(req)}
                          className="rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20"
                        >
                          عرض التحليل
                        </button>
                        <Link
                          href="/#analysis"
                          className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-black text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-400/10"
                        >
                          طلب جديد
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-[22px] border border-amber-300/15 bg-amber-400/5 p-3">
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