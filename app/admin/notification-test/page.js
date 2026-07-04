"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "../../../lib/admin-fetch";

function ResultBadge({ ok, label }) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-slate-50 text-slate-600"
      }`}
    >
      {label}
    </span>
  );
}

function summarizeResult(result) {
  if (!result) return null;

  const inApp = Boolean(result.notificationCreated);
  const pushSent = (result.pushResult?.sent || 0) > 0;
  const emailSent = Boolean(result.emailResult?.sent || result.emailResult?.success);

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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type,
          targetEmail,
        }),
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
    <div className="relative min-h-screen overflow-hidden bg-[#020617] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(0,102,255,0.35),transparent_30%),radial-gradient(circle_at_86%_35%,rgba(34,211,238,0.16),transparent_30%),linear-gradient(135deg,#020617,#07142f_48%,#030712)]" />

      <div className="relative z-10 mx-auto max-w-6xl space-y-6 p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              href="/admin"
              className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-400/20"
            >
              ← العودة إلى لوحة الإدارة
            </Link>
            <h1 className="mt-5 text-4xl font-black text-white">Notification Test Center</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              يرسل كل زر إشعاراً حقيقياً عبر دوال الإنتاج الحالية (Notification Center + Push + Email)
              مع بيانات اختبار واضحة. لا يوجد مسار إرسال وهمي أو منفصل.
            </p>
          </div>
        </div>

        <section className="rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-6 shadow-2xl backdrop-blur-2xl">
          <label className="block text-sm font-black text-cyan-100" htmlFor="target-email">
            بريد المستلم للاختبار
          </label>
          <p className="mt-2 text-xs font-bold text-slate-400">
            يُفضّل استخدام بريدك الشخصي المسجّل في الموقع لاختبار Toast و Hub و Push.
          </p>
          <input
            id="target-email"
            type="email"
            dir="ltr"
            value={targetEmail}
            onChange={(event) => setTargetEmail(event.target.value.trim().toLowerCase())}
            className="mt-4 w-full rounded-2xl border border-cyan-200 bg-white px-4 py-3 font-bold text-slate-950 outline-none"
            placeholder="user@example.com"
          />
        </section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-800">
            {error}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2">
          {loadingMeta ? (
            <div className="rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-8 text-center text-sm font-bold text-slate-300 md:col-span-2">
              جاري تحميل أنواع الاختبار...
            </div>
          ) : (
            types.map((item) => (
              <article
                key={item.id}
                className="rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-6 shadow-2xl backdrop-blur-2xl"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
                      Production Path
                    </p>
                    <h2 className="mt-2 text-2xl font-black text-white">
                      {item.icon} {item.label}
                    </h2>
                    <p className="mt-3 text-sm font-bold text-slate-300">{item.description}</p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={Boolean(runningType) || !targetEmail}
                  onClick={() => runTest(item.id)}
                  className="mt-6 w-full rounded-2xl bg-gradient-to-l from-blue-700 via-blue-600 to-cyan-500 px-5 py-3 text-sm font-black text-white shadow-[0_14px_38px_rgba(37,99,235,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {runningType === item.id ? "جاري الإرسال..." : `اختبار ${item.label}`}
                </button>
              </article>
            ))
          )}
        </section>

        {summary && (
          <section className="rounded-[28px] border border-emerald-300/20 bg-emerald-500/10 p-6 shadow-2xl">
            <h3 className="text-xl font-black text-white">نتيجة آخر اختبار</h3>
            <p className="mt-2 text-sm font-bold text-emerald-100">
              testId: <span dir="ltr">{summary.testId || "—"}</span>
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <ResultBadge ok={summary.inApp} label={summary.inApp ? "In-App ✓" : "In-App ✗"} />
              <ResultBadge
                ok={summary.pushSent}
                label={summary.pushSent ? "Push ✓" : "Push ✗"}
              />
              <ResultBadge
                ok={summary.emailSent}
                label={summary.emailSent ? "Email ✓" : "Email ✗"}
              />
            </div>

            <pre className="mt-4 overflow-x-auto rounded-2xl border border-emerald-300/20 bg-black/30 p-4 text-xs text-emerald-50">
              {JSON.stringify(lastResult, null, 2)}
            </pre>
          </section>
        )}
      </div>
    </div>
  );
}
