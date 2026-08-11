"use client";

import { useCallback, useMemo, useState } from "react";
import { adminFetch } from "../../../lib/admin-fetch";
import { formatPartnerMoney } from "../../../lib/partner-shared";

const STEPS = [
  { id: "info", label: "المعلومات" },
  { id: "audience", label: "الجمهور" },
  { id: "duration", label: "المدة" },
  { id: "missions", label: "المهمات" },
  { id: "rewards", label: "المكافآت" },
  { id: "review", label: "المراجعة" },
  { id: "publish", label: "النشر" },
];

const AUDIENCE_MODES = [
  { value: "all", label: "جميع الشركاء" },
  { value: "tier_min", label: "حد أدنى للمستوى" },
  { value: "selected_partners", label: "شركاء محددون" },
];

const MISSION_TYPES = [
  { value: "qualified_referrals_count", label: "إحالات مؤهلة" },
  { value: "customers_count", label: "عملاء" },
  { value: "revenue_amount", label: "إيراد" },
  { value: "first_customer", label: "أول عميل" },
  { value: "conversion_rate", label: "معدل تحويل" },
];

const EMPTY_MISSION = {
  code: "",
  name_ar: "",
  mission_type: "qualified_referrals_count",
  target_metric: "qualified_referrals",
  target_value: 1,
  reward_amount: 10,
  reward_currency: "USD",
};

export const EMPTY_CAMPAIGN_WIZARD = {
  code: "",
  name_ar: "",
  description: "",
  landing_path: "/register",
  audience_mode: "all",
  min_tier_key: "",
  partner_ids: "",
  start_at: "",
  end_at: "",
  missions: [{ ...EMPTY_MISSION }],
  reward: { mode: "fixed_percent", percent: 10, stacking_allowed: false },
  max_exposure_usd: "",
  allowed_sources: "",
  allowed_mediums: "",
  publish_mode: "draft",
};

function Field({ label, children, hint }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-neutral-400">{label}</span>
      {children}
      {hint ? <span className="text-neutral-500 text-xs">{hint}</span> : null}
    </label>
  );
}

function stepErrors(step, state) {
  const errors = [];
  if (step === "info") {
    if (!state.code?.trim()) errors.push("رمز الحملة مطلوب");
    if (!state.name_ar?.trim()) errors.push("الاسم بالعربية مطلوب");
    if (!state.landing_path?.trim()?.startsWith("/")) errors.push("مسار الهبوط يجب أن يبدأ بـ /");
  }
  if (step === "audience") {
    if (state.audience_mode === "tier_min" && !state.min_tier_key?.trim()) {
      errors.push("حدد المستوى الأدنى");
    }
    if (state.audience_mode === "selected_partners" && !state.partner_ids?.trim()) {
      errors.push("أدخل معرفات الشركاء (مفصولة بفاصلة)");
    }
  }
  if (step === "duration") {
    if (!state.start_at) errors.push("تاريخ البداية مطلوب");
    if (!state.end_at) errors.push("تاريخ الانتهاء مطلوب");
    if (state.start_at && state.end_at && new Date(state.end_at) <= new Date(state.start_at)) {
      errors.push("تاريخ الانتهاء يجب أن يكون بعد البداية");
    }
  }
  if (step === "missions") {
    if (!state.missions?.length) errors.push("أضف مهمة واحدة على الأقل");
    state.missions?.forEach((m, i) => {
      if (!m.code?.trim()) errors.push(`مهمة ${i + 1}: الرمز مطلوب`);
      if (!m.name_ar?.trim()) errors.push(`مهمة ${i + 1}: الاسم مطلوب`);
      if (Number(m.target_value) <= 0) errors.push(`مهمة ${i + 1}: الهدف يجب أن يكون أكبر من صفر`);
    });
  }
  if (step === "rewards") {
    if (state.reward?.mode === "fixed_percent") {
      const pct = Number(state.reward.percent);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) errors.push("نسبة العمولة غير صالحة (0–100)");
    }
  }
  return errors;
}

function buildPayload(state, { schedule = false, activate = false } = {}) {
  const partnerIds =
    state.audience_mode === "selected_partners"
      ? state.partner_ids
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  return {
    wizard: true,
    code: state.code.trim(),
    name_ar: state.name_ar.trim(),
    description: state.description?.trim() || "",
    landing_path: state.landing_path.trim() || "/register",
    audience_mode: state.audience_mode,
    min_tier_key: state.audience_mode === "tier_min" ? state.min_tier_key.trim() : null,
    partner_ids: partnerIds,
    start_at: state.start_at ? new Date(state.start_at).toISOString() : null,
    end_at: state.end_at ? new Date(state.end_at).toISOString() : null,
    allowed_sources: state.allowed_sources
      ? state.allowed_sources.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    allowed_mediums: state.allowed_mediums
      ? state.allowed_mediums.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    max_exposure_usd: state.max_exposure_usd !== "" ? Number(state.max_exposure_usd) : null,
    reward: state.reward,
    missions: (state.missions || []).map((m) => ({
      ...m,
      code: m.code.trim(),
      name_ar: m.name_ar.trim(),
      target_value: Number(m.target_value),
      reward_amount: Number(m.reward_amount),
    })),
    scheduled: schedule,
    lifecycle: schedule ? "scheduled" : activate ? "active" : "draft",
  };
}

