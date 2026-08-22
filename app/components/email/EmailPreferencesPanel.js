"use client";

import { useCallback, useEffect, useState } from "react";

export default function EmailPreferencesPanel({ compact = false }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/user/email-preferences", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "تعذر تحميل التفضيلات");
      setMarketingOptIn(data.preferences?.marketingOptIn === true);
    } catch (err) {
      setError(err.message || "تعذر تحميل تفضيلات البريد");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (nextValue) => {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/user/email-preferences", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketingOptIn: nextValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "تعذر حفظ التفضيلات");
      setMarketingOptIn(data.preferences?.marketingOptIn === true);
      setMessage(nextValue ? "تم تفعيل رسائل العروض والتحديثات." : "تم إيقاف رسائل التسويق.");
    } catch (err) {
      setError(err.message || "تعذر حفظ التفضيلات");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const wrapperClass = compact
    ? "rounded-2xl border border-cyan-300/15 bg-black/20 p-4"
    : "user-dashboard-panel";

  return (
    <section className={wrapperClass}>
      {!compact ? (
        <div className="user-dashboard-panel__header">
          <div>
            <h2 className="user-dashboard-panel__title">تفضيلات البريد الإلكتروني</h2>
            <p className="user-dashboard-panel__subtitle">تحكم في رسائل الحساب والعروض التسويقية</p>
          </div>
        </div>
      ) : (
        <h3 className="text-sm font-black text-cyan-200">تفضيلات البريد الإلكتروني</h3>
      )}

      <div className={compact ? "mt-3 space-y-3" : "user-dashboard-panel__body space-y-4"}>
        {loading ? (
          <p className="text-sm text-slate-400">جاري تحميل التفضيلات...</p>
        ) : (
          <>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-bold text-white">رسائل الخدمة والحساب</p>
                  <p className="mt-1 text-sm text-slate-400">
                    رسائل ضرورية مرتبطة بحسابك وخدماتك — مفعّلة دائماً للأمان والتشغيل.
                  </p>
                </div>
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300">
                  مفعّلة
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-bold text-white">الأخبار والتحديثات والعروض</p>
                  <p className="mt-1 text-sm text-slate-400">
                    استلام الرسائل التسويقية عبر البريد — يمكنك تشغيلها أو إيقافها في أي وقت.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={marketingOptIn}
                  disabled={saving}
                  onClick={() => save(!marketingOptIn)}
                  className={`relative h-8 w-14 shrink-0 rounded-full transition ${
                    marketingOptIn ? "bg-cyan-500" : "bg-slate-600"
                  } ${saving ? "opacity-60" : ""}`}
                >
                  <span
                    className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${
                      marketingOptIn ? "right-1" : "left-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
          </>
        )}
      </div>
    </section>
  );
}
