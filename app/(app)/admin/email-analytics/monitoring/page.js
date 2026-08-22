"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminFetch } from "../lib/useAdminFetch";
import { useVisibilityRefresh } from "../../../../hooks/useVisibilityRefresh";

export default function EmailMonitoringPage() {
  const adminFetch = useAdminFetch();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const res = await adminFetch("/api/admin/email-outbox?limit=5000");
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed");
      setMetrics(data.metrics);
    } catch (err) {
      setError(err.message || "تعذر تحميل الطابور");
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => {
    load();
  }, [load]);

  useVisibilityRefresh(load, 20000);

  const counts = metrics?.counts || {};

  return (
    <main className="rounded-[34px] border border-slate-200 bg-white p-6 shadow-lg dark:border-cyan-300/15 dark:bg-[#07142f]/80">
      <h1 className="text-2xl font-black">مراقبة الإرسال</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">حالة طابور email_outbox — تحديث كل 20 ثانية.</p>

      {loading ? <p className="mt-6">جاري التحميل...</p> : null}
      {error ? <p className="mt-6 text-red-500">{error}</p> : null}

      {metrics ? (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            ["pending", counts.pending],
            ["processing", counts.processing],
            ["accepted", counts.accepted],
            ["sent", counts.sent],
            ["failed", counts.failed],
            ["skipped", counts.skipped],
            ["uncertain", counts.uncertain],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 p-4 dark:border-cyan-300/15">
              <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
              <div className="mt-2 text-2xl font-black">{value ?? 0}</div>
            </div>
          ))}
        </div>
      ) : null}

      {metrics?.recentFailures?.length ? (
        <section className="mt-8">
          <h2 className="text-lg font-black">أحدث الأخطاء</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {metrics.recentFailures.slice(0, 10).map((row) => (
              <li key={row.id} className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                {row.message_type || "general"} · {row.recipient_email} · {row.error || row.status}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
