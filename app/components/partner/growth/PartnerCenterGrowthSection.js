"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { formatPartnerMoney } from "../../../../lib/partner-shared";
import { PartnerMetricSkeletonGrid } from "../PartnerLoadingSkeleton";
import { PartnerFieldSelect } from "./PartnerFieldSelect";
import {
  SMART_LINK_SOURCE_OPTIONS,
  buildEligibleCampaignOptions,
} from "./smart-link-form-options";
import { isSmartLinkCampaignError } from "../../../../lib/partner-center/smart-link-errors.js";

const PartnerQrCode = dynamic(
  () => import("../PartnerQrCode").then((m) => m.PartnerQrCode),
  { ssr: false }
);

const TABS = [
  { id: "overview", label: "نظرة عامة" },
  { id: "missions", label: "المهام" },
  { id: "campaigns", label: "الحملات" },
  { id: "links", label: "الروابط" },
  { id: "wallet", label: "المحفظة" },
  { id: "analytics", label: "التحليلات" },
  { id: "milestones", label: "الإنجازات" },
  { id: "leaderboard", label: "المتصدرين" },
];

function Panel({ title, subtitle, children }) {
  return (
    <section className="user-dashboard-panel">
      <div className="user-dashboard-panel__header">
        <div>
          <h2 className="user-dashboard-panel__title">{title}</h2>
          {subtitle ? <p className="user-dashboard-panel__subtitle">{subtitle}</p> : null}
        </div>
      </div>
      <div className="user-dashboard-panel__body">{children}</div>
    </section>
  );
}

function EmptyState({ message }) {
  return (
    <div className="user-dashboard-empty">
      <span className="user-dashboard-empty__icon" aria-hidden="true">
        📭
      </span>
      <p>{message}</p>
    </div>
  );
}

function ProgressBar({ percent }) {
  return (
    <div className="partner-progress__track" aria-hidden="true">
      <div className="partner-progress__fill partner-progress__fill--cyan" style={{ width: `${Math.min(100, percent)}%` }} />
    </div>
  );
}