export default function AdminCampaignMissionWizard({ open, onClose, onSaved, initialDraft = null }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [state, setState] = useState(initialDraft || EMPTY_CAMPAIGN_WIZARD);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const step = STEPS[stepIdx]?.id;
  const errors = useMemo(() => stepErrors(step, state), [step, state]);

  const totalMissionRewards = useMemo(
    () => (state.missions || []).reduce((s, m) => s + Number(m.reward_amount || 0), 0),
    [state.missions]
  );

  const estimatedExposure = useMemo(() => {
    const max = state.max_exposure_usd !== "" ? Number(state.max_exposure_usd) : null;
    return max != null && Number.isFinite(max) ? max : totalMissionRewards * 100;
  }, [state.max_exposure_usd, totalMissionRewards]);

  const resetWizard = useCallback(() => {
    setStepIdx(0);
    setState(initialDraft || EMPTY_CAMPAIGN_WIZARD);
    setPreview(null);
    setError("");
  }, [initialDraft]);

  const handleClose = () => {
    resetWizard();
    onClose?.();
  };

  const runPreview = async () => {
    const payload = buildPayload(state);
    const res = await adminFetch("/api/admin/partner-marketing/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType: "campaign",
        input: {
          ...payload,
          name: payload.name_ar,
          partner_eligibility:
            payload.audience_mode === "all"
              ? { mode: "all" }
              : payload.audience_mode === "tier_min"
                ? { mode: "tier_min" }
                : { mode: "selected_partners", partner_ids: payload.partner_ids },
        },
      }),
    });
    const json = await res.json();
    if (json.success) setPreview(json.preview);
    else setError(json.error || "تعذر المعاينة");
  };

  const goNext = async () => {
    if (errors.length) {
      setError(errors[0]);
      return;
    }
    setError("");
    if (step === "review") await runPreview();
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setError("");
    setStepIdx((i) => Math.max(i - 1, 0));
  };

  const submit = async ({ schedule = false, activate = false } = {}) => {
    for (const s of STEPS.slice(0, -1)) {
      const stepErrs = stepErrors(s.id, state);
      if (stepErrs.length) {
        setError(stepErrs[0]);
        setStepIdx(STEPS.findIndex((x) => x.id === s.id));
        return;
      }
    }

    if (activate && estimatedExposure >= 5000) {
      if (
        !window.confirm(
          `تحذير: التعرض الأقصى المقدّر ${formatPartnerMoney(estimatedExposure)} — هل تريد النشر/التفعيل؟`
        )
      ) {
        return;
      }
    }

    setSaving(true);
    setError("");
    try {
      const payload = buildPayload(state, { schedule, activate });
      const res = await adminFetch("/api/admin/partner-marketing/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "تعذر الحفظ");

      const campaignId = json.campaign?.id;
      if (campaignId && (schedule || activate)) {
        const action = schedule ? "schedule" : "activate";
        const patchRes = await adminFetch("/api/admin/partner-marketing/campaigns", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: campaignId,
            action,
            expected_updated_at: json.campaign.updated_at,
          }),
        });
        const patchJson = await patchRes.json();
        if (!patchJson.success) throw new Error(patchJson.error || "تعذر تنفيذ الإجراء");
      }

      onSaved?.(json);
      handleClose();
    } catch (e) {
      setError(e.message || "خطأ");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="pa-wizard-overlay" dir="rtl">
      <div className="pa-wizard">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">معالج حملة ومهمات — Round 9</h2>
            <p className="text-neutral-400 text-sm">7 خطوات — بدون إعادة تحميل الصفحة</p>
          </div>
          <button type="button" className="pa-btn pa-btn--secondary" onClick={handleClose}>
            إغلاق
          </button>
        </header>

        <nav className="pa-wizard-stepper" aria-label="خطوات معالج الحملة">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`pa-wizard-step ${i === stepIdx ? "pa-wizard-step--active" : i < stepIdx ? "pa-wizard-step--done" : ""}`}
            >
              <button
                type="button"
                className="pa-wizard-step__circle"
                onClick={() => {
                  if (i <= stepIdx) setStepIdx(i);
                }}
              >
                {i + 1}
              </button>
              <span className="pa-wizard-step__label">{s.label}</span>
            </div>
          ))}
        </nav>
        <div className="pa-surface space-y-4">

        {error ? <p className="text-red-400 text-sm">{error}</p> : null}

        {step === "info" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="رمز الحملة *">
              <input className="pa-input w-full" value={state.code} onChange={(e) => setState({ ...state, code: e.target.value })} />
            </Field>
            <Field label="الاسم بالعربية (name_ar) *">
              <input className="pa-input w-full" value={state.name_ar} onChange={(e) => setState({ ...state, name_ar: e.target.value })} />
            </Field>
            <Field label="مسار الهبوط">
              <input className="pa-input w-full" value={state.landing_path} onChange={(e) => setState({ ...state, landing_path: e.target.value })} />
            </Field>
            <Field label="الوصف" hint="يظهر للشركاء">
              <textarea className="pa-input w-full" value={state.description} onChange={(e) => setState({ ...state, description: e.target.value })} />
            </Field>
          </div>
        ) : null}

        {step === "audience" ? (
          <div className="space-y-4">
            <Field label="وضع الجمهور">
              <select
                className="pa-input w-full"
                value={state.audience_mode}
                onChange={(e) => setState({ ...state, audience_mode: e.target.value })}
              >
                {AUDIENCE_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </Field>
            {state.audience_mode === "tier_min" ? (
              <Field label="المستوى الأدنى (min_tier_key)">
                <input className="pa-input w-full" value={state.min_tier_key} onChange={(e) => setState({ ...state, min_tier_key: e.target.value })} placeholder="partner" />
              </Field>
            ) : null}
            {state.audience_mode === "selected_partners" ? (
              <Field label="معرفات الشركاء (UUID مفصولة بفاصلة)">
                <textarea className="pa-input w-full" value={state.partner_ids} onChange={(e) => setState({ ...state, partner_ids: e.target.value })} />
              </Field>
            ) : null}
          </div>
        ) : null}

        {step === "duration" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="تاريخ البداية *">
              <input type="datetime-local" className="pa-input w-full" value={state.start_at} onChange={(e) => setState({ ...state, start_at: e.target.value })} />
            </Field>
            <Field label="تاريخ الانتهاء *">
              <input type="datetime-local" className="pa-input w-full" value={state.end_at} onChange={(e) => setState({ ...state, end_at: e.target.value })} />
            </Field>
            <Field label="مصادر مسموحة (اختياري)" hint="مفصولة بفاصلة">
              <input className="pa-input w-full" value={state.allowed_sources} onChange={(e) => setState({ ...state, allowed_sources: e.target.value })} />
            </Field>
            <Field label="وسائط مسموحة (اختياري)">
              <input className="pa-input w-full" value={state.allowed_mediums} onChange={(e) => setState({ ...state, allowed_mediums: e.target.value })} />
            </Field>
          </div>
        ) : null}

        {step === "missions" ? (
          <div className="space-y-4">
            {(state.missions || []).map((m, idx) => (
              <div key={idx} className="admin-panel border border-neutral-700 p-4 space-y-2">
                <div className="flex justify-between">
                  <h4 className="font-medium">مهمة {idx + 1}</h4>
                  {state.missions.length > 1 ? (
                    <button
                      type="button"
                      className="admin-btn admin-btn--sm admin-btn--secondary"
                      onClick={() => setState({ ...state, missions: state.missions.filter((_, i) => i !== idx) })}
                    >
                      حذف
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <Field label="الرمز">
                    <input className="pa-input w-full" value={m.code} onChange={(e) => {
                      const missions = [...state.missions];
                      missions[idx] = { ...m, code: e.target.value };
                      setState({ ...state, missions });
                    }} />
                  </Field>
                  <Field label="الاسم بالعربية">
                    <input className="pa-input w-full" value={m.name_ar} onChange={(e) => {
                      const missions = [...state.missions];
                      missions[idx] = { ...m, name_ar: e.target.value };
                      setState({ ...state, missions });
                    }} />
                  </Field>
                  <Field label="النوع">
                    <select className="pa-input w-full" value={m.mission_type} onChange={(e) => {
                      const missions = [...state.missions];
                      missions[idx] = { ...m, mission_type: e.target.value };
                      setState({ ...state, missions });
                    }}>
                      {MISSION_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="الهدف">
                    <input type="number" className="pa-input w-full" value={m.target_value} onChange={(e) => {
                      const missions = [...state.missions];
                      missions[idx] = { ...m, target_value: Number(e.target.value) };
                      setState({ ...state, missions });
                    }} />
                  </Field>
                  <Field label="مكافأة المهمة (USD)">
                    <input type="number" className="pa-input w-full" value={m.reward_amount} onChange={(e) => {
                      const missions = [...state.missions];
                      missions[idx] = { ...m, reward_amount: Number(e.target.value) };
                      setState({ ...state, missions });
                    }} />
                  </Field>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="pa-btn pa-btn--secondary"
              onClick={() => setState({ ...state, missions: [...state.missions, { ...EMPTY_MISSION, code: `${state.code || "M"}_${state.missions.length + 1}` }] })}
            >
              + إضافة مهمة
            </button>
          </div>
        ) : null}

        {step === "rewards" ? (
          <div className="space-y-4">
            <Field label="تجاوز عمولة الحملة">
              <select
                className="pa-input w-full"
                value={state.reward.mode}
                onChange={(e) => setState({ ...state, reward: { ...state.reward, mode: e.target.value } })}
              >
                <option value="fixed_percent">نسبة ثابتة</option>
                <option value="none">بدون تجاوز</option>
              </select>
            </Field>
            {state.reward.mode === "fixed_percent" ? (
              <Field label="النسبة %">
                <input
                  type="number"
                  className="admin-input w-full max-w-xs"
                  value={state.reward.percent}
                  onChange={(e) => setState({ ...state, reward: { ...state.reward, percent: Number(e.target.value) } })}
                />
              </Field>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(state.reward.stacking_allowed)}
                onChange={(e) => setState({ ...state, reward: { ...state.reward, stacking_allowed: e.target.checked } })}
              />
              السماح بتكديس المكافآت مع مهام أخرى
            </label>
            {state.reward.stacking_allowed ? (
              <p className="text-amber-400 text-sm">
                ⚠ تحذير تكديس: قد يحصل الشريك على مكافآت متعددة لنفس الحدث — راجع التكلفة قبل النشر.
              </p>
            ) : null}
            <Field label="الحد الأقصى للتعرض (USD) — اختياري">
              <input
                type="number"
                className="admin-input w-full max-w-xs"
                value={state.max_exposure_usd}
                onChange={(e) => setState({ ...state, max_exposure_usd: e.target.value })}
              />
            </Field>
            <p className="text-neutral-400 text-sm">
              إجمالي مكافآت المهمات: {formatPartnerMoney(totalMissionRewards)}
            </p>
          </div>
        ) : null}

        {step === "review" ? (
          <div className="space-y-3 text-sm">
            <p><strong>الاسم:</strong> {state.name_ar}</p>
            <p><strong>الرمز:</strong> {state.code}</p>
            <p><strong>الجمهور:</strong> {AUDIENCE_MODES.find((a) => a.value === state.audience_mode)?.label}</p>
            <p><strong>المدة:</strong> {state.start_at || "—"} → {state.end_at || "—"}</p>
            <p><strong>المهمات:</strong> {state.missions?.length || 0}</p>
            <p><strong>مكافآت المهمات:</strong> {formatPartnerMoney(totalMissionRewards)}</p>
            {preview?.preview ? (
              <pre className="whitespace-pre-wrap text-xs bg-neutral-900 p-3 rounded">{JSON.stringify(preview.preview, null, 2)}</pre>
            ) : null}
            {(preview?.warnings || []).map((w) => (
              <p key={w.code} className="text-amber-400">⚠ {w.message}</p>
            ))}
          </div>
        ) : null}

        {step === "publish" ? (
          <div className="space-y-4">
            {estimatedExposure >= 5000 ? (
              <p className="text-amber-400 border border-amber-500/40 p-3 rounded text-sm">
                ⚠ تحذير التعرض الأقصى: التكلفة المقدّرة {formatPartnerMoney(estimatedExposure)} — تأكد من الموافقة قبل التفعيل.
              </p>
            ) : null}
            <p className="text-neutral-400 text-sm">اختر كيفية حفظ الحملة:</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="pa-btn pa-btn--secondary" disabled={saving} onClick={() => void submit({ schedule: false, activate: false })}>
                حفظ كمسودة
              </button>
              <button type="button" className="pa-btn pa-btn--secondary" disabled={saving} onClick={() => void submit({ schedule: true })}>
                جدولة
              </button>
              <button type="button" className="pa-btn pa-btn--primary" disabled={saving} onClick={() => void submit({ activate: true })}>
                {saving ? "جاري النشر..." : "نشر وتفعيل"}
              </button>
            </div>
          </div>
        ) : null}

        </div>
        <footer className="pa-wizard-footer">
          <button type="button" className="pa-btn pa-btn--secondary" disabled={stepIdx === 0} onClick={goBack}>
            السابق
          </button>
          {step !== "publish" ? (
            <button type="button" className="pa-btn pa-btn--primary" onClick={() => void goNext()}>
              التالي
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

export { STEPS, stepErrors, buildPayload };
