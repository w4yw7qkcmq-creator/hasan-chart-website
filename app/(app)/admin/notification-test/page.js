"use client";
import { UiPageShell } from "../../../components/ui";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "../../../../lib/admin-fetch";
function ResultBadge({ ok, label }) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${ok ? "admin-email-status-success" : "admin-panel admin-text-muted"}`}
    >
      {" "}
      {label}{" "}
    </span>
  );
}
function summarizeResult(result) {
  if (!result) return null;
  const inApp = Boolean(result.notificationCreated);
  const pushSent = (result.pushResult?.sent || 0) > 0;
  const emailSent = Boolean(
    result.emailResult?.sent || result.emailResult?.success,
  );
  return {
    inApp,
    pushSent,
    emailSent,
    testId: result.testId || null,
    delivery: result.delivery || null,
    pushResult: result.pushResult || null,
    emailResult: result.emailResult || null,
  };
}
export default function NotificationTestCenterPage() {
  const [types, setTypes] = useState([]);
  const [targetEmail, setTargetEmail] = useState("");
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [runningType, setRunningType] = useState("");
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState(null);
  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    setError("");
    try {
      const response = await adminFetch("/api/admin/notification-test", {
        method: "GET",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "تعذر تحميل مركز الاختبار.");
      }
      setTypes(payload.types || []);
      setTargetEmail(payload.defaultRecipient || "");
    } catch (err) {
      setError(err?.message || "تعذر تحميل مركز الاختبار.");
    } finally {
      setLoadingMeta(false);
    }
  }, []);
  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);
  const summary = useMemo(() => summarizeResult(lastResult), [lastResult]);
  const runTest = async (type) => {
    if (runningType) return;
    setRunningType(type);
    setError("");
    setLastResult(null);
    try {
      const response = await adminFetch("/api/admin/notification-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, targetEmail }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "فشل تنفيذ الاختبار.");
      }
      setLastResult(payload.result || null);
    } catch (err) {
      setError(err?.message || "فشل تنفيذ الاختبار.");
    } finally {
      setRunningType("");
    }
  };
  return (
    <div className="relative min-h-screen overflow-hidden ui-page-dark admin-text-muted">
      {" "}
      <div className="ui-public-seo-page__backdrop pointer-events-none absolute inset-0" />{" "}
      <div className="relative z-10 mx-auto max-w-6xl space-y-6 p-4 md:p-8">
        {" "}
        <div className="flex flex-wrap items-center justify-between gap-4">
          {" "}
          <div>
            {" "}
            <Link
              href="/admin"
              className="inline-flex rounded-full border admin-panel-border admin-panel px-4 py-2 text-xs font-black ui-public-seo-link-chip transition hover:admin-panel"
            >
              {" "}
              ← العودة إلى لوحة الإدارة{" "}
            </Link>{" "}
            <h1 className="mt-5 text-4xl font-black admin-text">
              Notification Test Center
            </h1>{" "}
            <p className="mt-3 max-w-3xl text-sm leading-7 admin-text-muted">
              {" "}
              يرسل كل زر إشعاراً حقيقياً عبر دوال الإنتاج الحالية (Notification
              Center + Push + Email) مع بيانات اختبار واضحة. لا يوجد مسار إرسال
              وهمي أو منفصل.{" "}
            </p>{" "}
          </div>{" "}
        </div>{" "}
        <section className="rounded-[28px] border admin-panel-border ui-glass-045 p-6 shadow-2xl backdrop-blur-2xl">
          {" "}
          <label
            className="block text-sm font-black ui-public-seo-link-chip"
            htmlFor="target-email"
          >
            {" "}
            بريد المستلم للاختبار{" "}
          </label>{" "}
          <p className="mt-2 text-xs font-bold admin-text-subtle">
            {" "}
            يُفضّل استخدام بريدك الشخصي المسجّل في الموقع لاختبار Toast و Hub و
            Push.{" "}
          </p>{" "}
          <input
            id="target-email"
            type="email"
            dir="ltr"
            value={targetEmail}
            onChange={(event) =>
              setTargetEmail(event.target.value.trim().toLowerCase())
            }
            className="mt-4 w-full rounded-2xl border admin-panel-border ui-glass-solid px-4 py-3 font-bold admin-text outline-none"
            placeholder="user@example.com"
          />{" "}
        </section>{" "}
        {error && (
          <div className="admin-banner-danger px-4 py-3 text-sm font-black">
            {" "}
            {error}{" "}
          </div>
        )}{" "}
        <section className="grid gap-4 md:grid-cols-2">
          {" "}
          {loadingMeta ? (
            <div className="rounded-[28px] border admin-panel-border ui-glass-045 p-8 text-center text-sm font-bold admin-text-muted md:col-span-2">
              {" "}
              جاري تحميل أنواع الاختبار...{" "}
            </div>
          ) : (
            types.map((item) => (
              <article
                key={item.id}
                className="rounded-[28px] border admin-panel-border ui-glass-045 p-6 shadow-2xl backdrop-blur-2xl"
              >
                {" "}
                <div className="flex items-start justify-between gap-4">
                  {" "}
                  <div>
                    {" "}
                    <p className="text-xs font-black uppercase tracking-[0.18em] admin-text-muted">
                      {" "}
                      Production Path{" "}
                    </p>{" "}
                    <h2 className="mt-2 ui-public-seo-title ui-public-seo-title--card">
                      {" "}
                      {item.icon} {item.label}{" "}
                    </h2>{" "}
                    <p className="mt-3 text-sm font-bold admin-text-muted">
                      {item.description}
                    </p>{" "}
                  </div>{" "}
                </div>{" "}
                <button
                  type="button"
                  disabled={Boolean(runningType) || !targetEmail}
                  onClick={() => runTest(item.id)}
                  className="mt-6 w-full rounded-2xl admin-panel px-5 py-3 text-sm font-black admin-text shadow-[0_14px_38px_rgba(37,99,235,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {" "}
                  {runningType === item.id
                    ? "جاري الإرسال..."
                    : `اختبار ${item.label}`}{" "}
                </button>{" "}
              </article>
            ))
          )}{" "}
        </section>{" "}
        {summary && (
          <section className="admin-banner-success rounded-[28px] p-6 shadow-2xl">
            {" "}
            <h3 className="ui-public-seo-title ui-public-seo-title--card text-xl">
              نتيجة آخر اختبار
            </h3>{" "}
            <p className="mt-2 text-sm font-bold admin-text-success">
              {" "}
              testId: <span dir="ltr">{summary.testId || "—"}</span>{" "}
            </p>{" "}
            <div className="mt-4 flex flex-wrap gap-2">
              {" "}
              <ResultBadge
                ok={summary.inApp}
                label={summary.inApp ? "In-App ✓" : "In-App ✗"}
              />{" "}
              <ResultBadge
                ok={summary.pushSent}
                label={summary.pushSent ? "Push ✓" : "Push ✗"}
              />{" "}
              <ResultBadge
                ok={summary.emailSent}
                label={summary.emailSent ? "Email ✓" : "Email ✗"}
              />{" "}
            </div>{" "}
            <pre className="mt-4 overflow-x-auto rounded-2xl border admin-panel-border admin-panel p-4 text-xs admin-text-success">
              {" "}
              {JSON.stringify(lastResult, null, 2)}{" "}
            </pre>{" "}
          </section>
        )}{" "}
      </div>{" "}
    </div>
  );
}
