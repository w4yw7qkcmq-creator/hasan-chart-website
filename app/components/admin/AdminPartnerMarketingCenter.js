"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "../../../lib/admin-fetch";
import { formatPartnerMoney } from "../../../lib/partner-shared";
import { campaignStatusLabel } from "../../../lib/partner-center/ui-labels";
import AdminCampaignMissionWizard from "./AdminCampaignMissionWizard";

const SECTIONS = [
  { id: "overview", label: "نظرة عامة" },
  { id: "missions", label: "المهام" },
  { id: "campaigns", label: "الحملات" },
  { id: "levels", label: "المستويات" },
  { id: "milestones", label: "المعالم" },
  { id: "bonuses", label: "مكافآت الأداء" },
  { id: "qualified-reward", label: "مكافأة المستخدم المؤهل" },
  { id: "service-commissions", label: "عمولات الخدمات" },
  { id: "rewards", label: "المكافآت" },
  { id: "fraud", label: "مراجعة المخاطر" },
  { id: "audit", label: "التدقيق" },
];

const MISSION_TYPES = [
  "qualified_referrals_count",
  "customers_count",
  "revenue_amount",
  "first_customer",
  "conversion_rate",
];

const EMPTY_MISSION = {
  code: "",
  name: "",
  description: "",
  mission_type: "qualified_referrals_count",
  target_metric: "qualified_referrals",
  target_value: 1,
  reward_amount: 10,
  reward_currency: "USD",
  period_type: "once",
  minimum_sample_size: 0,
  status: "draft",
};

const CAMPAIGN_BUCKETS = [
  { id: "active", label: "نشطة" },
  { id: "scheduled", label: "مجدولة" },
  { id: "paused", label: "متوقفة" },
  { id: "completed", label: "مكتملة" },
];

const CAMPAIGN_ACTION_LABELS = {
  schedule: "جدولة",
  activate: "تفعيل",
  pause: "إيقاف",
  resume: "استئناف",
  complete: "إكمال",
  cancel: "إلغاء",
  delete_draft: "حذف المسودة",
};

function Field({ label, children }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-neutral-400">{label}</span>
      {children}
    </label>
  );
}

function PreviewPanel({ preview, warnings }) {
  if (!preview) return null;
  return (
    <div className="admin-panel mt-4 space-y-2 border border-amber-500/30 p-4">
      <h4 className="font-semibold">معاينة قبل الحفظ</h4>
      <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(preview, null, 2)}</pre>
      {(warnings || []).map((w) => (
        <p key={w.code} className="text-amber-400 text-sm">
          ⚠ {w.message}
        </p>
      ))}
    </div>
  );
}

