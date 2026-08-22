"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAdminFetch } from "../lib/useAdminFetch";

export default function CampaignsListPage() {
  const adminFetch = useAdminFetch();
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const q = status === "all" ? "" : `&status=${encodeURIComponent(status)}`;
    const res = await adminFetch(`/api/admin/email-campaigns?page=1&pageSize=50${q}`);
    const data = await res.json();
    if (data.success) setRows(data.rows || []);
    setLoading(false);
  }, [adminFetch, status]);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (id, action) => {
    await adminFetch(`/api/admin/email-campaigns/${id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    load();
  };

  return (
    <main className="rounded-[34px] border border-slate-200 bg-white p-6 shadow-lg dark:border-cyan-300/15 dark:bg-[#07142f]/80">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">الحملات</h1>
        <select className="rounded-xl border p-2" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">كل الحالات</option>
          <option value="draft">draft</option>
          <option value="ready">ready</option>
          <option value="sending">sending</option>
          <option value="paused">paused</option>
          <option value="completed">completed</option>
          <option value="cancelled">cancelled</option>
        </select>
      </div>

      {loading ? <p className="mt-6">جاري التحميل...</p> : null}

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-right">
              <th className="p-3">الاسم</th>
              <th className="p-3">الحالة</th>
              <th className="p-3">Eligible</th>
              <th className="p-3">Delivered</th>
              <th className="p-3">Failed</th>
              <th className="p-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 dark:border-white/10">
                <td className="p-3">
                  <Link href={`/admin/email-analytics/campaigns/${row.id}`} className="font-bold text-cyan-600 hover:underline">
                    {row.name}
                  </Link>
                </td>
                <td className="p-3">{row.status}</td>
                <td className="p-3">{row.eligible_count}</td>
                <td className="p-3">{row.delivered_count}</td>
                <td className="p-3">{row.failed_count}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    {row.status === "sending" ? (
                      <button type="button" className="rounded-lg border px-2 py-1" onClick={() => runAction(row.id, "pause")}>Pause</button>
                    ) : null}
                    {row.status === "paused" ? (
                      <button type="button" className="rounded-lg border px-2 py-1" onClick={() => runAction(row.id, "resume")}>Resume</button>
                    ) : null}
                    {["draft", "ready", "sending", "paused"].includes(row.status) ? (
                      <button type="button" className="rounded-lg border px-2 py-1" onClick={() => runAction(row.id, "cancel")}>Cancel</button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