export function PartnerCenterGrowthSection({ onCopyFeedback, v2Mode = false, growthEnabled: growthEnabledProp }) {
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [growth, setGrowth] = useState(null);
  const [growthEnabledState, setGrowthEnabledState] = useState(
    typeof growthEnabledProp === "boolean" ? growthEnabledProp : false
  );
  const growthEnabled =
    typeof growthEnabledProp === "boolean" ? growthEnabledProp : growthEnabledState;
  const [creatingLink, setCreatingLink] = useState(false);
  const createInFlightRef = useRef(false);
  const [linkForm, setLinkForm] = useState({ source: "telegram", campaignCode: "" });
  const [linkFormError, setLinkFormError] = useState("");
  const [campaignFieldError, setCampaignFieldError] = useState("");

  useEffect(() => {
    if (typeof growthEnabledProp === "boolean") return;
    fetch("/api/partner/feature-flags", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setGrowthEnabledState(Boolean(j?.flags?.PARTNER_GROWTH_ENGINE)))
      .catch(() => setGrowthEnabledState(false));
  }, [growthEnabledProp]);

  const load = useCallback(async () => {
    if (!growthEnabled) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/partner/growth", { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || "تعذر التحميل");
      setGrowth(json.growth);
    } catch (e) {
      setError(e.message || "تعذر تحميل بيانات النمو");
    } finally {
      setLoading(false);
    }
  }, [growthEnabled]);

  useEffect(() => {
    if (growthEnabled) void load();
    else setLoading(false);
  }, [load, growthEnabled]);

  if (!v2Mode) return null;

  if (!growthEnabled) {
    return (
      <Panel
        title="مركز النمو"
        subtitle="واجهة الشركاء الجديدة"
      >
        <EmptyState message="محرك النمو غير مفعّل حاليًا — سيتم تفعيل المحتوى عند تشغيل Growth Engine." />
      </Panel>
    );
  }

  const copyUrl = async (url) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      onCopyFeedback?.("تم نسخ الرابط");
    } catch {
      onCopyFeedback?.("انسخ الرابط يدويًا", "warning");
    }
  };

  const eligibleCampaignOptions = useMemo(
    () => buildEligibleCampaignOptions(growth?.campaigns),
    [growth?.campaigns]
  );

  const createLink = async () => {
    if (creatingLink || createInFlightRef.current) return;
    if (!linkForm.source) {
      setLinkFormError("يرجى اختيار المصدر.");
      return;
    }

    createInFlightRef.current = true;
    setCreatingLink(true);
    setLinkFormError("");
    setCampaignFieldError("");

    try {
      const payload = {
        destinationPath: "/register",
        source: linkForm.source,
        campaignCode: linkForm.campaignCode || undefined,
      };

      const res = await fetch("/api/partner/growth/smart-links", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        const errorKey = json?.errorKey || json?.code || "";
        const message = json?.error || "تعذر إنشاء الرابط الآن. حاول مرة أخرى.";
        if (isSmartLinkCampaignError(errorKey)) {
          setCampaignFieldError(message);
        } else {
          setLinkFormError(message);
        }
        return;
      }

      onCopyFeedback?.("تم إنشاء الرابط بنجاح");
      setLinkForm((current) => ({ ...current, campaignCode: "" }));

      if (json.url) {
        setGrowth((current) => {
          if (!current) return current;
          const created = {
            id: json.smartLink?.id || `temp-${Date.now()}`,
            label: SMART_LINK_SOURCE_OPTIONS.find((s) => s.value === linkForm.source)?.label || linkForm.source,
            url: json.url,
            source: linkForm.source,
            medium: json.smartLink?.medium || null,
            campaignCode: linkForm.campaignCode || null,
            clicks: 0,
            signups: 0,
            qualifiedReferrals: 0,
            customers: 0,
            conversionRate: 0,
          };
          return {
            ...current,
            smartLinks: [created, ...(current.smartLinks || [])],
          };
        });
      }

      void load();
    } catch {
      setLinkFormError("تعذر إنشاء الرابط الآن. حاول مرة أخرى.");
    } finally {
      createInFlightRef.current = false;
      setCreatingLink(false);
    }
  };

  if (loading) {
    return (
      <Panel title="مركز النمو" subtitle="المهام، الحملات، الروابط، والتحليلات">
        <PartnerMetricSkeletonGrid count={4} />
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel title="مركز النمو">
        <div className="user-dashboard-empty">
          <p>{error}</p>
          <button type="button" className="partner-btn-primary mt-4" onClick={() => load()}>
            إعادة المحاولة
          </button>
        </div>
      </Panel>
    );
  }

  const overview = growth?.overview;
  const nba = overview?.nextBestAction;

  return (
    <div className="partner-growth-section space-y-4" dir="rtl">
      <nav className="partner-growth-tabs flex flex-wrap gap-2" aria-label="أقسام مركز الشركاء">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`partner-tab ${tab === t.id ? "partner-tab--active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && overview ? (
        <Panel title="نظرة عامة" subtitle="ملخص أدائك ومؤشراتك">
          {nba ? (
            <div className="partner-surface partner-surface--p4 mb-4 border border-cyan-500/30">
              <p className="partner-label">خطوتك التالية</p>
              <p className="partner-title-md">{nba.message}</p>
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="partner-surface partner-surface--p4">
              <p className="partner-label">متاح للسحب</p>
              <p className="partner-title-lg">{formatPartnerMoney(overview.metrics.withdrawable)}</p>
            </div>
            <div className="partner-surface partner-surface--p4">
              <p className="partner-label">معلق</p>
              <p className="partner-title-lg">{formatPartnerMoney(overview.metrics.pending)}</p>
            </div>
            <div className="partner-surface partner-surface--p4">
              <p className="partner-label">إحالات مؤهلة</p>
              <p className="partner-title-lg">{overview.metrics.qualifiedReferrals}</p>
            </div>
            <div className="partner-surface partner-surface--p4">
              <p className="partner-label">معدل التحويل</p>
              <p className="partner-title-lg">{overview.metrics.conversionRate}%</p>
            </div>
          </div>
        </Panel>
      ) : null}

      {tab === "missions" ? (
        <Panel title="مركز المهام" subtitle="تابع تقدمك واحصل على المكافآت">
          {!growth?.missions?.length ? (
            <EmptyState message="لا توجد مهام متاحة حاليًا" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {growth.missions.map((m) => (
                <article key={m.id} className="partner-surface partner-surface--p4">
                  <div className="flex justify-between gap-2">
                    <h3 className="partner-title-md">{m.title}</h3>
                    <span className="partner-badge">{m.uiStatus?.label}</span>
                  </div>
                  {m.description ? <p className="partner-muted--sm mt-1">{m.description}</p> : null}
                  <p className="partner-accent-green mt-2">
                    {m.currentValue} / {m.targetValue} — {m.progressPercent}%
                  </p>
                  <ProgressBar percent={m.progressPercent} />
                  {m.remaining > 0 ? (
                    <p className="partner-muted--sm mt-2">بقي {m.remaining}</p>
                  ) : null}
                  <p className="partner-muted--sm mt-2">المكافأة: {formatPartnerMoney(m.rewardAmount)}</p>
                  {m.rewardState ? (
                    <p className="partner-muted--sm">حالة المكافأة: {m.rewardState.label}</p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {tab === "campaigns" ? (
        <Panel title="مركز الحملات">
          {!growth?.campaigns?.length ? (
            <EmptyState message="لا توجد حملات نشطة" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {growth.campaigns.map((c) => (
                <article key={c.id} className="partner-surface partner-surface--p4">
                  <h3 className="partner-title-md">{c.name}</h3>
                  <p className="partner-muted--sm">{c.description || c.landingPath}</p>
                  <p className="partner-muted--sm mt-2">الحالة: {c.statusLabel}</p>
                  {!c.eligible ? (
                    <p className="text-amber-400 text-sm mt-2">غير مؤهل لهذه الحملة</p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {tab === "links" ? (
        <Panel title="الروابط التسويقية" subtitle="أنشئ روابط آمنة مع تتبع المصدر">
          <div className="partner-smart-link-form partner-surface partner-surface--p4 mb-4">
            <div className="partner-smart-link-form__grid">
              <PartnerFieldSelect
                label="المصدر"
                value={linkForm.source}
                onChange={(source) => {
                  setLinkForm((f) => ({ ...f, source }));
                  setLinkFormError("");
                }}
                options={SMART_LINK_SOURCE_OPTIONS}
                disabled={creatingLink}
              />
              <PartnerFieldSelect
                label="الحملة (اختياري)"
                value={linkForm.campaignCode}
                onChange={(campaignCode) => {
                  setLinkForm((f) => ({ ...f, campaignCode }));
                  setCampaignFieldError("");
                }}
                options={eligibleCampaignOptions}
                placeholder="بدون حملة"
                disabled={creatingLink}
                error={campaignFieldError}
                hint={
                  eligibleCampaignOptions.length <= 1
                    ? "لا توجد حملات متاحة لحسابك حاليًا — يمكنك إنشاء رابط بدون حملة."
                    : ""
                }
              />
              <div className="partner-smart-link-form__action">
                <button
                  type="button"
                  className="partner-btn-primary partner-smart-link-form__submit w-full"
                  disabled={creatingLink || !linkForm.source}
                  onClick={() => createLink()}
                >
                  {creatingLink ? (
                    <span className="partner-smart-link-form__submit-inner">
                      <span className="partner-spinner" aria-hidden="true" />
                      جارٍ إنشاء الرابط...
                    </span>
                  ) : (
                    <span className="partner-smart-link-form__submit-inner">
                      <span aria-hidden="true">🔗</span>
                      إنشاء رابط
                    </span>
                  )}
                </button>
              </div>
            </div>
            {linkFormError ? (
              <p className="partner-field-error mt-3" role="alert">
                {linkFormError}
              </p>
            ) : null}
          </div>
          {!growth?.smartLinks?.length ? (
            <EmptyState message="لم تنشئ روابط تسويقية بعد" />
          ) : (
            <div className="space-y-3">
              {growth.smartLinks.map((link) => (
                <div key={link.id} className="partner-surface partner-surface--p4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="partner-title-md">
                      {link.label || link.source || "رابط"}
                    </p>
                    {link.campaignCode ? (
                      <p className="partner-muted--sm">الحملة: {link.campaignName || link.campaignCode}</p>
                    ) : null}
                    <p className="partner-muted--sm break-all">{link.url}</p>
                    <p className="partner-muted--sm">
                      المصدر: {link.source || "—"} — نقرات: {link.clicks} — تسجيلات: {link.signups} — مؤهلون: {link.qualifiedReferrals ?? 0} — عملاء: {link.customers ?? 0}
                      {link.funnel ? ` — تحويل ${link.conversionRate ?? 0}%` : null}
                    </p>
                    {link.funnel ? (
                      <p className="partner-muted--xs">
                        قمع: {link.funnel.clicks} → {link.funnel.signups} → {link.funnel.qualified} → {link.funnel.customers}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="partner-btn-ghost" onClick={() => copyUrl(link.url)}>
                      نسخ الرابط
                    </button>
                    <PartnerQrCode url={link.url} size={72} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {tab === "wallet" && growth?.wallet ? (
        <Panel
          title="المحفظة والمعاملات"
          subtitle="سجل مالي موحّد — المصدر الرسمي للحركات المالية في مركز الشركاء"
        >
          <div className="grid gap-4 md:grid-cols-3 mb-4">
            <div className="partner-surface partner-surface--p4">
              <p className="partner-label">متاح للسحب</p>
              <p className="partner-title-lg">{formatPartnerMoney(growth.wallet.balances.withdrawable)}</p>
            </div>
            <div className="partner-surface partner-surface--p4">
              <p className="partner-label">معلق</p>
              <p className="partner-title-lg">{formatPartnerMoney(growth.wallet.balances.pending)}</p>
            </div>
            <div className="partner-surface partner-surface--p4">
              <p className="partner-label">قيد المراجعة</p>
              <p className="partner-title-lg">{formatPartnerMoney(growth.wallet.balances.riskHeld)}</p>
            </div>
          </div>
          {!growth.wallet.transactions?.length ? (
            <EmptyState message="لا توجد معاملات في هذه الفترة" />
          ) : (
            <div className="partner-scroll-panel overflow-x-auto">
              <table className="partner-table w-full min-w-[480px]">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>النوع</th>
                    <th>المبلغ</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {growth.wallet.transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>{new Date(tx.createdAt).toLocaleDateString("ar")}</td>
                      <td>{tx.typeLabel}</td>
                      <td>{formatPartnerMoney(tx.amount)}</td>
                      <td>{tx.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {tab === "analytics" && growth?.analytics ? (
        <Panel title="قمع التحويل">
          <div className="grid gap-3 md:grid-cols-5">
            {[
              ["نقرات", growth.analytics.funnel.clicks],
              ["تسجيلات", growth.analytics.funnel.signups],
              ["مؤهلون", growth.analytics.funnel.qualified],
              ["عملاء", growth.analytics.funnel.customers],
              ["إيراد", formatPartnerMoney(growth.analytics.funnel.revenue)],
            ].map(([label, val]) => (
              <div key={label} className="partner-surface partner-surface--p4 text-center">
                <p className="partner-label">{label}</p>
                <p className="partner-title-md">{val}</p>
              </div>
            ))}
          </div>
          {growth.analytics.channels?.length ? (
            <div className="mt-4">
              <h3 className="partner-title-md mb-2">حسب القناة</h3>
              <div className="grid gap-2 md:grid-cols-2">
                {growth.analytics.channels.map((ch, i) => (
                  <div key={i} className="partner-surface partner-surface--p4">
                    <p>{ch.source || "direct"} / {ch.medium || "—"}</p>
                    <p className="partner-muted--sm">نقرات {ch.clicks} — تحويل {ch.conversionRate}%</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {tab === "milestones" ? (
        <Panel title="الإنجازات">
          {!growth?.milestones?.length ? (
            <EmptyState message="لا توجد إنجازات متاحة" />
          ) : (
            ["achieved", "in_progress", "locked"].map((section) => {
              const items = growth.milestones.filter((m) => m.section === section);
              if (!items.length) return null;
              const titles = { achieved: "محققة", in_progress: "قيد التقدم", locked: "قادمة" };
              return (
                <div key={section} className="mb-4">
                  <h3 className="partner-title-md mb-2">{titles[section]}</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {items.map((m) => (
                      <div key={m.id} className="partner-surface partner-surface--p4">
                        <p className="partner-title-md">{m.title}</p>
                        <p className="partner-muted--sm">{m.current} / {m.threshold}</p>
                        {m.rewardAmount ? (
                          <p className="partner-muted--sm">مكافأة: {formatPartnerMoney(m.rewardAmount)}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </Panel>
      ) : null}

      {tab === "leaderboard" ? (
        <Panel title="لوحة المتصدرين">
          {!growth?.leaderboard?.entries?.length ? (
            <EmptyState message="لا توجد بيانات متصدرين لهذه الفترة" />
          ) : (
            <ol className="space-y-2">
              {growth.leaderboard.entries.map((row) => (
                <li key={row.rank} className="partner-surface partner-surface--p4 flex justify-between">
                  <span>#{row.rank} {row.displayLabel}</span>
                  <span>{row.metricValue}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      ) : null}
    </div>
  );
}

export default PartnerCenterGrowthSection;
