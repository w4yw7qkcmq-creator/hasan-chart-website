"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminFetch } from "../lib/useAdminFetch";
import { AudienceOptionCards } from "../components/email-ops/AudienceOptionCards";
import { AudienceMetricGrid } from "../components/email-ops/EmailKpiCard";
import { ConfirmModal } from "../components/email-ops/ConfirmModal";
import {
  EmailAlertBanner,
  EmailFormField,
  EmailPrimaryButton,
  EmailTextArea,
  EmailTextInput,
} from "../components/email-ops/EmailFormField";
import { EmailOpsPageHeader } from "../components/email-ops/EmailOpsPageHeader";
import { EmailStepper } from "../components/email-ops/EmailStepper";
import { MarketingPolicyCard } from "../components/email-ops/MarketingPolicyCard";
import { WIZARD_STEPS } from "../components/email-ops/labels";
import { IconCheck, IconSend } from "../components/icons-ops";

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
  const [audienceLoading, setAudienceLoading] = useState(true);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewMode, setPreviewMode] = useState("desktop");
  const [testEmail, setTestEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("info");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState([]);
  const [showLaunchConfirm, setShowLaunchConfirm] = useState(false);
  const [showExclusions, setShowExclusions] = useState(false);

  const audienceFilter = useMemo(
    () => ({ userIds: form.selectedUserIds }),
    [form.selectedUserIds]
  );

  const notify = (text, tone = "info") => {
    setMessage(text);
    setMessageTone(tone);
  };

  const saveDraft = useCallback(async () => {
    setBusy(true);
    notify("");
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
      if (!data.success) throw new Error(data.error || "تعذر حفظ المسودة");
      setCampaignId(data.campaign.id);
      notify("تم حفظ المسودة", "success");
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
      if (!data.success) throw new Error(data.error || "تعذر تجهيز الجمهور");
      setStats(data.stats);
      notify("تم تجهيز الجمهور بنجاح", "success");
      setStep(1);
    } catch (err) {
      notify(err.message, "error");
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
    setAudienceLoading(true);
    void adminFetch("/api/admin/email-campaigns/audience-counts")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setAudienceCounts(data.counts);
      })
      .catch(() => {})
      .finally(() => setAudienceLoading(false));
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
      const id = campaignId || (await saveDraft());
      const res = await adminFetch(`/api/admin/email-campaigns/${id}/test-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientEmail: testEmail }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "تعذر إرسال النسخة التجريبية");
      notify("✓ تم إرسال النسخة التجريبية", "success");
    } catch (err) {
      notify(err.message, "error");
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
      if (!data.success) throw new Error(data.error || "تعذر بدء الحملة");
      notify(`تم إطلاق الحملة — ${data.queuedCount} مستلم في الطابور`, "success");
      setShowLaunchConfirm(false);
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <EmailOpsPageHeader
        eyebrow="مركز عمليات البريد"
        title="إرسال جماعي"
        description="أنشئ حملة تسويقية، جهّز الجمهور، وابدأ الإرسال بعد المراجعة."
        statusLabel="موافقة تسويقية مطلوبة"
        statusLevel="warning"
      />

      <EmailStepper steps={WIZARD_STEPS} currentStep={step} onStepClick={setStep} />

      {message ? <EmailAlertBanner tone={messageTone}>{message}</EmailAlertBanner> : null}

      {step === 0 ? (
        <section className="space-y-6 rounded-[28px] border border-slate-200/80 bg-white/95 p-5 dark:border-cyan-300/15 dark:bg-[#07142f]/60 md:p-7">
          <MarketingPolicyCard />

          <AudienceMetricGrid counts={audienceCounts} loading={audienceLoading} />

          <EmailFormField label="اسم الحملة" helper="اسم داخلي يساعدك على تمييز الحملة لاحقًا.">
            <EmailTextInput
              placeholder="مثال: تحديثات أغسطس 2026"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </EmailFormField>

          <div>
            <p className="mb-3 text-sm font-black text-slate-800 dark:text-slate-100">اختيار الجمهور</p>
            <AudienceOptionCards value={form.audienceType} onChange={(v) => setForm({ ...form, audienceType: v })} />
          </div>

          {form.audienceType === "selected_users" ? (
            <div className="space-y-3 rounded-[22px] border border-slate-200 p-4 dark:border-white/10">
              <EmailTextInput
                placeholder="بحث بالبريد أو اسم المستخدم"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                {form.selectedUserIds.map((id) => (
                  <span key={id} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold dark:border-white/10 dark:bg-white/5">
                    {id.slice(0, 8)}…
                  </span>
                ))}
              </div>
              <ul className="space-y-1 text-sm">
                {userResults.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      className="w-full rounded-xl px-3 py-2 text-right font-bold hover:bg-slate-50 dark:hover:bg-white/10"
                      onClick={() =>
                        setForm({ ...form, selectedUserIds: [...new Set([...form.selectedUserIds, u.id])] })
                      }
                    >
                      {u.email} · {u.username || "—"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <EmailPrimaryButton disabled={busy} onClick={prepareAudience}>
            {busy ? "جاري التجهيز..." : "تجهيز الجمهور"}
          </EmailPrimaryButton>

          {stats ? (
            <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-400/20 dark:bg-emerald-500/10">
              <div className="flex items-center gap-2">
                <IconCheck className="h-5 w-5 text-emerald-600" />
                <h3 className="font-black text-emerald-900 dark:text-emerald-100">الجمهور جاهز</h3>
              </div>
              <p className="mt-2 text-sm font-bold text-emerald-800 dark:text-emerald-200">
                {stats.eligible?.toLocaleString("ar")} مستخدم مؤهل
              </p>
              <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                مستبعدون: {stats.excluded?.toLocaleString("ar") ?? 0}
              </p>
              {stats.exclusionReasonLabels ? (
                <>
                  <button
                    type="button"
                    className="mt-3 text-xs font-bold text-emerald-800 underline dark:text-emerald-200"
                    onClick={() => setShowExclusions((v) => !v)}
                  >
                    {showExclusions ? "إخفاء تفاصيل الاستبعاد" : "عرض تفاصيل الاستبعاد"}
                  </button>
                  {showExclusions ? (
                    <ul className="mt-2 space-y-1 text-xs text-emerald-800 dark:text-emerald-200">
                      {Object.entries(stats.exclusionReasonLabels).map(([reason, info]) => (
                        <li key={reason} className="flex justify-between rounded-lg bg-white/60 px-3 py-2 dark:bg-black/20">
                          <span>{info.label}</span>
                          <strong>{info.count}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {step === 1 ? (
        <section className="space-y-5 rounded-[28px] border border-slate-200/80 bg-white/95 p-5 dark:border-cyan-300/15 dark:bg-[#07142f]/60 md:p-7">
          <div className="rounded-[24px] border border-slate-200 p-5 dark:border-white/10">
            <h3 className="mb-4 font-black">محرر الرسالة</h3>
            <div className="space-y-4">
              <EmailFormField label="عنوان البريد" counter maxLength={120} valueLength={form.subject.length}>
                <EmailTextInput value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              </EmailFormField>
              <EmailFormField label="النص التمهيدي" helper="يظهر بجانب الموضوع في صندوق الوارد." counter maxLength={160} valueLength={form.previewText.length}>
                <EmailTextInput value={form.previewText} onChange={(e) => setForm({ ...form, previewText: e.target.value })} />
              </EmailFormField>
              <EmailFormField label="محتوى الرسالة (HTML)">
                <EmailTextArea
                  className="min-h-[240px] font-mono"
                  value={form.htmlContent}
                  onChange={(e) => setForm({ ...form, htmlContent: e.target.value })}
                />
              </EmailFormField>
            </div>
          </div>
          <EmailPrimaryButton
            disabled={busy}
            onClick={async () => {
              await saveDraft();
              setStep(2);
            }}
          >
            حفظ والمعاينة
          </EmailPrimaryButton>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-[28px] border border-slate-200/80 bg-white/95 p-5 dark:border-cyan-300/15 dark:bg-[#07142f]/60">
            <div className="mb-4 flex items-center gap-2">
              {["desktop", "mobile"].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPreviewMode(mode)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black ${
                    previewMode === mode
                      ? "bg-cyan-600 text-white"
                      : "border border-slate-200 dark:border-white/10"
                  }`}
                >
                  {mode === "desktop" ? "سطح المكتب" : "الجوال"}
                </button>
              ))}
            </div>
            <div className={`mx-auto overflow-hidden rounded-[22px] border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-black/30 ${previewMode === "mobile" ? "max-w-sm" : "w-full"}`}>
              <div className="border-b border-slate-200 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-[#0a1628]">
                <p className="font-black">{form.subject || "بدون موضوع"}</p>
                <p className="text-xs text-slate-500">{form.previewText || "—"}</p>
                <p className="mt-1 text-xs text-slate-400">HasaN CharT World</p>
              </div>
              <iframe title="preview" className="h-[420px] w-full bg-white" srcDoc={previewHtml} />
            </div>
          </div>

          <div className="space-y-4 rounded-[28px] border border-slate-200/80 bg-white/95 p-5 dark:border-cyan-300/15 dark:bg-[#07142f]/60">
            <h3 className="font-black">إرسال نسخة تجريبية</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">لن يغيّر هذا محتوى الحملة أو الجمهور.</p>
            <EmailFormField label="البريد المستهدف">
              <EmailTextInput value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@example.com" />
            </EmailFormField>
            <EmailPrimaryButton disabled={busy || !testEmail} onClick={sendTest}>
              <IconSend className="h-4 w-4" />
              إرسال نسخة تجريبية
            </EmailPrimaryButton>
            <EmailPrimaryButton variant="secondary" onClick={() => setStep(3)}>
              متابعة للتأكيد
            </EmailPrimaryButton>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[24px] border border-slate-200 p-5 dark:border-white/10">
              <h3 className="font-black">الرسالة</h3>
              <p className="mt-2 text-sm font-bold">{form.subject}</p>
              <p className="mt-1 text-xs text-slate-500">{form.previewText}</p>
            </div>
            <div className="rounded-[24px] border border-slate-200 p-5 dark:border-white/10">
              <h3 className="font-black">الجمهور</h3>
              <p className="mt-2 text-2xl font-black text-cyan-700 dark:text-cyan-300">
                {stats?.eligible?.toLocaleString("ar") ?? "—"}
              </p>
              <p className="text-xs text-slate-500">مستخدم مؤهل</p>
            </div>
            <div className="rounded-[24px] border border-slate-200 p-5 dark:border-white/10">
              <h3 className="font-black">الاستبعادات</h3>
              <p className="mt-2 text-2xl font-black">{stats?.excluded?.toLocaleString("ar") ?? 0}</p>
            </div>
            <div className="rounded-[24px] border border-cyan-200 bg-cyan-50/50 p-5 dark:border-cyan-400/20 dark:bg-cyan-500/10">
              <h3 className="font-black">سياسة الإرسال</h3>
              <p className="mt-2 text-sm">موافقة تسويقية مفعّلة — لن يُرسل إلا للمؤهلين.</p>
            </div>
          </div>

          <EmailAlertBanner tone="warning">
            بعد بدء الإرسال لن تتمكن من تعديل محتوى هذه الحملة.
          </EmailAlertBanner>

          <div className="flex flex-wrap gap-3">
            <EmailPrimaryButton variant="secondary" onClick={() => setStep(1)}>
              العودة للتعديل
            </EmailPrimaryButton>
            <EmailPrimaryButton disabled={busy || !campaignId} onClick={() => setShowLaunchConfirm(true)}>
              بدء الحملة
            </EmailPrimaryButton>
            {campaignId ? (
              <Link href={`/admin/email-analytics/campaigns/${campaignId}`} className="inline-flex items-center text-sm font-bold text-cyan-600">
                عرض تفاصيل الحملة
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      <ConfirmModal
        open={showLaunchConfirm}
        title="هل تريد بدء الحملة؟"
        description={`ستتم إضافة ${stats?.eligible ?? 0} رسالة إلى نظام الإرسال.`}
        confirmLabel="نعم، ابدأ الحملة"
        cancelLabel="إلغاء"
        danger
        busy={busy}
        onCancel={() => setShowLaunchConfirm(false)}
        onConfirm={launch}
      />
    </div>
  );
}
