"use client";
import { UiPageShell } from "../../components/ui";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRequireAuth } from "../../hooks/useRequireAuth";
import StatusBadge from "../../components/StatusBadge";
import { supabase } from "../../../lib/supabase";
import { createAdaptivePoller } from "../../../lib/client/adaptive-poller.js";
import { dedupeInFlightRequest } from "../../../lib/client/in-flight-dedupe.js";
import { incrementPollingMetric } from "../../../lib/client/polling-metrics.js";
function StatCard({ title, value, icon, subtitle }) {
  return (
    <div className="relative overflow-hidden rounded-[28px] border admin-panel-border ui-glass-045 p-6 shadow-[0_18px_55px_rgba(0,102,255,0.14)] backdrop-blur-2xl">
      {" "}
      <div className="absolute inset-0 admin-panel" />{" "}
      <div className="relative z-10 flex items-start justify-between gap-4">
        {" "}
        <div>
          {" "}
          <p className="text-sm font-bold admin-text-subtle">{title}</p>{" "}
          <h3 className="mt-3 text-4xl font-black admin-text">{value}</h3>{" "}
          <p className="mt-2 text-sm admin-text-subtle">{subtitle}</p>{" "}
        </div>{" "}
        <div className="grid h-14 w-14 place-items-center rounded-2xl border admin-panel-border admin-panel text-2xl shadow-[0_0_30px_rgba(0,163,255,0.18)]">
          {" "}
          {icon}{" "}
        </div>{" "}
      </div>{" "}
    </div>
  );
}
function AnalysisCardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-[26px] border admin-panel-border ui-glass-045 p-4 shadow-[0_14px_42px_rgba(0,102,255,0.12)] backdrop-blur-2xl">
      {" "}
      <div className="animate-pulse space-y-4">
        {" "}
        <div className="flex items-center gap-3">
          {" "}
          <div className="h-8 w-28 rounded-full ui-glass-10" />{" "}
          <div className="h-8 w-20 rounded-full ui-glass-10" />{" "}
        </div>{" "}
        <div className="h-4 w-3/4 rounded-xl ui-glass-10" />{" "}
        <div className="h-20 rounded-[22px] ui-glass-10" />{" "}
      </div>{" "}
    </div>
  );
}
function SessionLoadingState() {
  return (
    <main className="relative min-h-[calc(100vh-120px)] overflow-hidden rounded-[34px] border admin-panel-border ui-page-dark p-6 admin-text shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
      {" "}
      <div className="ui-forbidden-page__backdrop pointer-events-none absolute inset-0" />{" "}
      <div className="relative z-10 space-y-7 p-4 md:p-6">
        {" "}
        <div className="h-40 animate-pulse rounded-[34px] border admin-panel-border ui-glass-045" />{" "}
        <div className="grid gap-5 md:grid-cols-3">
          {" "}
          <AnalysisCardSkeleton /> <AnalysisCardSkeleton />{" "}
          <AnalysisCardSkeleton />{" "}
        </div>{" "}
        <p className="text-center text-sm font-bold admin-text-subtle">
          جاري التحقق من الجلسة...
        </p>{" "}
      </div>{" "}
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
  const {
    user: currentUser,
    sessionPending,
    shouldShowLogin,
  } = useRequireAuth();
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
  const loadAbortRef = useRef(null);
  const loadSeqRef = useRef(0);
  const realtimeConnectedRef = useRef(false);
  const pollSuppressUntilRef = useRef(0);
  const fallbackPollerRef = useRef(null);
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
        { method: "GET", cache: "no-store", credentials: "include" },
      );
      const result = await response.json().catch(() => null);
      if (response.ok && result?.success && result?.reply_image) {
        const updatedRequest = { ...request, replyImage: result.reply_image };
        setSelectedAnalysis(updatedRequest);
        setRequests((prev) =>
          prev.map((item) =>
            item.id === request.id
              ? { ...item, replyImage: result.reply_image }
              : item,
          ),
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
  const loadRequests = useCallback(
    async (user, { background = false, signal } = {}) => {
      if (!user?.email) {
        const hasExistingData =
          requestsRef.current.length > 0 || hasLoadedOnceRef.current;
        if (!hasExistingData) setRequests([]);
        setIsLoading(false);
        setIsFetching(false);
        if (!sessionPending) {
          setLoadError(
            "لم يتم العثور على إيميل المستخدم. سجّل الدخول من جديد.",
          );
        }
        return;
      }
      const dedupeKey = `my-analysis:${user.email}`;
      return dedupeInFlightRequest(dedupeKey, async () => {
        if (loadInFlightRef.current) {
          return;
        }
        loadInFlightRef.current = true;
        loadAbortRef.current?.abort();
        const controller = new AbortController();
        loadAbortRef.current = controller;
        const seq = ++loadSeqRef.current;
        if (signal) {
          signal.addEventListener("abort", () => controller.abort(), {
            once: true,
          });
        }
        const hasExistingData =
          requestsRef.current.length > 0 || hasLoadedOnceRef.current;
        if (background || hasExistingData) {
          setIsFetching(true);
        } else {
          setIsLoading(true);
        }
        setLoadError("");
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        try {
          const response = await fetch("/api/my-analysis", {
            method: "GET",
            cache: "no-store",
            credentials: "include",
            signal: controller.signal,
          });
          if (seq !== loadSeqRef.current) return;
          const result = await response.json().catch(() => null);
          if (!response.ok || !result?.success) {
            if (!hasExistingData) setRequests([]);
            setLoadError(result?.error || "تعذر تحميل طلبات التحليل.");
            throw new Error(result?.error || "load failed");
          }
          const formattedRequests = Array.isArray(result.requests)
            ? result.requests.map(normalizeRequest)
            : [];
          const previousReplyIds = new Set(
            requestsRef.current
              .filter((item) => item.reply)
              .map((item) => item.id),
          );
          const newReply = formattedRequests.find(
            (item) =>
              item.reply &&
              item.status === "مكتمل" &&
              !previousReplyIds.has(item.id),
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
            }).format(new Date()),
          );
          if (newReply && background) {
            setReplyNotice(`📩 وصل رد الإدارة على طلب تحليل ${newReply.coin}`);
          }
          fallbackPollerRef.current?.resetBackoff();
          if (process.env.NODE_ENV !== "production") {
            console.log(
              "طلبات التحليل المحملة من API:",
              formattedRequests.length,
            );
          }
        } catch (err) {
          if (seq !== loadSeqRef.current || err?.name === "AbortError") return;
          console.error("Load requests API error:", err);
          if (!hasExistingData) setRequests([]);
          setLoadError(
            err?.name === "AbortError"
              ? "تحميل الطلبات أخذ وقت طويل بسبب حجم صور التحليل. اضغط تحديث الطلبات مرة أخرى."
              : "حدث خطأ أثناء تحميل طلبات التحليل.",
          );
          throw err;
        } finally {
          clearTimeout(timeoutId);
          if (seq === loadSeqRef.current) {
            loadInFlightRef.current = false;
            setIsLoading(false);
            setIsFetching(false);
          }
        }
      });
    },
    [sessionPending],
  );
  useEffect(() => {
    if (sessionPending) return;
    if (shouldShowLogin) {
      setIsLoading(false);
      setIsFetching(false);
      return;
    }
    let isMounted = true;
    let channel;
    const start = async () => {
      const user = currentUser;
      if (!isMounted || !user?.email) return;
      if (process.env.NODE_ENV !== "production") {
        console.log("تحميل طلبات المستخدم:", user);
      }
      await loadRequests(user);
      if (!isMounted || !user?.email) return;
      const syncPollInterval = () => {
        const pending = requestsRef.current.some(
          (item) => item.status !== "مكتمل",
        );
        fallbackPollerRef.current?.setIntervalMs(pending ? 30_000 : 45_000);
      };
      const fallbackPoller = createAdaptivePoller({
        intervalMs: 30_000,
        minIntervalMs: 30_000,
        maxIntervalMs: 120_000,
        visibilityJitterMs: 300,
        shouldPoll: () => {
          if (selectedAnalysisRef.current) return false;
          if (Date.now() < pollSuppressUntilRef.current) return false;
          const pending = requestsRef.current.some(
            (item) => item.status !== "مكتمل",
          );
          if (pending) return true;
          return !realtimeConnectedRef.current;
        },
        fetch: async ({ signal }) => {
          await loadRequests(user, { background: true, signal });
          syncPollInterval();
        },
      });
      fallbackPollerRef.current = fallbackPoller;
      syncPollInterval();
      fallbackPoller.start({ immediate: false });
      channel = supabase
        .channel(`my-analysis-requests-${user.email}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "analysis_requests",
            filter: `user_email=eq.${String(user.email || "")
              .trim()
              .toLowerCase()}`,
          },
          () => {
            incrementPollingMetric("realtimeEvents");
            if (selectedAnalysisRef.current) {
              setReplyNotice(
                "📩 وصل تحديث جديد على طلبات التحليل. أغلق التحليل لتحديث القائمة.",
              );
              pollSuppressUntilRef.current = Date.now() + 30_000;
              syncPollInterval();
              fallbackPoller.resetBackoff();
              fallbackPoller.scheduleNext(30_000);
              return;
            }
            pollSuppressUntilRef.current = Date.now() + 30_000;
            syncPollInterval();
            fallbackPoller.resetBackoff();
            fallbackPoller.scheduleNext(30_000);
          },
        )
        .subscribe((status) => {
          realtimeConnectedRef.current = status === "SUBSCRIBED";
          syncPollInterval();
          if (
            process.env.NODE_ENV !== "production" &&
            status === "SUBSCRIBED"
          ) {
            console.log("My analysis realtime connected");
          }
          if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            realtimeConnectedRef.current = false;
            if (!document.hidden && !selectedAnalysisRef.current) {
              fallbackPoller.triggerRefresh("fallback");
            }
          }
        });
    };
    void start();
    return () => {
      isMounted = false;
      loadAbortRef.current?.abort();
      loadSeqRef.current += 1;
      loadInFlightRef.current = false;
      fallbackPollerRef.current?.destroy();
      fallbackPollerRef.current = null;
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
    if (filter === "completed")
      return requests.filter((item) => item.status === "مكتمل");
    if (filter === "pending")
      return requests.filter((item) => item.status !== "مكتمل");
    if (filter === "reply") return requests.filter((item) => item.reply);
    return requests;
  }, [requests, filter]);
  if (sessionPending) {
    return <SessionLoadingState />;
  }
  if (shouldShowLogin) {
    return (
      <main className="relative min-h-[calc(100vh-120px)] overflow-hidden rounded-[34px] border admin-panel-border ui-page-dark p-6 admin-text shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
        {" "}
        <div className="ui-forbidden-page__backdrop pointer-events-none absolute inset-0" />{" "}
        <div className="relative z-10 flex min-h-[calc(100vh-180px)] items-center justify-center text-center">
          {" "}
          <div className="max-w-md rounded-[32px] border admin-panel-border ui-glass-045 p-8 backdrop-blur-2xl">
            {" "}
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] border admin-panel-border admin-panel text-4xl">
              🔐
            </div>{" "}
            <h1 className="text-3xl font-black">سجّل الدخول أولاً</h1>{" "}
            <p className="mt-3 leading-7 admin-text-subtle">
              ادخل إلى حسابك لعرض طلباتك وردود الإدارة.
            </p>{" "}
            <Link
              href="/login"
              className="mt-6 block rounded-2xl admin-panel px-6 py-4 font-black admin-text"
            >
              {" "}
              الدخول للحساب{" "}
            </Link>{" "}
          </div>{" "}
        </div>{" "}
      </main>
    );
  }
  return (
    <main className="relative overflow-hidden rounded-[34px] border admin-panel-border ui-page-dark admin-text shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
      {" "}
      <div className="ui-public-seo-page__backdrop pointer-events-none absolute inset-0" />{" "}
      <div className="ui-public-seo-page__grid pointer-events-none absolute inset-0" />{" "}
      <div className="relative z-10 space-y-7 p-4 md:p-6">
        {" "}
        {replyNotice && (
          <div className="fixed left-5 top-5 z-[999] max-w-md overflow-hidden rounded-[28px] border admin-panel-border admin-panel p-5 admin-text shadow-[0_24px_80px_rgba(0,132,255,0.38)] backdrop-blur-2xl">
            {" "}
            <div className="flex items-start justify-between gap-4">
              {" "}
              <div>
                {" "}
                <p className="font-black admin-text drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]">
                  {replyNotice}
                </p>{" "}
                <p className="mt-1 text-sm font-bold admin-text/90">
                  افتح الطلب في الأسفل لمشاهدة الرد والصورة.
                </p>{" "}
              </div>{" "}
              <button
                onClick={() => setReplyNotice("")}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full ui-glass-20 font-black admin-text transition hover:ui-glass-30"
              >
                {" "}
                ✕{" "}
              </button>{" "}
            </div>{" "}
            <div className="absolute bottom-0 left-0 h-1 w-full ui-glass-30">
              {" "}
              <div className="h-full animate-pulse ui-glass-solid" />{" "}
            </div>{" "}
          </div>
        )}{" "}
        {selectedAnalysis && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center admin-panel p-3 backdrop-blur-md">
            {" "}
            <div className="relative max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-[30px] border admin-panel-border ui-page-dark shadow-[0_0_80px_rgba(0,163,255,0.25)]">
              {" "}
              <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b admin-panel-border admin-panel p-4 shadow-[0_16px_45px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                {" "}
                <div className="text-right">
                  {" "}
                  <h2 className="text-2xl font-black !admin-text [text-shadow:0_2px_8px_rgba(0,0,0,0.95)]">
                    {selectedAnalysis.coin}
                  </h2>{" "}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-black !admin-text [text-shadow:0_2px_8px_rgba(0,0,0,0.95)]">
                    {" "}
                    <span>الفريم:</span>{" "}
                    <span
                      dir="ltr"
                      className="rounded-full ui-glass-10 px-2 py-1"
                    >
                      {selectedAnalysis.frame}
                    </span>{" "}
                    <span>•</span> <span>التاريخ:</span>{" "}
                    <span
                      dir="ltr"
                      className="rounded-full ui-glass-10 px-2 py-1"
                    >
                      {selectedAnalysis.createdAt}
                    </span>{" "}
                  </div>{" "}
                </div>{" "}
                <button
                  onClick={() => {
                    setFullImageOpen(false);
                    setSelectedAnalysis(null);
                  }}
                  className="rounded-2xl border admin-panel-border admin-panel px-4 py-2 text-sm font-black admin-text shadow-[0_0_22px_rgba(0,163,255,0.35)] transition hover:scale-[1.02]"
                >
                  {" "}
                  إغلاق التحليل ✕{" "}
                </button>{" "}
              </div>{" "}
              <div className="max-h-[calc(92vh-82px)] space-y-5 overflow-auto p-4 md:p-6">
                {" "}
                <div className="admin-banner-success rounded-[24px] p-4">
                  {" "}
                  <h3 className="mb-3 font-black admin-text-success">
                    ✅ رد الإدارة
                  </h3>{" "}
                  <div className="whitespace-pre-wrap break-words rounded-[20px] border admin-panel-border admin-panel p-4 text-right text-base leading-8 admin-text-muted [overflow-wrap:anywhere]">
                    {" "}
                    {selectedAnalysis.reply || "لم يتم إرسال الرد بعد."}{" "}
                  </div>{" "}
                </div>{" "}
                {imageLoadingId === selectedAnalysis.id && (
                  <div className="rounded-[24px] border admin-panel-border admin-panel p-4 text-center text-sm font-bold ui-public-seo-link-chip">
                    {" "}
                    جاري تحميل صورة التحليل...{" "}
                  </div>
                )}{" "}
                {selectedAnalysis.replyImage && (
                  <div className="rounded-[24px] border admin-panel-border admin-panel p-4">
                    {" "}
                    <p className="mb-3 text-sm font-bold ui-public-seo-link-chip">
                      صورة التحليل
                    </p>{" "}
                    <Image
                      src={selectedAnalysis.replyImage}
                      alt="صورة التحليل"
                      width={1200}
                      height={900}
                      loading="lazy"
                      sizes="(max-width: 768px) 100vw, 800px"
                      className="mx-auto max-h-[74vh] w-full rounded-2xl object-contain"
                    />{" "}
                    <button
                      type="button"
                      onClick={() => setFullImageOpen(true)}
                      className="mt-3 inline-block rounded-2xl border admin-panel-border admin-panel px-4 py-2 text-sm font-black ui-public-seo-link-chip transition hover:admin-panel"
                    >
                      {" "}
                      تكبير الصورة داخل الموقع{" "}
                    </button>{" "}
                    {fullImageOpen && (
                      <div className="fixed inset-y-0 left-0 right-0 z-[10000] flex items-center justify-center ui-page-dark p-0 backdrop-blur-lg md:right-[305px]">
                        {" "}
                        <button
                          type="button"
                          onClick={() => setFullImageOpen(false)}
                          className="absolute left-5 top-5 z-10 rounded-2xl border admin-panel-border admin-panel px-5 py-3 text-sm font-black !admin-text shadow-[0_0_25px_rgba(0,163,255,0.35)]"
                        >
                          {" "}
                          إغلاق الصورة ✕{" "}
                        </button>{" "}
                        <Image
                          src={selectedAnalysis.replyImage}
                          alt="صورة التحليل بالحجم الكامل"
                          width={1600}
                          height={1200}
                          loading="lazy"
                          sizes="100vw"
                          className="h-screen w-full rounded-none object-contain shadow-[0_0_80px_rgba(0,0,0,0.65)] md:h-screen md:w-full"
                        />{" "}
                      </div>
                    )}{" "}
                  </div>
                )}{" "}
              </div>{" "}
            </div>{" "}
          </div>
        )}{" "}
        <section className="ui-public-seo-hero relative overflow-hidden p-7 md:p-9">
          {" "}
          <div className="ui-public-seo-hero-glow ui-public-seo-hero-glow--primary ui-public-seo-hero-glow--left-lg" />{" "}
          <div className="absolute bottom-0 right-20 h-72 w-72 rounded-full admin-panel blur-3xl" />{" "}
          <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-center">
            {" "}
            <div>
              {" "}
              <span className="inline-flex rounded-full border admin-panel-border admin-panel px-4 py-2 text-xs font-black admin-text-muted">
                {" "}
                ANALYSIS CENTER{" "}
              </span>{" "}
              <h1 className="mt-5 text-4xl font-black leading-tight md:text-5xl">
                {" "}
                طلباتي وردود الإدارة{" "}
              </h1>{" "}
              <p className="mt-4 max-w-2xl leading-8 admin-text-muted">
                {" "}
                تابع جميع طلبات التحليل الخاصة بك، حالة كل طلب، وردود الإدارة مع
                صور التحليل في مكان واحد.{" "}
              </p>{" "}
            </div>{" "}
            <Link
              href="/#analysis"
              className="rounded-2xl admin-panel px-6 py-4 text-center font-black admin-text shadow-[0_18px_50px_rgba(37,99,235,0.32)] transition hover:scale-[1.02]"
            >
              {" "}
              طلب تحليل جديد{" "}
            </Link>{" "}
          </div>{" "}
        </section>{" "}
        {isFetching ? (
          <section className="rounded-[24px] border admin-panel-border admin-panel px-4 py-3 text-center text-xs font-bold ui-public-seo-link-chip shadow-2xl backdrop-blur-2xl">
            {" "}
            جاري التحديث...{" "}
          </section>
        ) : null}{" "}
        {isLoading && requests.length === 0 ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {" "}
            <AnalysisCardSkeleton /> <AnalysisCardSkeleton />{" "}
            <AnalysisCardSkeleton />{" "}
          </section>
        ) : null}{" "}
        {!isLoading && loadError && requests.length === 0 ? (
          <section className="admin-banner-danger rounded-[30px] p-5 text-center shadow-2xl backdrop-blur-2xl">
            {" "}
            <p className="font-black">{loadError}</p>{" "}
            <button
              onClick={() => void loadRequests(currentUser)}
              className="mt-4 rounded-2xl border admin-panel-border admin-panel px-5 py-3 text-sm font-black ui-public-seo-link-chip transition hover:admin-panel"
            >
              {" "}
              تحديث الطلبات{" "}
            </button>{" "}
          </section>
        ) : null}{" "}
        {loadError && requests.length > 0 ? (
          <section className="ui-panel-warning rounded-[24px] px-4 py-3 text-center text-xs font-bold">
            {" "}
            {loadError}{" "}
          </section>
        ) : null}{" "}
        {!isLoading && !loadError && lastUpdated ? (
          <section className="rounded-[24px] border admin-panel-border ui-glass-03 p-4 text-center text-xs font-bold admin-text-subtle shadow-2xl backdrop-blur-2xl">
            {" "}
            آخر تحديث: {lastUpdated}{" "}
          </section>
        ) : null}{" "}
        <section className="grid gap-5 md:grid-cols-3">
          {" "}
          <StatCard
            title="كل الطلبات"
            value={requests.length}
            icon="🧠"
            subtitle="إجمالي طلباتك"
          />{" "}
          <StatCard
            title="قيد المراجعة"
            value={stats.pending}
            icon="⏳"
            subtitle="بانتظار رد الإدارة"
          />{" "}
          <StatCard
            title="تم الرد عليها"
            value={stats.withReply}
            icon="📩"
            subtitle="طلبات تحتوي على رد"
          />{" "}
        </section>{" "}
        <section className="rounded-[30px] border admin-panel-border ui-glass-045 p-4 shadow-2xl backdrop-blur-2xl md:p-5">
          {" "}
          <div className="flex flex-wrap gap-3">
            {" "}
            {[
              ["all", "كل الطلبات"],
              ["pending", "قيد المراجعة"],
              ["completed", "مكتملة"],
              ["reply", "يوجد رد"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-2xl border px-5 py-3 text-sm font-black transition ${filter === key ? "admin-panel-border admin-panel ui-public-seo-link-chip shadow-[0_0_25px_rgba(0,163,255,0.18)]" : "admin-panel-border admin-panel admin-text-muted hover:admin-panel-border hover:admin-panel"}`}
              >
                {" "}
                {label}{" "}
              </button>
            ))}{" "}
          </div>{" "}
        </section>{" "}
        {!isLoading && filteredRequests.length === 0 ? (
          <section className="rounded-[30px] border border-dashed admin-panel-border ui-glass-solid/[0.035] p-10 text-center shadow-2xl backdrop-blur-2xl">
            {" "}
            <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[28px] border admin-panel-border admin-panel text-4xl">
              📭
            </div>{" "}
            <h2 className="text-2xl font-black">لا توجد طلبات هنا</h2>{" "}
            <p className="ui-public-seo-subtitle mt-3">
              ابدأ بإرسال طلب تحليل جديد وسيظهر هنا مباشرة.
            </p>{" "}
            <Link
              href="/#analysis"
              className="mx-auto mt-6 inline-block rounded-2xl admin-panel px-6 py-4 font-black admin-text"
            >
              {" "}
              إرسال طلب الآن{" "}
            </Link>{" "}
          </section>
        ) : filteredRequests.length > 0 ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {" "}
            {filteredRequests.map((req) => (
              <article
                key={req.id}
                className="relative overflow-hidden rounded-[26px] border admin-panel-border ui-glass-045 p-4 shadow-[0_14px_42px_rgba(0,102,255,0.12)] backdrop-blur-2xl transition hover:admin-panel-border hover:shadow-[0_20px_55px_rgba(0,102,255,0.18)]"
              >
                {" "}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(34,211,238,0.12),transparent_30%)]" />{" "}
                <div className="relative z-10">
                  {" "}
                  <div className="flex items-start justify-between gap-3">
                    {" "}
                    <div>
                      {" "}
                      <div className="flex flex-wrap items-center gap-3">
                        {" "}
                        <h2 className="ui-public-seo-title ui-public-seo-title--card">
                          {req.coin}
                        </h2>{" "}
                        <StatusBadge
                          status={req.status}
                          variant="analysis"
                        />{" "}
                      </div>{" "}
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {" "}
                        <span className="rounded-full border admin-panel-border admin-panel px-4 py-2 admin-text-muted">
                          {" "}
                          الفريم:{" "}
                          <b className="admin-text-muted">{req.frame}</b>{" "}
                        </span>{" "}
                        <span className="rounded-full border admin-panel-border admin-panel px-4 py-2 admin-text-muted">
                          {" "}
                          التاريخ:{" "}
                          <b dir="ltr" className="admin-text-muted">
                            {req.createdAt}
                          </b>{" "}
                        </span>{" "}
                      </div>{" "}
                    </div>{" "}
                  </div>{" "}
                  {req.reply ? (
                    <div className="admin-banner-success mt-4 rounded-[22px] p-3">
                      {" "}
                      <div className="mb-3 flex items-center gap-3">
                        {" "}
                        <div className="grid h-10 w-10 place-items-center rounded-2xl border admin-panel-border admin-panel text-lg">
                          📩
                        </div>{" "}
                        <div>
                          {" "}
                          <h3 className="font-black admin-text-success">
                            ✅ وصل رد الإدارة
                          </h3>{" "}
                          <p className="text-xs admin-text-subtle">
                            تم إرسال الرد من فريق HasaN CharT
                          </p>{" "}
                        </div>{" "}
                      </div>{" "}
                      <p className="line-clamp-3 rounded-[18px] border admin-panel-border admin-panel p-3 text-right text-sm leading-7 admin-text-muted [overflow-wrap:anywhere]">
                        {" "}
                        {req.reply}{" "}
                      </p>{" "}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {" "}
                        <button
                          type="button"
                          onClick={() => openAnalysis(req)}
                          className="rounded-2xl border admin-panel-border admin-panel px-4 py-2 text-sm font-black ui-public-seo-link-chip transition hover:admin-panel"
                        >
                          {" "}
                          عرض التحليل{" "}
                        </button>{" "}
                        <Link
                          href="/#analysis"
                          className="rounded-2xl border admin-panel-border admin-panel px-4 py-2 text-sm font-black admin-text-muted transition hover:admin-panel-border hover:admin-panel"
                        >
                          {" "}
                          طلب جديد{" "}
                        </Link>{" "}
                      </div>{" "}
                    </div>
                  ) : (
                    <div className="mt-4 ui-panel-warning rounded-[22px] p-3">
                      {" "}
                      <div className="flex items-center gap-3">
                        {" "}
                        <div className="grid h-11 w-11 place-items-center rounded-2xl border admin-panel-border admin-panel text-xl">
                          ⏳
                        </div>{" "}
                        <div>
                          {" "}
                          <h3 className="font-black ui-panel-warning__title">
                            لم يتم إرسال الرد بعد
                          </h3>{" "}
                          <p className="mt-1 text-sm admin-text-subtle">
                            سيظهر رد الإدارة هنا فور إرساله.
                          </p>{" "}
                        </div>{" "}
                      </div>{" "}
                    </div>
                  )}{" "}
                </div>{" "}
              </article>
            ))}{" "}
          </section>
        ) : null}{" "}
      </div>{" "}
    </main>
  );
}
