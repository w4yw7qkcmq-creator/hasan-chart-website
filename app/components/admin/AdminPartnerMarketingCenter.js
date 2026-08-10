"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "../../../lib/admin-fetch";
import { formatPartnerMoney } from "../../../lib/partner-shared";

const SECTIONS = [
  { id: "overview", label: "نظرة عامة" },
  { id: "missions", label: "المهام" },
  { id: "campaigns", label: "الحملات" },
  { id: "levels", label: "المستويات" },
  { id: "milestones", label: "المعالم" },
  { id: "bonuses", label: "مكافآت الأداء" },
  { id: "qualified-reward", label: "مكافأة المستخدم المؤهل" },
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

const EMPTY_CAMPAIGN = {
  code: "",
  name: "",
  description: "",
  landing_path: "/",
  allowed_sources: [],
  allowed_mediums: [],
  status: "draft",
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

export default function AdminPartnerMarketingCenter() {
  const [section, setSection] = useState("overview");
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
  const [campaignForm, setCampaignForm] = useState(EMPTY_CAMPAIGN);
  const [missionPreview, setMissionPreview] = useState(null);
  const [campaignPreview, setCampaignPreview] = useState(null);
  const [fraudReason, setFraudReason] = useState("");
  const [selectedEntitlement, setSelectedEntitlement] = useState(null);
  const [qrrPolicy, setQrrPolicy] = useState(null);
  const [qrrAmount, setQrrAmount] = useState("");
  const [qrrEnabled, setQrrEnabled] = useState(false);
  const [qrrSaving, setQrrSaving] = useState(false);

  const loadSection = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (section === "overview") {
        const res = await adminFetch("/api/admin/partner-marketing/overview");
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setOverview(json.overview);
      }
      if (section === "missions") {
        const res = await adminFetch("/api/admin/partner-marketing/missions");
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setMissions(json.missions || []);
      }
      if (section === "campaigns") {
        const res = await adminFetch("/api/admin/partner-marketing/campaigns");
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setCampaigns(json.campaigns || []);
      }
      if (section === "levels") {
        const res = await adminFetch("/api/admin/partner-marketing/levels");
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setTiers(json.tiers || []);
      }
      if (section === "milestones") {
        const res = await adminFetch("/api/admin/partner-marketing/milestones");
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setMilestones(json.milestones || []);
      }
      if (section === "bonuses") {
        const res = await adminFetch("/api/admin/partner-marketing/performance-bonuses");
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setBonuses(json.rules || []);
      }
      if (section === "qualified-reward") {
        const res = await adminFetch("/api/admin/partner-marketing/qualified-referral-reward");
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setQrrPolicy(json.policy);
        setQrrAmount(String(json.policy?.current?.amount ?? ""));
        setQrrEnabled(Boolean(json.policy?.current?.isEnabled));
      }
      if (section === "rewards") {
        const res = await adminFetch("/api/admin/partner-marketing/rewards");
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setRewards(json.rows || []);
      }
      if (section === "fraud") {
        const res = await adminFetch("/api/admin/partner-marketing/fraud-review");
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setFraudQueue(json.rows || []);
      }
      if (section === "audit") {
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
  }, [section]);

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
      setCampaignForm(EMPTY_CAMPAIGN);
      setCampaignPreview(null);
      void loadSection();
    }
  };

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

  const sectionTitle = useMemo(() => SECTIONS.find((s) => s.id === section)?.label, [section]);

  return (
    <div className="admin-page space-y-6" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="admin-eyebrow">Partner Center Phase 3</p>
          <h1 className="admin-page-title">مركز التسويق — الشركاء</h1>
          <p className="admin-page-subtitle">CRUD كامل — مهام، حملات، مستويات، معالم، مراجعة مخاطر</p>
        </div>
        <Link href="/admin/partners" className="admin-btn admin-btn--secondary">
          ← الشركاء
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

      {error ? <p className="text-red-400">{error}</p> : null}
      {loading ? <p>جاري التحميل...</p> : null}

      {!loading && section === "overview" && overview ? (
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

      {!loading && section === "missions" ? (
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

      {!loading && section === "campaigns" ? (
        <div className="space-y-6">
          <div className="admin-panel grid gap-3 md:grid-cols-2">
            <Field label="الرمز"><input className="admin-input w-full" value={campaignForm.code} onChange={(e) => setCampaignForm({ ...campaignForm, code: e.target.value })} /></Field>
            <Field label="الاسم"><input className="admin-input w-full" value={campaignForm.name} onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })} /></Field>
            <Field label="مسار الهبوط"><input className="admin-input w-full" value={campaignForm.landing_path} onChange={(e) => setCampaignForm({ ...campaignForm, landing_path: e.target.value })} /></Field>
            <div className="flex gap-2 md:col-span-2">
              <button type="button" className="admin-btn admin-btn--secondary" onClick={() => void previewCampaign()}>معاينة</button>
              <button type="button" className="admin-btn admin-btn--primary" onClick={() => void saveCampaign()}>إنشاء مسودة</button>
            </div>
            <PreviewPanel preview={campaignPreview?.preview} warnings={campaignPreview?.warnings} />
          </div>
          <table className="admin-table w-full">
            <thead><tr><th>الاسم</th><th>v</th><th>المسار</th><th>الحالة</th></tr></thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}><td>{c.name}</td><td>{c.rule_version}</td><td>{c.landing_path}</td><td>{c.status}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && section === "levels" ? (
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
      ) : null}

      {!loading && section === "milestones" ? (
        <table className="admin-table w-full">
          <thead><tr><th>الاسم</th><th>المقياس</th><th>العتبة</th><th>المكافأة</th><th>الحالة</th></tr></thead>
          <tbody>
            {milestones.map((m) => (
              <tr key={m.id}><td>{m.name}</td><td>{m.metric}</td><td>{m.threshold_value}</td><td>{formatPartnerMoney(m.reward_amount)}</td><td>{m.status}</td></tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {!loading && section === "bonuses" ? (
        <table className="admin-table w-full">
          <thead><tr><th>الاسم</th><th>المقياس</th><th>العتبة</th><th>عينة</th><th>المكافأة</th><th>v</th></tr></thead>
          <tbody>
            {bonuses.map((b) => (
              <tr key={b.id}><td>{b.name}</td><td>{b.metric}</td><td>{b.threshold_value}</td><td>{b.minimum_sample_size}</td><td>{formatPartnerMoney(b.reward_amount)}</td><td>{b.rule_version}</td></tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {!loading && section === "qualified-reward" && qrrPolicy ? (
        <div className="space-y-6">
          <div className="admin-panel space-y-4">
            <div>
              <h3 className="text-lg font-semibold">مكافأة المستخدم المؤهل</h3>
              <p className="text-neutral-400 text-sm mt-1">
                المبلغ الذي يحصل عليه الشريك مرة واحدة عندما يصبح المستخدم المدعو مؤهلاً بعد اجتياز شروط التحقق والجودة.
              </p>
              <p className="text-amber-400 text-sm mt-2">
                ملاحظة: مكافأة التسجيل (Signup Bonus) منفصلة عن هذه المكافأة — كلاهما قد يُصرف عند التأهل حسب الإعدادات الحالية.
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

      {!loading && section === "rewards" ? (
        <table className="admin-table w-full">
          <thead><tr><th>النوع</th><th>المبلغ</th><th>الحالة</th><th>hold</th><th>v</th><th>تاريخ</th></tr></thead>
          <tbody>
            {rewards.map((r) => (
              <tr key={r.id}><td>{r.reward_type}</td><td>{formatPartnerMoney(r.amount)}</td><td>{r.status}</td><td>{r.payout_hold ? "نعم" : "لا"}</td><td>{r.rule_version}</td><td>{r.created_at}</td></tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {!loading && section === "fraud" ? (
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

      {!loading && section === "audit" ? (
        <table className="admin-table w-full">
          <thead><tr><th>الإجراء</th><th>الكيان</th><th>المعرف</th><th>السبب</th><th>التاريخ</th></tr></thead>
          <tbody>
            {audit.map((a) => (
              <tr key={a.id}><td>{a.action}</td><td>{a.entity_type}</td><td>{a.entity_id}</td><td>{a.reason || "—"}</td><td>{a.created_at}</td></tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {!loading && !["overview", "missions", "campaigns", "levels", "milestones", "bonuses", "qualified-reward", "rewards", "fraud", "audit"].includes(section) ? (
        <p>{sectionTitle}</p>
      ) : null}
    </div>
  );
}