export default function AdminPartnerMarketingCenter({
  embedded = false,
  forcedSection = null,
} = {}) {
  const [section, setSection] = useState(forcedSection || "overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState(null);
  const [missions, setMissions] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [bonuses, setBonuses] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [fraudQueue, setFraudQueue] = useState([]);
  const [audit, setAudit] = useState([]);
  const [missionForm, setMissionForm] = useState(EMPTY_MISSION);
  const [campaignForm, setCampaignForm] = useState({
    code: "",
    name: "",
    description: "",
    landing_path: "/",
    allowed_sources: [],
    allowed_mediums: [],
    status: "draft",
  });
  const [campaignBucket, setCampaignBucket] = useState("active");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [missionPreview, setMissionPreview] = useState(null);
  const [campaignPreview, setCampaignPreview] = useState(null);
  const [fraudReason, setFraudReason] = useState("");
  const [selectedEntitlement, setSelectedEntitlement] = useState(null);
  const [qrrPolicy, setQrrPolicy] = useState(null);
  const [qrrAmount, setQrrAmount] = useState("");
  const [qrrEnabled, setQrrEnabled] = useState(false);
  const [qrrSaving, setQrrSaving] = useState(false);
  const [scPolicy, setScPolicy] = useState(null);
  const [scEdit, setScEdit] = useState(null);
  const [scSaving, setScSaving] = useState(false);

  const activeSection = forcedSection || section;

  useEffect(() => {
    if (forcedSection) setSection(forcedSection);
  }, [forcedSection]);

  const loadSection = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (activeSection === "overview") {
        const res = await adminFetch("/api/admin/partner-marketing/overview");
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setOverview(json.overview);
      }
      if (activeSection === "missions" || activeSection === "campaigns") {
        const missionsRes = await adminFetch("/api/admin/partner-marketing/missions");
        const missionsJson = await missionsRes.json();
        if (!missionsJson.success) throw new Error(missionsJson.error);
        setMissions(missionsJson.missions || []);
      }
      if (activeSection === "campaigns") {
        const res = await adminFetch("/api/admin/partner-marketing/campaigns?metrics=1");
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setCampaigns(json.campaigns || []);
      }
      if (activeSection === "levels" || activeSection === "commissions-bundle") {
        const res = await adminFetch("/api/admin/partner-marketing/levels");
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setTiers(json.tiers || []);
      }
      if (activeSection === "milestones") {
        const res = await adminFetch("/api/admin/partner-marketing/milestones");
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setMilestones(json.milestones || []);
      }
      if (activeSection === "bonuses") {
        const res = await adminFetch("/api/admin/partner-marketing/performance-bonuses");
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setBonuses(json.rules || []);
      }
      if (activeSection === "qualified-reward" || activeSection === "commissions-bundle") {
        const res = await adminFetch("/api/admin/partner-marketing/qualified-referral-reward");
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setQrrPolicy(json.policy);
        setQrrAmount(String(json.policy?.current?.amount ?? ""));
        setQrrEnabled(Boolean(json.policy?.current?.isEnabled));
      }
      if (activeSection === "service-commissions" || activeSection === "commissions-bundle") {
        const res = await adminFetch("/api/admin/partner-marketing/service-commissions");
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setScPolicy(json.policy);
        setScEdit(null);
      }
      if (activeSection === "rewards") {
        const res = await adminFetch("/api/admin/partner-marketing/rewards");
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setRewards(json.rows || []);
      }
      if (activeSection === "fraud") {
        const res = await adminFetch("/api/admin/partner-marketing/fraud-review");
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setFraudQueue(json.rows || []);
      }
      if (activeSection === "audit") {
        const res = await adminFetch("/api/admin/partner-marketing/audit");
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setAudit(json.rows || []);
      }
    } catch (e) {
      setError(e.message || "خطأ");
    } finally {
      setLoading(false);
    }
  }, [activeSection]);

  useEffect(() => {
    void loadSection();
  }, [loadSection]);

  const previewMission = async () => {
    const res = await adminFetch("/api/admin/partner-marketing/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType: "mission", input: missionForm }),
    });
    const json = await res.json();
    if (json.success) setMissionPreview(json.preview);
    else alert(json.error);
  };

  const saveMission = async () => {
    const res = await adminFetch("/api/admin/partner-marketing/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(missionForm),
    });
    const json = await res.json();
    if (!json.success) alert(json.error);
    else {
      setMissionForm(EMPTY_MISSION);
      setMissionPreview(null);
      void loadSection();
    }
  };

  const previewCampaign = async () => {
    const res = await adminFetch("/api/admin/partner-marketing/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType: "campaign", input: campaignForm }),
    });
    const json = await res.json();
    if (json.success) setCampaignPreview(json.preview);
    else alert(json.error);
  };

  const saveCampaign = async () => {
    const res = await adminFetch("/api/admin/partner-marketing/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(campaignForm),
    });
    const json = await res.json();
    if (!json.success) alert(json.error);
    else {
      setCampaignForm({
        code: "",
        name: "",
        description: "",
        landing_path: "/",
        allowed_sources: [],
        allowed_mediums: [],
        status: "draft",
      });
      setCampaignPreview(null);
      void loadSection();
    }
  };

  const runCampaignAction = async (campaign, action) => {
    const label = CAMPAIGN_ACTION_LABELS[action] || action;
    if (!window.confirm(`تأكيد: ${label} — "${campaign.displayNameAr || campaign.name}"؟`)) return;
    const res = await adminFetch("/api/admin/partner-marketing/campaigns", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: campaign.id,
        action,
        expected_updated_at: campaign.updated_at,
      }),
    });
    const json = await res.json();
    if (!json.success) alert(json.error || "تعذر تنفيذ الإجراء");
    else void loadSection();
  };

  const campaignsByBucket = useMemo(() => {
    const grouped = { active: [], scheduled: [], paused: [], completed: [], draft: [] };
    for (const c of campaigns) {
      const bucket = c.dashboardBucket || (c.status === "ended" ? "completed" : c.status);
      if (grouped[bucket]) grouped[bucket].push(c);
      else grouped.draft.push(c);
    }
    return grouped;
  }, [campaigns]);

  const visibleCampaigns = campaignsByBucket[campaignBucket] || [];

  const saveQualifiedReward = async () => {
    const currentAmount = qrrPolicy?.current?.amount;
    const nextAmount = Number(qrrAmount);
    if (
      Number.isFinite(currentAmount) &&
      Number.isFinite(nextAmount) &&
      nextAmount >= currentAmount * 2 &&
      !window.confirm(
        `هل تريد تغيير المكافأة من ${formatPartnerMoney(currentAmount)} إلى ${formatPartnerMoney(nextAmount)}؟`
      )
    ) {
      return;
    }
    setQrrSaving(true);
    try {
      const res = await adminFetch("/api/admin/partner-marketing/qualified-referral-reward", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: qrrAmount, isEnabled: qrrEnabled }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      void loadSection();
    } catch (e) {
      alert(e.message || "خطأ");
    } finally {
      setQrrSaving(false);
    }
  };

  const startEditServiceRule = (service) => {
    setScEdit({
      serviceType: service.serviceType,
      displayNameAr: service.displayNameAr,
      isEnabled: service.isEnabled,
      tierPolicy: service.tierPolicy,
      commissionPercent: String(service.commissionPercent ?? ""),
      releasePolicy: service.releasePolicy,
    });
  };

  const saveServiceCommissionRule = async () => {
    if (!scEdit?.serviceType) return;
    const current = scPolicy?.services?.find((s) => s.serviceType === scEdit.serviceType);
    if (
      current &&
      Number(scEdit.commissionPercent) >= Number(current.commissionPercent || 0) * 2 &&
      !window.confirm(
        `تأكيد: تغيير نسبة ${scEdit.displayNameAr} من ${current.commissionPercent}% إلى ${scEdit.commissionPercent}%`
      )
    ) {
      return;
    }
    setScSaving(true);
    try {
      const res = await adminFetch("/api/admin/partner-marketing/service-commissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceType: scEdit.serviceType,
          isEnabled: scEdit.isEnabled,
          tierPolicy: scEdit.tierPolicy,
          commissionPercent: scEdit.commissionPercent,
          releasePolicy: scEdit.releasePolicy,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setScEdit(null);
      void loadSection();
    } catch (e) {
      alert(e.message || "خطأ");
    } finally {
      setScSaving(false);
    }
  };

  const setMissionStatus = async (id, status) => {
    const res = await adminFetch("/api/admin/partner-marketing/missions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const json = await res.json();
    if (!json.success) alert(json.error);
    else void loadSection();
  };

  const createMissionVersion = async (id) => {
    const reward = prompt("مكافأة الإصدار الجديد:");
    if (reward == null) return;
    const res = await adminFetch("/api/admin/partner-marketing/missions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "create_version", reward_amount: Number(reward) }),
    });
    const json = await res.json();
    if (!json.success) alert(json.error);
    else void loadSection();
  };

  const fraudAction = async (action) => {
    if (!selectedEntitlement || !fraudReason.trim()) {
      alert("اختر عنصراً واكتب السبب");
      return;
    }
    const res = await adminFetch("/api/admin/partner-marketing/fraud-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, entitlementId: selectedEntitlement, reason: fraudReason }),
    });
    const json = await res.json();
    if (!json.success) alert(json.error);
    else {
      setFraudReason("");
      setSelectedEntitlement(null);
      void loadSection();
    }
  };

  const sectionTitle = useMemo(() => SECTIONS.find((s) => s.id === activeSection)?.label, [activeSection]);

  const showQualifiedReward =
    activeSection === "qualified-reward" || activeSection === "commissions-bundle";
  const showServiceCommissions =
    activeSection === "service-commissions" || activeSection === "commissions-bundle";
  const showTierLevels =
    activeSection === "levels" || activeSection === "commissions-bundle";

  return (
    <div className="admin-page space-y-6" dir="rtl">
      {!embedded ? (
        <>
          <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="admin-eyebrow">Partner Center Phase 3</p>
          <h1 className="admin-page-title">مركز التسويق — الشركاء</h1>
          <p className="admin-page-subtitle">CRUD كامل — مهام، حملات، مستويات، معالم، مراجعة مخاطر</p>
        </div>
        <Link href="/admin/partners" className="admin-btn admin-btn--secondary">
          ← إدارة برنامج الشركاء
        </Link>
      </header>

      <nav className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`admin-tab ${section === s.id ? "admin-tab--active" : ""}`}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>
        </>
      ) : null}

      {error ? <p className="text-red-400">{error}</p> : null}
      {loading ? <p>جاري التحميل...</p> : null}

      {!loading && activeSection === "overview" && overview ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["شركاء نشطون", overview.activePartners],
            ["مهام نشطة", overview.activeMissions],
            ["حملات نشطة", overview.activeCampaigns],
            ["مكافآت معلقة", formatPartnerMoney(overview.pendingRewardsTotal)],
            ["قيد المراجعة", formatPartnerMoney(overview.heldRewardsTotal)],
          ].map(([title, value]) => (
            <div key={title} className="admin-stat-card">
              <p className="admin-stat-card__title">{title}</p>
              <h3 className="admin-stat-card__value">{value}</h3>
            </div>
          ))}
        </div>
      ) : null}

      {!loading && activeSection === "missions" ? (
        <div className="space-y-6">
          <div className="admin-panel grid gap-3 md:grid-cols-2">
            <Field label="الرمز">
              <input className="admin-input w-full" value={missionForm.code} onChange={(e) => setMissionForm({ ...missionForm, code: e.target.value })} />
            </Field>
            <Field label="الاسم">
              <input className="admin-input w-full" value={missionForm.name} onChange={(e) => setMissionForm({ ...missionForm, name: e.target.value })} />
            </Field>
            <Field label="النوع">
              <select className="admin-input w-full" value={missionForm.mission_type} onChange={(e) => setMissionForm({ ...missionForm, mission_type: e.target.value })}>
                {MISSION_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="الهدف">
              <input type="number" className="admin-input w-full" value={missionForm.target_value} onChange={(e) => setMissionForm({ ...missionForm, target_value: Number(e.target.value) })} />
            </Field>
            <Field label="المكافأة">
              <input type="number" className="admin-input w-full" value={missionForm.reward_amount} onChange={(e) => setMissionForm({ ...missionForm, reward_amount: Number(e.target.value) })} />
            </Field>
            <Field label="الوصف">
              <textarea className="admin-input w-full" value={missionForm.description} onChange={(e) => setMissionForm({ ...missionForm, description: e.target.value })} />
            </Field>
            <div className="flex gap-2 md:col-span-2">
              <button type="button" className="admin-btn admin-btn--secondary" onClick={() => void previewMission()}>معاينة</button>
              <button type="button" className="admin-btn admin-btn--primary" onClick={() => void saveMission()}>إنشاء مسودة</button>
            </div>
            <PreviewPanel preview={missionPreview?.preview} warnings={missionPreview?.warnings} />
          </div>
          <table className="admin-table w-full">
            <thead>
              <tr><th>الاسم</th><th>v</th><th>الهدف</th><th>المكافأة</th><th>الحالة</th><th>إجراءات</th></tr>
            </thead>
            <tbody>
              {missions.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.rule_version}</td>
                  <td>{m.target_value}</td>
                  <td>{formatPartnerMoney(m.reward_amount)}</td>
                  <td>{m.status}</td>
                  <td className="space-x-1">
                    {m.status === "draft" ? <button type="button" className="admin-btn admin-btn--sm" onClick={() => void setMissionStatus(m.id, "active")}>تفعيل</button> : null}
                    {m.status === "active" ? <button type="button" className="admin-btn admin-btn--sm" onClick={() => void setMissionStatus(m.id, "paused")}>إيقاف</button> : null}
                    <button type="button" className="admin-btn admin-btn--sm admin-btn--secondary" onClick={() => void createMissionVersion(m.id)}>إصدار جديد</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && activeSection === "campaigns" ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {CAMPAIGN_BUCKETS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`admin-tab ${campaignBucket === b.id ? "admin-tab--active" : ""}`}
                  onClick={() => setCampaignBucket(b.id)}
                >
                  {b.label} ({campaignsByBucket[b.id]?.length || 0})
                </button>
              ))}
            </div>
            <button type="button" className="admin-btn admin-btn--primary" onClick={() => setWizardOpen(true)}>
              + إنشاء حملة
            </button>
          </div>

          {!visibleCampaigns.length ? (
            <p className="text-neutral-400">لا توجد حملات في هذا القسم.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {visibleCampaigns.map((c) => (
                <article key={c.id} className="admin-panel space-y-2 p-4">
                  <div className="flex justify-between gap-2">
                    <h3 className="font-semibold">{c.displayNameAr || c.name}</h3>
                    <span className="text-xs text-neutral-400">v{c.rule_version}</span>
                  </div>
                  <p className="text-neutral-400 text-sm">{c.code} — {c.landing_path}</p>
                  <p className="text-sm">الحالة: {campaignStatusLabel(c.status, { lifecycle: c.tracking_metadata?.lifecycle })}</p>
                  {c.metrics ? (
                    <div className="grid grid-cols-2 gap-2 text-xs text-neutral-300">
                      <span>مشاركون: {c.metrics.participants}</span>
                      <span>مهمات مكتملة: {c.metrics.missionsCompleted}</span>
                      <span>مكافآت معلقة: {formatPartnerMoney(c.metrics.rewardsPending)}</span>
                      <span>مكافآت مضافة: {formatPartnerMoney(c.metrics.rewardsCredited)}</span>
                      <span>تكلفة تقديرية: {formatPartnerMoney(c.metrics.estimatedMissionCost)}</span>
                      {c.metrics.maxExposureUsd != null ? (
                        <span>حد التعرض: {formatPartnerMoney(c.metrics.maxExposureUsd)}</span>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-1 pt-2">
                    {c.status === "draft" && c.tracking_metadata?.lifecycle !== "scheduled" ? (
                      <>
                        <button type="button" className="admin-btn admin-btn--sm" onClick={() => setWizardOpen(true)}>تعديل مسودة</button>
                        <button type="button" className="admin-btn admin-btn--sm" onClick={() => void runCampaignAction(c, "schedule")}>جدولة</button>
                        <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" onClick={() => void runCampaignAction(c, "activate")}>تفعيل</button>
                        <button type="button" className="admin-btn admin-btn--sm admin-btn--secondary" onClick={() => void runCampaignAction(c, "delete_draft")}>حذف</button>
                      </>
                    ) : null}
                    {c.tracking_metadata?.lifecycle === "scheduled" || (c.status === "draft" && c.tracking_metadata?.scheduled) ? (
                      <>
                        <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" onClick={() => void runCampaignAction(c, "activate")}>تفعيل</button>
                        <button type="button" className="admin-btn admin-btn--sm admin-btn--secondary" onClick={() => void runCampaignAction(c, "cancel")}>إلغاء</button>
                      </>
                    ) : null}
                    {c.status === "active" ? (
                      <>
                        <button type="button" className="admin-btn admin-btn--sm" onClick={() => void runCampaignAction(c, "pause")}>إيقاف</button>
                        <button type="button" className="admin-btn admin-btn--sm admin-btn--secondary" onClick={() => void runCampaignAction(c, "complete")}>إكمال</button>
                      </>
                    ) : null}
                    {c.status === "paused" ? (
                      <>
                        <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" onClick={() => void runCampaignAction(c, "resume")}>استئناف</button>
                        <button type="button" className="admin-btn admin-btn--sm admin-btn--secondary" onClick={() => void runCampaignAction(c, "complete")}>إكمال</button>
                      </>
                    ) : null}
                    {c.status === "ended" ? (
                      <button type="button" className="admin-btn admin-btn--sm admin-btn--secondary" onClick={() => void runCampaignAction(c, "cancel")}>أرشفة/إلغاء</button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}

          <details className="admin-panel p-4">
            <summary className="cursor-pointer font-medium">إنشاء سريع (النموذج القديم)</summary>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field label="الرمز"><input className="admin-input w-full" value={campaignForm.code} onChange={(e) => setCampaignForm({ ...campaignForm, code: e.target.value })} /></Field>
              <Field label="الاسم"><input className="admin-input w-full" value={campaignForm.name} onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })} /></Field>
              <Field label="مسار الهبوط"><input className="admin-input w-full" value={campaignForm.landing_path} onChange={(e) => setCampaignForm({ ...campaignForm, landing_path: e.target.value })} /></Field>
              <div className="flex gap-2 md:col-span-2">
                <button type="button" className="admin-btn admin-btn--secondary" onClick={() => void previewCampaign()}>معاينة</button>
                <button type="button" className="admin-btn admin-btn--primary" onClick={() => void saveCampaign()}>إنشاء مسودة</button>
              </div>
              <PreviewPanel preview={campaignPreview?.preview} warnings={campaignPreview?.warnings} />
            </div>
          </details>

          <AdminCampaignMissionWizard
            open={wizardOpen}
            onClose={() => setWizardOpen(false)}
            onSaved={() => void loadSection()}
          />
        </div>
      ) : null}

      {!loading && showTierLevels ? (
        <div className="admin-panel space-y-3">
          <h3 className="text-lg font-semibold">مستويات الشركاء</h3>
          <p className="text-neutral-400 text-sm">نسب المستويات — للعرض فقط</p>
          {activeSection === "commissions-bundle" && scPolicy?.tiers?.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {scPolicy.tiers.map((t) => (
                <div key={t.tierKey} className="rounded-xl border border-neutral-700 p-4">
                  <p className="font-semibold">{t.tierName}</p>
                  <p className="text-2xl font-black text-cyan-300 mt-1">{t.commissionPercent}%</p>
                  <p className="text-xs text-neutral-500 mt-1">{t.tierKey}</p>
                </div>
              ))}
            </div>
          ) : (
            <table className="admin-table w-full">
              <thead><tr><th>المفتاح</th><th>الاسم</th><th>v</th><th>إحالات</th><th>عملاء</th><th>إيراد</th></tr></thead>
              <tbody>
                {tiers.map((t) => (
                  <tr key={t.tier_key}>
                    <td>{t.tier_key}</td><td>{t.tier_name}</td><td>{t.rule_version}</td>
                    <td>{t.min_qualified_referrals ?? t.min_active_referrals}</td>
                    <td>{t.min_customers}</td><td>{t.min_confirmed_revenue ?? t.min_total_sales}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {!loading && activeSection === "milestones" ? (
        <table className="admin-table w-full">
          <thead><tr><th>الاسم</th><th>المقياس</th><th>العتبة</th><th>المكافأة</th><th>الحالة</th></tr></thead>
          <tbody>
            {milestones.map((m) => (
              <tr key={m.id}><td>{m.name}</td><td>{m.metric}</td><td>{m.threshold_value}</td><td>{formatPartnerMoney(m.reward_amount)}</td><td>{m.status}</td></tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {!loading && activeSection === "bonuses" ? (
        <table className="admin-table w-full">
          <thead><tr><th>الاسم</th><th>المقياس</th><th>العتبة</th><th>عينة</th><th>المكافأة</th><th>v</th></tr></thead>
          <tbody>
            {bonuses.map((b) => (
              <tr key={b.id}><td>{b.name}</td><td>{b.metric}</td><td>{b.threshold_value}</td><td>{b.minimum_sample_size}</td><td>{formatPartnerMoney(b.reward_amount)}</td><td>{b.rule_version}</td></tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {!loading && showQualifiedReward && qrrPolicy ? (
        <div className="space-y-6">
          <div className="admin-panel space-y-4">
            <div>
              <h3 className="text-lg font-semibold">مكافأة المستخدم المؤهل</h3>
              <p className="text-neutral-400 text-sm mt-1">
                المبلغ الذي يحصل عليه الشريك مرة واحدة عندما يصبح المستخدم المدعو مؤهلاً بعد اجتياز شروط التحقق والجودة.
              </p>
              <p className="text-amber-400 text-sm mt-2">
                ملاحظة: مكافأة التسجيل (Signup Bonus) منفصلة — مثال: QRR {formatPartnerMoney(qrrPolicy.current?.amount ?? 0.5)} + Signup {formatPartnerMoney(0.2)} = {formatPartnerMoney(Number(qrrPolicy.current?.amount ?? 0.5) + 0.2)} عند التأهل.
              </p>
              <p className="text-neutral-400 text-sm mt-1">
                هذه المكافأة تُصرف فقط بعد تأهل المستخدم وفق سياسة التأهيل.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="admin-stat-card">
                <p className="admin-stat-card__title">القيمة الحالية</p>
                <h3 className="admin-stat-card__value">
                  {qrrPolicy.current?.isEnabled
                    ? formatPartnerMoney(qrrPolicy.current.amount)
                    : "معطّلة"}
                </h3>
              </div>
              <div className="admin-stat-card">
                <p className="admin-stat-card__title">إصدار القاعدة</p>
                <h3 className="admin-stat-card__value">v{qrrPolicy.current?.ruleVersion ?? "—"}</h3>
              </div>
              <div className="admin-stat-card">
                <p className="admin-stat-card__title">مكافآت مدفوعة</p>
                <h3 className="admin-stat-card__value">{qrrPolicy.stats.creditedCount}</h3>
              </div>
              <div className="admin-stat-card">
                <p className="admin-stat-card__title">إجمالي التكلفة</p>
                <h3 className="admin-stat-card__value">{formatPartnerMoney(qrrPolicy.stats.totalPaid)}</h3>
              </div>
            </div>
            <Field label={`قيمة المكافأة (${qrrPolicy.constraints.min} – ${qrrPolicy.constraints.max} USD)`}>
              <input
                type="text"
                inputMode="decimal"
                className="admin-input w-full max-w-xs"
                value={qrrAmount}
                onChange={(e) => setQrrAmount(e.target.value)}
                placeholder="1.00"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={qrrEnabled} onChange={(e) => setQrrEnabled(e.target.checked)} />
              تفعيل مكافأة المستخدم المؤهل
            </label>
            {qrrPolicy.current ? (
              <div className="admin-panel border border-cyan-500/30 p-4 text-sm space-y-1">
                <p>معاينة قبل الحفظ:</p>
                <p>القيمة الحالية: {formatPartnerMoney(qrrPolicy.current.amount)} ({qrrPolicy.current.isEnabled ? "مفعّلة" : "معطّلة"})</p>
                <p>القيمة الجديدة: {formatPartnerMoney(qrrAmount || 0)} ({qrrEnabled ? "مفعّلة" : "معطّلة"})</p>
                <p className="text-neutral-400">
                  سيُطبق على المستخدمين الذين يصبحون مؤهلين بعد حفظ التغيير.
                </p>
              </div>
            ) : null}
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={qrrSaving}
              onClick={() => void saveQualifiedReward()}
            >
              {qrrSaving ? "جاري الحفظ..." : "حفظ قيمة المكافأة"}
            </button>
          </div>
        </div>
      ) : null}

      {!loading && showServiceCommissions && scPolicy ? (
        <div className="space-y-6">
          <div className="admin-panel space-y-4">
            <h3 className="text-lg font-semibold">عمولات الخدمات</h3>
            <p className="text-neutral-400 text-sm">
              نسبة الشريك الفعلية تعتمد على مستواه عندما تكون سياسة النسبة «حسب مستوى الشريك».
            </p>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="admin-stat-card">
                <p className="admin-stat-card__title">إجمالي عمولات الخدمات</p>
                <h3 className="admin-stat-card__value">{formatPartnerMoney(scPolicy.metrics.serviceCommissionsTotal)}</h3>
              </div>
              <div className="admin-stat-card">
                <p className="admin-stat-card__title">قيد الانتظار</p>
                <h3 className="admin-stat-card__value">{formatPartnerMoney(scPolicy.metrics.pending)}</h3>
              </div>
              <div className="admin-stat-card">
                <p className="admin-stat-card__title">قابل للسحب</p>
                <h3 className="admin-stat-card__value">{formatPartnerMoney(scPolicy.metrics.withdrawable)}</h3>
              </div>
              <div className="admin-stat-card">
                <p className="admin-stat-card__title">معكوسة</p>
                <h3 className="admin-stat-card__value">{formatPartnerMoney(scPolicy.metrics.reversed)}</h3>
              </div>
            </div>
          </div>

          {activeSection !== "commissions-bundle" ? (
          <div className="admin-panel space-y-3">
            <h4 className="font-semibold">نسب مستويات الشركاء</h4>
            <div className="flex flex-wrap gap-3 text-sm">
              {(scPolicy.tiers || []).map((t) => (
                <span key={t.tierKey} className="rounded border border-neutral-700 px-3 py-1">
                  {t.tierName}: {t.commissionPercent}%
                </span>
              ))}
            </div>
          </div>
          ) : null}

          <table className="admin-table w-full">
            <thead>
              <tr>
                <th>الخدمة</th>
                <th>الحالة</th>
                <th>سياسة النسبة</th>
                <th>النسبة/الوضع</th>
                <th>التحرير</th>
                <th>v</th>
                <th>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {(scPolicy.services || []).map((s) => (
                <tr key={s.id || s.serviceType}>
                  <td>
                    <div className="font-medium">{s.displayNameAr}</div>
                    <div className="text-xs text-neutral-500">{s.serviceType}</div>
                    {s.serviceType === "account_management" && !s.isEnabled ? (
                      <p className="text-amber-400 text-xs mt-1">معلّقة حتى توفر حدث اعتماد الأرباح</p>
                    ) : null}
                  </td>
                  <td>{s.isEnabled ? "مفعّلة" : "متوقفة"}</td>
                  <td>{s.tierPolicy === "use_partner_tier" ? "حسب مستوى الشريك" : "نسبة ثابتة للخدمة"}</td>
                  <td>
                    {s.tierPolicy === "use_partner_tier"
                      ? `حسب المستوى (${s.commissionPercent}% مرجع)`
                      : `${s.commissionPercent}%`}
                    <div className="text-xs text-neutral-500">{s.commissionMode}</div>
                  </td>
                  <td>{s.releasePolicy}</td>
                  <td>v{s.ruleVersion}</td>
                  <td>
                    <button type="button" className="admin-btn admin-btn--sm" onClick={() => startEditServiceRule(s)}>
                      تعديل
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {scEdit ? (
            <div className="admin-panel space-y-4 border border-cyan-500/30">
              <h4 className="font-semibold">تعديل: {scEdit.displayNameAr}</h4>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scEdit.isEnabled}
                  onChange={(e) => setScEdit({ ...scEdit, isEnabled: e.target.checked })}
                />
                تفعيل عمولة هذه الخدمة
              </label>
              <Field label="سياسة النسبة">
                <select
                  className="admin-input"
                  value={scEdit.tierPolicy}
                  onChange={(e) => setScEdit({ ...scEdit, tierPolicy: e.target.value })}
                >
                  <option value="use_partner_tier">حسب مستوى الشريك</option>
                  <option value="fixed_service_rate">نسبة ثابتة للخدمة</option>
                </select>
              </Field>
              {scEdit.tierPolicy === "fixed_service_rate" ? (
                <Field label={`نسبة ثابتة (0–${scPolicy.constraints.percentMax}%)`}>
                  <input
                    className="admin-input max-w-xs"
                    value={scEdit.commissionPercent}
                    onChange={(e) => setScEdit({ ...scEdit, commissionPercent: e.target.value })}
                  />
                </Field>
              ) : null}
              <Field label="سياسة التحرير">
                <select
                  className="admin-input"
                  value={scEdit.releasePolicy}
                  onChange={(e) => setScEdit({ ...scEdit, releasePolicy: e.target.value })}
                >
                  {scPolicy.constraints.releasePolicies.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </Field>
              <div className="flex gap-2">
                <button type="button" className="admin-btn admin-btn--primary" disabled={scSaving} onClick={() => void saveServiceCommissionRule()}>
                  {scSaving ? "جاري الحفظ..." : "حفظ"}
                </button>
                <button type="button" className="admin-btn" onClick={() => setScEdit(null)}>إلغاء</button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && activeSection === "rewards" ? (
        <table className="admin-table w-full">
          <thead><tr><th>النوع</th><th>المبلغ</th><th>الحالة</th><th>hold</th><th>v</th><th>تاريخ</th></tr></thead>
          <tbody>
            {rewards.map((r) => (
              <tr key={r.id}><td>{r.reward_type}</td><td>{formatPartnerMoney(r.amount)}</td><td>{r.status}</td><td>{r.payout_hold ? "نعم" : "لا"}</td><td>{r.rule_version}</td><td>{r.created_at}</td></tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {!loading && activeSection === "fraud" ? (
        <div className="space-y-4">
          <textarea className="admin-input w-full" placeholder="سبب الإجراء (مطلوب)" value={fraudReason} onChange={(e) => setFraudReason(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className="admin-btn admin-btn--primary" onClick={() => void fraudAction("release")}>موافقة — إطلاق</button>
            <button type="button" className="admin-btn admin-btn--secondary" onClick={() => void fraudAction("keep_hold")}>الإبقاء على التعليق</button>
          </div>
          <table className="admin-table w-full">
            <thead><tr><th></th><th>الشريك</th><th>المخاطر</th><th>المبلغ</th><th>التاريخ</th><th>إشارات</th></tr></thead>
            <tbody>
              {fraudQueue.map((row) => (
                <tr key={row.entitlementId}>
                  <td><input type="radio" name="fraudPick" checked={selectedEntitlement === row.entitlementId} onChange={() => setSelectedEntitlement(row.entitlementId)} /></td>
                  <td><Link href={`/admin/partners/${row.partnerId}`}>{row.partnerLabel}</Link></td>
                  <td>{row.riskLevel}</td>
                  <td>{formatPartnerMoney(row.heldAmount)}</td>
                  <td>{row.holdDate}</td>
                  <td>{(row.signals || []).length} إشارة</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && activeSection === "audit" ? (
        <table className="admin-table w-full">
          <thead><tr><th>الإجراء</th><th>الكيان</th><th>المعرف</th><th>السبب</th><th>التاريخ</th></tr></thead>
          <tbody>
            {audit.map((a) => (
              <tr key={a.id}><td>{a.action}</td><td>{a.entity_type}</td><td>{a.entity_id}</td><td>{a.reason || "—"}</td><td>{a.created_at}</td></tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {!loading && !["overview", "missions", "campaigns", "levels", "milestones", "bonuses", "qualified-reward", "service-commissions", "rewards", "fraud", "audit"].includes(section) ? (
        <p>{sectionTitle}</p>
      ) : null}
    </div>
  );
}
