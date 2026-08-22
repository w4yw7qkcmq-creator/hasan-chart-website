"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAdminFetch } from "../lib/useAdminFetch";

const STEPS = ["الجمهور", "الرسالة", "المعاينة", "التأكيد"];

export default function EmailComposePage() {
  const adminFetch = useAdminFetch();
  const [step, setStep] = useState(0);
  const [campaignId, setCampaignId] = useState("");
  const [form, setForm] = useState({
    name: "",
    subject: "",
    previewText: "",
    htmlContent: "<p>مرحبًا،</p><p>نود مشاركتك آخر تحديثات HasaN CharT World.</p>",
    audienceType: "all_eligible",
    selectedUserIds: [],
  });
  const [stats, setStats] = useState(null);
  const [audienceCounts, setAudienceCounts] = useState(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState([]);

  const audienceFilter = useMemo(
    () => ({ userIds: form.selectedUserIds }),
    [form.selectedUserIds]
  );

  const saveDraft = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      const payload = {
        name: form.name,
        subject: form.subject,
        previewText: form.previewText,
        htmlContent: form.htmlContent,
        audienceType: form.audienceType,
        audienceFilter,
      };

      const res = await adminFetch(
        campaignId ? `/api/admin/email-campaigns/${campaignId}` : "/api/admin/email-campaigns",
        {
          method: campaignId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Save failed");
      setCampaignId(data.campaign.id);
      setMessage("تم حفظ المسودة");
      return data.campaign.id;
    } finally {
      setBusy(false);
    }
  }, [adminFetch, audienceFilter, campaignId, form]);

  const prepareAudience = useCallback(async () => {
    const id = campaignId || (await saveDraft());
    setBusy(true);
    try {
      const res = await adminFetch(`/api/admin/email-campaigns/${id}/audience`, { method: "POST" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Audience failed");
      setStats(data.stats);
      setMessage("تم تجهيز الجمهور");
      setStep(1);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }, [adminFetch, campaignId, saveDraft]);

  const loadPreview = useCallback(async () => {
    if (!campaignId) return;
    const res = await adminFetch(`/api/admin/email-campaigns/${campaignId}/preview`);
    const data = await res.json();
    if (data.success) setPreviewHtml(data.preview.html);
  }, [adminFetch, campaignId]);

  useEffect(() => {
    if (step === 2 && campaignId) loadPreview();
  }, [step, campaignId, loadPreview]);

  useEffect(() => {
    void adminFetch("/api/admin/email-campaigns/audience-counts")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setAudienceCounts(data.counts);
      })
      .catch(() => {});
  }, [adminFetch]);

  useEffect(() => {
    if (form.audienceType !== "selected_users" || userQuery.length < 2) {
      setUserResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await adminFetch(`/api/admin/email-campaigns/audience-search?q=${encodeURIComponent(userQuery)}`);
      const data = await res.json();
      if (data.success) setUserResults(data.rows || []);
    }, 300);
    return () => clearTimeout(t);
  }, [adminFetch, form.audienceType, userQuery]);

  const sendTest = async () => {
    setBusy(true);
    try {
      await saveDraft();
      const res = await adminFetch(`/api/admin/email-campaigns/${campaignId}/test-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientEmail: testEmail }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Test failed");
      setMessage("تم إرسال رسالة تجريبية إلى الطابور");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const launch = async () => {
    setBusy(true);
    try {
      const res = await adminFetch(`/api/admin/email-campaigns/${campaignId}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Launch failed");
      setMessage(`تم إطلاق الحملة — ${data.queuedCount} مستلم في الطابور`);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="rounded-[34px] border border-slate-200 bg-white p-6 shadow-lg dark:border-cyan-300/15 dark:bg-[#07142f]/80">
      <h1 className="text-2xl font-black">إرسال جماعي</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(index)}
            className={`rounded-xl px-3 py-1 text-sm font-bold ${step === index ? "bg-cyan-500 text-white" : "bg-slate-100 dark:bg-white/10"}`}
          >
            {index + 1}. {label}
          </button>
        ))}
      </div>

      {message ? <p className="mt-4 rounded-xl bg-cyan-50 p-3 text-sm dark:bg-cyan-400/10">{message}</p> : null}

      {step === 0 ? (
        <section className="mt-6 space-y-4">
          <div className="rounded-2xl border border-cyan-200/30 bg-cyan-50/50 p-4 text-sm dark:bg-cyan-400/5">
            <p className="font-black text-cyan-800 dark:text-cyan-200">تصنيف الحملة: تسويق (Marketing)</p>
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              الإرسال الجماعي يتطلب موافقة تسويقية صريحة — لا يمكن تجاوز consent عبر transactional.
            </p>
          </div>

          {audienceCounts ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {[
                ["إجمالي الحسابات", audienceCounts.totalAccounts],
                ["موافقون على التسويق", audienceCounts.marketingOptedIn],
                ["لم يوافقوا أبداً", audienceCounts.neverOptedIn],
                ["ألغوا الاشتراك", audienceCounts.marketingOptedOut],
                ["Hard suppressed", audienceCounts.hardSuppressed],
                ["مؤهلون للحملة", audienceCounts.campaignEligible],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border p-3">
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className="text-xl font-black">{value ?? 0}</div>
                </div>
              ))}
            </div>
          ) : null}

          <input className="w-full rounded-2xl border p-3" placeholder="اسم الحملة" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="w-full rounded-2xl border p-3" value={form.audienceType} onChange={(e) => setForm({ ...form, audienceType: e.target.value })}>
            <option value="all_eligible">جميع المستخدمين المؤهلين</option>
            <option value="active_subscribers">مشتركون فعالون</option>
            <option value="non_subscribers">غير مشتركين</option>
            <option value="selected_users">مستخدمون محددون</option>
          </select>
          {form.audienceType === "selected_users" ? (
            <div className="space-y-2">
              <input className="w-full rounded-2xl border p-3" placeholder="بحث بالبريد أو اسم المستخدم" value={userQuery} onChange={(e) => setUserQuery(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                {form.selectedUserIds.map((id) => (
                  <span key={id} className="rounded-full bg-slate-100 px-3 py-1 text-xs dark:bg-white/10">{id.slice(0, 8)}…</span>
                ))}
              </div>
              <ul className="space-y-1 text-sm">
                {userResults.map((u) => (
                  <li key={u.id}>
                    <button type="button" className="rounded-lg px-2 py-1 hover:bg-slate-100 dark:hover:bg-white/10" onClick={() => setForm({ ...form, selectedUserIds: [...new Set([...form.selectedUserIds, u.id])] })}>
                      {u.email} · {u.username || "—"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <button type="button" disabled={busy} className="rounded-2xl bg-cyan-600 px-5 py-3 font-black text-white" onClick={prepareAudience}>
            تجهيز الجمهور
          </button>
          {stats ? (
            <div className="space-y-3 rounded-2xl border p-4 text-sm">
              <p><strong>مؤهلون:</strong> {stats.eligible}</p>
              <p><strong>مستبعدون:</strong> {stats.excluded}</p>
              {stats.exclusionReasonLabels ? (
                <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  {Object.entries(stats.exclusionReasonLabels).map(([reason, info]) => (
                    <li key={reason}>{info.label}: {info.count}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {step === 1 ? (
        <section className="mt-6 space-y-4">
          <input className="w-full rounded-2xl border p-3" placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <input className="w-full rounded-2xl border p-3" placeholder="Preview text" value={form.previewText} onChange={(e) => setForm({ ...form, previewText: e.target.value })} />
          <textarea className="min-h-[220px] w-full rounded-2xl border p-3 font-mono text-sm" value={form.htmlContent} onChange={(e) => setForm({ ...form, htmlContent: e.target.value })} />
          <button type="button" disabled={busy} className="rounded-2xl bg-slate-900 px-5 py-3 font-black text-white dark:bg-cyan-500" onClick={async () => { await saveDraft(); setStep(2); }}>
            حفظ والمعاينة
          </button>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border p-4">
            <h2 className="font-black">Desktop / Mobile Preview</h2>
            <iframe title="preview" className="mt-3 h-[420px] w-full rounded-xl bg-white" srcDoc={previewHtml} />
          </div>
          <div className="space-y-3">
            <input className="w-full rounded-2xl border p-3" placeholder="Test recipient email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
            <button type="button" disabled={busy} className="rounded-2xl border px-5 py-3 font-black" onClick={sendTest}>إرسال رسالة تجريبية</button>
            <button type="button" className="rounded-2xl bg-cyan-600 px-5 py-3 font-black text-white" onClick={() => setStep(3)}>متابعة للتأكيد</button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="mt-6 space-y-4">
          <div className="rounded-2xl border p-4 text-sm">
            <p><strong>الحملة:</strong> {form.name}</p>
            <p><strong>Subject:</strong> {form.subject}</p>
            <p><strong>Eligible:</strong> {stats?.eligible ?? "—"}</p>
            <p><strong>Excluded:</strong> {stats?.excluded ?? "—"}</p>
          </div>
          <p className="text-sm text-amber-700 dark:text-amber-200">تأكيد صريح مطلوب — لن يُرسل لجميع المستخدمين في canary E2.</p>
          <button type="button" disabled={busy} className="rounded-2xl bg-red-600 px-5 py-3 font-black text-white" onClick={launch}>
            Launch Campaign (Confirmed)
          </button>
          {campaignId ? (
            <Link href={`/admin/email-analytics/campaigns/${campaignId}`} className="inline-block text-cyan-600 underline">
              عرض تفاصيل الحملة
            </Link>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
