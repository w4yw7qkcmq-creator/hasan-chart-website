"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../../lib/admin-fetch";
import {
  downloadCsvBlob,
  fetchFinancialCenterSection,
  fetchPaymentProof,
  formatCurrencyTotals,
} from "../../../../lib/admin-financial-center-client";
import {
  createAdminActionInFlightRegistry,
  runAdminUserActionFlow,
} from "../../../../lib/admin-user-action-flow";
import {
  buildSubscriptionOpenHref,
  canActivatePaymentReviewItem,
  canRejectPaymentReviewItem,
  mapPaymentReviewToSubscriptionRequest,
  postSubscriptionActivateViaDashboard,
  postSubscriptionRejectViaApi,
} from "../../../../lib/admin-subscription-review-actions-client";
import {
  dispatchAdminSubscriptionUpdatedEvent,
  subscribeAdminSubscriptionUpdated,
} from "../../../../lib/admin-subscription-updated-client";
import { PAYMENT_REVIEW_STATUSES } from "../../../../lib/financial-center/financial-types.js";
import { formatPaymentReviewStatusLabel } from "../../../../lib/financial-center/financial-center-shared.js";
import AdminPaymentProofModal from "./AdminPaymentProofModal";
import SubscriptionRejectModal from "./SubscriptionRejectModal";

const TABS = [
  { id: "overview", label: "نظرة عامة" },
  { id: "subscriptions", label: "الاشتراكات" },
  { id: "payment-reviews", label: "إثباتات الدفع" },
  { id: "revenue", label: "الإيرادات" },
  { id: "referrals", label: "الإحالات والسحوبات" },
];

const PERIOD_OPTIONS = [
  { id: "today", label: "اليوم", revenuePeriod: "7d" },
  { id: "7d", label: "7 أيام", revenuePeriod: "7d" },
  { id: "30d", label: "30 يوم", revenuePeriod: "30d" },
  { id: "90d", label: "90 يوم", revenuePeriod: "90d" },
  { id: "year", label: "السنة", revenuePeriod: "year" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "كل الحالات" },
  { value: "pending", label: "معلق" },
  { value: "active", label: "نشط" },
  { value: "expired", label: "منتهي" },
  { value: "suspended", label: "موقوف" },
  { value: "rejected", label: "مرفوض" },
  { value: "cancelled", label: "ملغى" },
];

const SERVICE_OPTIONS = [
  { value: "all", label: "كل الخدمات" },
  { value: "vip_spot", label: "VIP Spot" },
  { value: "vip_futures", label: "VIP Futures" },
  { value: "vip_signals", label: "VIP Signals" },
  { value: "academy", label: "Academy" },
];

function SectionSkeleton({ rows = 4 }) {
  return (
    <div className="admin-premium-skeleton">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="admin-premium-skeleton__row animate-pulse" />
      ))}
    </div>
  );
}

function sumCurrencyTotals(totals = {}) {
  return Object.values(totals).reduce((sum, value) => sum + Number(value || 0), 0);
}

function ChartEmptyState({ icon = "📊", title, desc }) {
  return (
    <div className="admin-premium-empty admin-premium-empty--compact">
      <span className="admin-premium-empty__icon" aria-hidden="true">
        {icon}
      </span>
      <p className="admin-premium-empty__title">{title}</p>
      {desc ? <p className="admin-premium-empty__desc">{desc}</p> : null}
    </div>
  );
}

function RevenueLineChart({ daily = [], period = "30d" }) {
  const points = useMemo(() => {
    let rows = [...daily].reverse();
    if (period === "today") {
      const todayKey = new Date().toISOString().slice(0, 10);
      rows = rows.filter((row) => row.date === todayKey);
    } else {
      const limit = period === "7d" ? 7 : period === "90d" ? 90 : period === "year" ? 365 : 30;
      rows = rows.slice(-limit);
    }
    return rows.map((row) => ({
      date: row.date,
      total: sumCurrencyTotals(row.revenue),
      count: row.activatedCount || 0,
    }));
  }, [daily, period]);

  if (points.length === 0) {
    return (
      <ChartEmptyState
        icon="📈"
        title="لا توجد بيانات إيرادات"
        desc="ستظهر المنحنى عند تفعيل اشتراكات جديدة."
      />
    );
  }

  const maxValue = Math.max(...points.map((point) => point.total), 1);
  const width = 400;
  const height = 140;
  const padding = 12;

  const coordinates = points.map((point, index) => {
    const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - (point.total / maxValue) * (height - padding * 2);
    return { x, y, point };
  });

  const polyline = coordinates.map(({ x, y }) => `${x},${y}`).join(" ");
  const area = `${padding},${height - padding} ${polyline} ${width - padding},${height - padding}`;

  return (
    <div className="admin-financial-line-chart admin-financial-line-chart--premium">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="رسم الإيرادات" preserveAspectRatio="none">
        <defs>
          <linearGradient id="adminRevenueArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(37, 99, 235, 0.28)" />
            <stop offset="100%" stopColor="rgba(37, 99, 235, 0.02)" />
          </linearGradient>
          <linearGradient id="adminRevenueLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((ratio) => {
          const y = padding + ratio * (height - padding * 2);
          return (
            <line
              key={ratio}
              x1={padding}
              y1={y}
              x2={width - padding}
              y2={y}
              className="admin-financial-line-chart__grid"
            />
          );
        })}
        <polygon points={area} fill="url(#adminRevenueArea)" />
        <polyline
          points={polyline}
          className="admin-financial-line-chart__line"
          fill="none"
          stroke="url(#adminRevenueLine)"
        />
        {coordinates.map(({ x, y, point }) => (
          <circle key={point.date} cx={x} cy={y} r="4" className="admin-financial-line-chart__dot" />
        ))}
      </svg>
      <div className="admin-financial-line-chart__labels">
        <span>{points[0]?.date || "—"}</span>
        <span>{points[points.length - 1]?.date || "—"}</span>
      </div>
    </div>
  );
}

function ServiceRevenueBars({ revenueByService = {} }) {
  const entries = Object.entries(revenueByService || {});
  if (entries.length === 0) {
    return (
      <ChartEmptyState
        icon="📊"
        title="لا يوجد توزيع إيرادات"
        desc="سيظهر التوزيع حسب الخدمة عند توفر بيانات."
      />
    );
  }

  const maxTotal = Math.max(...entries.map(([, totals]) => sumCurrencyTotals(totals)), 1);

  return (
    <div className="admin-financial-service-bars admin-financial-service-bars--premium">
      {entries.map(([service, totals], index) => {
        const total = sumCurrencyTotals(totals);
        const width = `${Math.max((total / maxTotal) * 100, 6)}%`;
        return (
          <div key={service} className="admin-financial-service-bars__row admin-animate-in" style={{ animationDelay: `${index * 40}ms` }}>
            <div className="admin-financial-service-bars__meta">
              <span className="admin-financial-service-bars__label">{service}</span>
              <strong>{formatCurrencyTotals(totals)}</strong>
            </div>
            <div className="admin-financial-service-bars__track">
              <span className="admin-financial-service-bars__fill" style={{ width }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const FINANCIAL_KPI_ICONS = {
  today: "☀️",
  month: "📅",
  year: "🗓️",
  total: "💎",
  active: "⭐",
  pending: "⏳",
};

const FINANCIAL_KPI_DESCRIPTIONS = {
  today: "إيرادات اليوم التقديرية",
  month: "إيرادات الشهر الحالي",
  year: "إيرادات السنة",
  total: "إجمالي الإيرادات المعترف بها",
  active: "اشتراكات نشطة حالياً",
  pending: "طلبات بانتظار المراجعة",
};

function RecentOpCard({ title, subtitle, meta, badge, onAction, actionLabel }) {
  return (
    <article className="admin-financial-op-card">
      <div className="admin-financial-op-card__body">
        <p className="admin-financial-op-card__title">{title}</p>
        {subtitle ? <p className="admin-financial-op-card__subtitle">{subtitle}</p> : null}
        {meta ? <p className="admin-financial-op-card__meta">{meta}</p> : null}
      </div>
      <div className="admin-financial-op-card__aside">
        {badge ? <span className="admin-financial-op-card__badge">{badge}</span> : null}
        {onAction && actionLabel ? (
          <button
            type="button"
            className="admin-financial-action-button admin-financial-action-button--primary"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function RevenueDonutChart({ revenueByService = {} }) {
  const entries = useMemo(() => {
    return Object.entries(revenueByService || {})
      .map(([service, totals]) => ({ service, total: sumCurrencyTotals(totals) }))
      .filter((entry) => entry.total > 0);
  }, [revenueByService]);

  if (entries.length === 0) {
    return (
      <ChartEmptyState icon="🍩" title="لا يوجد توزيع إيرادات" desc="سيظهر الرسم عند توفر بيانات الخدمات." />
    );
  }

  const total = entries.reduce((sum, entry) => sum + entry.total, 0);
  const colors = ["#2563eb", "#06b6d4", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"];
  const size = 160;
  const radius = 52;
  const cx = size / 2;
  const cy = size / 2;
  let cumulative = 0;

  const slices = entries.map((entry, index) => {
    const fraction = entry.total / total;
    const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    cumulative += fraction;
    const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);
    const largeArc = fraction > 0.5 ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return { ...entry, path, color: colors[index % colors.length], percent: Math.round(fraction * 100) };
  });

  return (
    <div className="admin-financial-donut">
      <svg viewBox={`0 0 ${size} ${size}`} className="admin-financial-donut__svg" role="img" aria-label="توزيع الإيرادات">
        {slices.map((slice) => (
          <path key={slice.service} d={slice.path} fill={slice.color} className="admin-financial-donut__slice" />
        ))}
        <circle cx={cx} cy={cy} r={30} className="admin-financial-donut__hole" />
      </svg>
      <ul className="admin-financial-donut__legend">
        {slices.map((slice) => (
          <li key={slice.service}>
            <span className="admin-financial-donut__dot" style={{ background: slice.color }} />
            <span className="admin-financial-donut__label">{slice.service}</span>
            <strong>{slice.percent}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function KpiCard({ label, value, hint, description, onClick, kpiKey = "", status = "stable" }) {
  const Tag = onClick ? "button" : "article";
  const icon = FINANCIAL_KPI_ICONS[kpiKey] || "📊";
  const statusLabel = status === "attention" ? "يحتاج متابعة" : "مستقر";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      className={`admin-financial-kpi admin-financial-kpi--premium ${status === "attention" ? "is-attention" : ""}`}
      onClick={onClick}
    >
      <div className="admin-financial-kpi__head">
        <span className="admin-financial-kpi__icon" aria-hidden="true">
          {icon}
        </span>
        <span className={`admin-financial-kpi__status ${status === "attention" ? "is-attention" : "is-stable"}`}>
          {statusLabel}
        </span>
      </div>
      <p className="admin-financial-kpi__label">{label}</p>
      <p className="admin-financial-kpi__value">{value}</p>
      {description ? <p className="admin-financial-kpi__description">{description}</p> : null}
      {hint ? <p className="admin-financial-kpi__hint">{hint}</p> : null}
      {onClick ? <span className="admin-financial-kpi__direction" aria-hidden="true">→ عرض</span> : null}
    </Tag>
  );
}

function SubscriptionActivateConfirmModal({ request, loading = false, apiError = "", onCancel, onConfirm }) {
  if (!request) return null;

  return (
    <div className="admin-crm-action-modal" role="presentation">
      <button type="button" className="admin-crm-action-modal__backdrop" aria-label="إغلاق" disabled={loading} onClick={onCancel} />
      <div className="admin-crm-action-modal__dialog" role="dialog" aria-modal="true">
        <h2 className="admin-heading text-xl">تأكيد قبول وتفعيل الاشتراك</h2>
        <p className="admin-crm-action-modal__description mt-3">
          سيتم استخدام مسار التفعيل الرسمي نفسه المستخدم في صفحة الاشتراكات.
        </p>
        <dl className="admin-financial-activate-summary mt-4 space-y-2 text-sm">
          <div><dt className="admin-muted inline">المستخدم: </dt><dd className="inline font-bold">{request.username || request.userEmail || "—"}</dd></div>
          <div><dt className="admin-muted inline">الباقة: </dt><dd className="inline font-bold">{request.planName || "—"}</dd></div>
          <div><dt className="admin-muted inline">السعر: </dt><dd className="inline font-bold">{request.price || "—"}</dd></div>
          <div><dt className="admin-muted inline">إثبات الدفع: </dt><dd className="inline font-bold">{request.hasPaymentProof ? "متاح" : "غير متاح"}</dd></div>
        </dl>
        {apiError ? <p className="mt-4 font-bold text-red-600">{apiError}</p> : null}
        <div className="admin-crm-action-modal__actions mt-6 flex flex-wrap gap-3">
          <button type="button" className="admin-financial-action-button admin-financial-action-button--secondary px-4 py-2" disabled={loading} onClick={onCancel}>
            إلغاء
          </button>
          <button type="button" className="admin-financial-action-button admin-financial-action-button--primary px-4 py-2" disabled={loading} onClick={onConfirm}>
            {loading ? "جاري التفعيل..." : "قبول وتفعيل"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentReviewActions({
  item,
  proofLoadingId,
  actionLoadingId,
  onOpenProof,
  onActivate,
  onReject,
  onOpenSubscription,
}) {
  const requestId = String(item.requestId || "");
  const proofBusy = proofLoadingId === requestId;
  const activateBusy = actionLoadingId === `${requestId}:activate`;
  const rejectBusy = actionLoadingId === `${requestId}:reject`;
  const rowBusy = proofBusy || activateBusy || rejectBusy;
  const showDecisionActions = canActivatePaymentReviewItem(item) || canRejectPaymentReviewItem(item);

  return (
    <div className="flex flex-wrap gap-2 min-w-[220px]">
      <button
        type="button"
        className="admin-financial-action-button admin-financial-action-button--secondary"
        disabled={rowBusy}
        onClick={() => onOpenProof(item)}
      >
        {proofBusy ? "..." : "فتح الإثبات"}
      </button>
      <button
        type="button"
        className="admin-financial-action-button admin-financial-action-button--primary"
        disabled={rowBusy}
        onClick={() => onOpenSubscription(item)}
      >
        فتح الطلب
      </button>
      {showDecisionActions ? (
        <>
          <button
            type="button"
            className="rounded-2xl bg-gradient-to-l from-emerald-700 via-emerald-500 to-green-300 px-4 py-2 text-sm font-black text-white"
            disabled={rowBusy}
            onClick={() => onActivate(item)}
          >
            {activateBusy ? "..." : "قبول وتفعيل"}
          </button>
          <button
            type="button"
            className="admin-btn--reject rounded-2xl px-4 py-2 text-sm font-black"
            disabled={rowBusy}
            onClick={() => onReject(item)}
          >
            {rejectBusy ? "..." : "رفض الطلب"}
          </button>
        </>
      ) : null}
    </div>
  );
}

export default function FinancialCenterPanel({ standalone = false }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");
  const [overviewPeriod, setOverviewPeriod] = useState("30d");
  const [overview, setOverview] = useState(null);
  const [chartReport, setChartReport] = useState(null);
  const [recentActive, setRecentActive] = useState([]);
  const [recentPending, setRecentPending] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [subscriptionPagination, setSubscriptionPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [paymentReviews, setPaymentReviews] = useState([]);
  const [paymentPagination, setPaymentPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [revenueReport, setRevenueReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [proofPreview, setProofPreview] = useState(null);
  const [proofLoadingId, setProofLoadingId] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ status: "all", service: "all", source: "all", paid: "all" });
  const [reviewStatus, setReviewStatus] = useState("all");
  const [revenuePeriod, setRevenuePeriod] = useState("30d");
  const [activateTarget, setActivateTarget] = useState(null);
  const [activateLoading, setActivateLoading] = useState(false);
  const [activateApiError, setActivateApiError] = useState("");
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [rejectApiError, setRejectApiError] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const abortRef = useRef(null);
  const backgroundAbortRef = useRef(null);
  const subscriptionActionInFlightRef = useRef(createAdminActionInFlightRegistry());

  const openUser = useCallback(
    (userId) => {
      if (!userId) return;
      router.push(`/admin/users/${encodeURIComponent(userId)}`);
    },
    [router]
  );

  const selectedPeriod = PERIOD_OPTIONS.find((item) => item.id === overviewPeriod) || PERIOD_OPTIONS[2];

  const loadOverviewBundle = useCallback(async (signal) => {
    const [overviewResult, revenueResult] = await Promise.all([
      fetchFinancialCenterSection(adminFetch, "overview", { signal }),
      fetchFinancialCenterSection(adminFetch, "revenue", {
        signal,
        query: { period: selectedPeriod.revenuePeriod },
      }),
    ]);
    setOverview(overviewResult.overview);
    setRecentActive(overviewResult.recentActive || []);
    setRecentPending(overviewResult.recentPending || []);
    setChartReport(revenueResult.report || null);
  }, [selectedPeriod.revenuePeriod]);

  const refreshPendingOverviewCount = useCallback(async (signal) => {
    const overviewResult = await fetchFinancialCenterSection(adminFetch, "overview", { signal });
    if (!overviewResult?.overview) return;
    setOverview((current) =>
      current
        ? {
            ...current,
            pendingReviews: overviewResult.overview.pendingReviews ?? current.pendingReviews,
          }
        : overviewResult.overview
    );
    setRecentPending(overviewResult.recentPending || []);
  }, []);

  const loadSection = useCallback(
    async (tab, { force = false, background = false } = {}) => {
      const controller = new AbortController();

      if (background) {
        backgroundAbortRef.current?.abort();
        backgroundAbortRef.current = controller;
      } else {
        abortRef.current?.abort();
        abortRef.current = controller;
        setLoading(true);
        setError("");
      }

      try {
        if (tab === "referrals") {
          if (!background) setLoading(false);
          return;
        }

        if (tab === "overview") {
          await loadOverviewBundle(controller.signal);
        }

        if (tab === "subscriptions") {
          const result = await fetchFinancialCenterSection(adminFetch, "subscriptions", {
            signal: controller.signal,
            query: {
              page: String(subscriptionPagination.page),
              search,
              status: filters.status,
              service: filters.service,
              source: filters.source,
              paid: filters.paid,
            },
          });
          setSubscriptions(result.items || []);
          setSubscriptionPagination(result.pagination || subscriptionPagination);
        }

        if (tab === "payment-reviews") {
          const result = await fetchFinancialCenterSection(adminFetch, "payment-reviews", {
            signal: controller.signal,
            query: {
              page: String(paymentPagination.page),
              search,
              reviewStatus,
            },
          });
          setPaymentReviews(result.items || []);
          setPaymentPagination(result.pagination || paymentPagination);
        }

        if (tab === "revenue") {
          const result = await fetchFinancialCenterSection(adminFetch, "revenue", {
            signal: controller.signal,
            query: { period: revenuePeriod },
          });
          setRevenueReport(result.report || null);
        }
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (background) throw err;
        setError(err?.message || "تعذر تحميل المركز المالي");
      } finally {
        if (!controller.signal.aborted && !background) setLoading(false);
      }
    },
    [filters, loadOverviewBundle, paymentPagination.page, revenuePeriod, reviewStatus, search, subscriptionPagination.page]
  );

  useEffect(() => {
    void loadSection(activeTab, { force: true });
    return () => abortRef.current?.abort();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "overview") return;
    void loadSection("overview", { force: true });
  }, [overviewPeriod]);

  useEffect(() => {
    if (activeTab !== "subscriptions") return;
    void loadSection("subscriptions", { force: true });
  }, [filters, search, subscriptionPagination.page]);

  useEffect(() => {
    if (activeTab !== "payment-reviews") return;
    void loadSection("payment-reviews", { force: true });
  }, [reviewStatus, search, paymentPagination.page]);

  useEffect(() => {
    if (activeTab !== "revenue") return;
    void loadSection("revenue", { force: true });
  }, [revenuePeriod]);

  const handleExport = async () => {
    const section =
      activeTab === "overview" ? "revenue" : activeTab === "referrals" ? null : activeTab;
    if (!section) return;

    try {
      const query =
        section === "subscriptions"
          ? { export: "csv", search, status: filters.status, service: filters.service, source: filters.source, paid: filters.paid }
          : section === "payment-reviews"
          ? { export: "csv", search, reviewStatus }
          : { export: "csv", period: activeTab === "overview" ? selectedPeriod.revenuePeriod : revenuePeriod };

      const result = await fetchFinancialCenterSection(adminFetch, section, { query });
      if (result.csvBlob) downloadCsvBlob(result.csvBlob, `financial-${section}.csv`);
    } catch (err) {
      setError(err?.message || "تعذر التصدير");
    }
  };

  const openProof = async (requestId, context = {}) => {
    setProofLoadingId(String(requestId));
    try {
      const proof = await fetchPaymentProof(adminFetch, requestId);
      setProofPreview({ ...context, ...proof });
    } catch (err) {
      setError(err?.message || "تعذر تحميل إثبات الدفع");
    } finally {
      setProofLoadingId("");
    }
  };

  const applyPaymentReviewStatusUpdate = useCallback((requestId, nextReviewStatus, nextRawStatus = "") => {
    const normalizedRequestId = String(requestId || "").trim();
    setPaymentReviews((current) =>
      current.map((item) =>
        String(item.requestId) === normalizedRequestId
          ? {
              ...item,
              status: nextReviewStatus,
              rawStatus: nextRawStatus || item.rawStatus,
            }
          : item
      )
    );
    setRecentPending((current) =>
      current.filter((item) => String(item.requestId || item.id) !== normalizedRequestId)
    );
    if (nextReviewStatus === PAYMENT_REVIEW_STATUSES.PENDING_REVIEW) return;
    setOverview((current) =>
      current
        ? {
            ...current,
            pendingReviews: Math.max(0, Number(current.pendingReviews || 0) - 1),
          }
        : current
    );
  }, []);

  const refreshFinancialSections = useCallback(async () => {
    try {
      await loadSection("payment-reviews", { force: true, background: true });
      await refreshPendingOverviewCount(backgroundAbortRef.current?.signal);
    } catch (refreshError) {
      setRefreshWarning("تمت العملية، لكن تعذر تحديث البيانات تلقائيًا.");
      return { ok: false, message: refreshError?.message || String(refreshError) };
    }
    setRefreshWarning("");
    return { ok: true };
  }, [loadSection, refreshPendingOverviewCount]);

  const handleActivatePaymentReview = (item) => {
    setActivateApiError("");
    setActivateTarget(mapPaymentReviewToSubscriptionRequest(item));
  };

  const confirmActivatePaymentReview = async () => {
    const request = activateTarget;
    if (!request?.id) return;

    const actionKey = `subscription:${request.id}:activate`;
    setActivateLoading(true);
    setActivateApiError("");
    setActionLoadingId(`${request.id}:activate`);

    const flowResult = await runAdminUserActionFlow({
      actionKey,
      inFlightRegistry: subscriptionActionInFlightRef.current,
      execute: async () => postSubscriptionActivateViaDashboard(adminFetch, request),
      refresh: refreshFinancialSections,
      successMessage: "تم تفعيل الاشتراك",
      errorMessage: "تعذر تفعيل طلب الاشتراك",
      onSuccess: () => {
        applyPaymentReviewStatusUpdate(request.id, PAYMENT_REVIEW_STATUSES.CONFIRMED, "مفعل");
        dispatchAdminSubscriptionUpdatedEvent({
          requestId: request.id,
          userEmail: request.userEmail,
          previousStatus: request.status,
          newStatus: "مفعل",
          source: "financial-center",
        });
        setActivateTarget(null);
        setActionNotice("تم تفعيل الاشتراك");
      },
    });

    setActivateLoading(false);
    setActionLoadingId("");

    if (flowResult.blocked) return;

    if (!flowResult.success) {
      if (flowResult.error?.status === 409) {
        setActivateApiError("تم تغيير حالة الطلب من نافذة أخرى.");
        void refreshFinancialSections();
        return;
      }
      const message =
        flowResult.error?.message || flowResult.errorMessage || "تعذر تفعيل طلب الاشتراك";
      setActivateApiError(message);
      return;
    }

    if (flowResult.refreshFailed) {
      setRefreshWarning("تمت العملية، لكن تعذر تحديث البيانات تلقائيًا.");
    }
  };

  const handleRejectPaymentReview = (item) => {
    setRejectApiError("");
    setRejectTarget(mapPaymentReviewToSubscriptionRequest(item));
  };

  const confirmRejectPaymentReview = async ({ reasonLabel, notes }) => {
    const request = rejectTarget;
    if (!request?.id) return;

    const actionKey = `subscription:${request.id}:reject`;
    setRejectLoading(true);
    setRejectApiError("");
    setActionLoadingId(`${request.id}:reject`);

    const flowResult = await runAdminUserActionFlow({
      actionKey,
      inFlightRegistry: subscriptionActionInFlightRef.current,
      execute: async () =>
        postSubscriptionRejectViaApi(adminFetch, request.id, {
          rejectionReason: reasonLabel,
          rejectionNotes: notes,
        }),
      refresh: refreshFinancialSections,
      successMessage: "تم رفض طلب الاشتراك",
      errorMessage: "تعذر رفض طلب الاشتراك",
      onSuccess: () => {
        applyPaymentReviewStatusUpdate(request.id, PAYMENT_REVIEW_STATUSES.REJECTED, "مرفوض");
        dispatchAdminSubscriptionUpdatedEvent({
          requestId: request.id,
          userEmail: request.userEmail,
          previousStatus: request.status,
          newStatus: "مرفوض",
          source: "financial-center",
        });
        setRejectTarget(null);
        setActionNotice("تم رفض طلب الاشتراك");
      },
    });

    setRejectLoading(false);
    setActionLoadingId("");

    if (flowResult.blocked) return;

    if (!flowResult.success) {
      if (flowResult.error?.status === 409) {
        setRejectApiError("تم تغيير حالة الطلب من نافذة أخرى.");
        void refreshFinancialSections();
        return;
      }
      const message =
        flowResult.error?.message || flowResult.errorMessage || "تعذر رفض طلب الاشتراك";
      setRejectApiError(message);
      return;
    }

    if (flowResult.refreshFailed) {
      setRefreshWarning("تمت العملية، لكن تعذر تحديث البيانات تلقائيًا.");
    }
  };

  const openSubscriptionRequest = useCallback(
    (item) => {
      router.push(buildSubscriptionOpenHref(item?.requestId || item?.id));
    },
    [router]
  );

  useEffect(() => {
    return subscribeAdminSubscriptionUpdated((event) => {
      if (event.detail?.source === "financial-center") return;
      void refreshFinancialSections();
    });
  }, [refreshFinancialSections]);

  const overviewKpis = useMemo(() => {
    if (!overview) return [];
    return [
      { key: "today", label: "إيرادات اليوم", value: formatCurrencyTotals(overview.recognizedRevenueToday) },
      { key: "month", label: "إيرادات هذا الشهر", value: formatCurrencyTotals(overview.recognizedRevenueMonth) },
      { key: "year", label: "إيرادات هذه السنة", value: formatCurrencyTotals(overview.recognizedRevenueYear) },
      { key: "total", label: "إجمالي الإيرادات", value: formatCurrencyTotals(overview.recognizedRevenueTotal) },
      { key: "active", label: "الاشتراكات النشطة", value: (overview.activeSubscriptions || 0).toLocaleString("ar") },
      { key: "pending", label: "بانتظار المراجعة", value: (overview.pendingReviews || 0).toLocaleString("ar") },
    ];
  }, [overview]);

  return (
    <section className={`admin-financial-dashboard ${standalone ? "admin-financial-dashboard--standalone" : ""}`}>
      <header className="admin-financial-dashboard__header admin-section">
        <div className="admin-financial-dashboard__header-main">
          <div>
            <p className="admin-financial-dashboard__eyebrow">HasaN CharT · Finance</p>
            <h1 className="admin-heading text-3xl">المركز المالي</h1>
            <p className="admin-financial-dashboard__subtitle">
              أرقام تقديرية مبنية على الاشتراكات المفعلة يدوياً — ليست سجل معاملات مصرفية.
            </p>
          </div>
          <div className="admin-financial-dashboard__header-actions">
            <button type="button" className="admin-financial-action-button admin-financial-action-button--secondary px-4 py-2" onClick={() => void loadSection(activeTab, { force: true })}>
              تحديث
            </button>
            <button type="button" className="admin-financial-action-button admin-financial-action-button--primary px-4 py-2" onClick={() => void handleExport()}>
              تصدير CSV
            </button>
          </div>
        </div>

        {activeTab === "overview" ? (
          <div className="admin-financial-period-filters">
            {PERIOD_OPTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`admin-filter-btn ${overviewPeriod === item.id ? "admin-filter-btn--active" : "admin-filter-btn--idle"}`}
                onClick={() => setOverviewPeriod(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="admin-financial-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`admin-financial-tabs__btn ${activeTab === tab.id ? "is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <div className="admin-section admin-financial-dashboard__error">
          <p className="font-black text-red-700">{error}</p>
          <button type="button" className="admin-financial-action-button admin-financial-action-button--primary mt-4 px-5 py-3" onClick={() => void loadSection(activeTab, { force: true })}>
            إعادة المحاولة
          </button>
        </div>
      ) : null}

      {refreshWarning ? (
        <div className="admin-section admin-financial-dashboard__warning">
          <p className="font-bold text-amber-700">{refreshWarning}</p>
          <button
            type="button"
            className="admin-financial-action-button admin-financial-action-button--secondary mt-3 px-4 py-2"
            onClick={() => void refreshFinancialSections()}
          >
            تحديث القسم
          </button>
        </div>
      ) : null}

      {actionNotice ? (
        <div className="admin-section admin-financial-dashboard__notice">
          <p className="font-bold text-emerald-700">{actionNotice}</p>
        </div>
      ) : null}

      {activeTab === "overview" ? (
        <div className="admin-financial-dashboard__content space-y-4">
          {loading && !overview ? (
            <SectionSkeleton rows={8} />
          ) : overview ? (
            <>
              <div className="admin-financial-kpi-grid admin-financial-kpi-grid--premium admin-animate-in">
                {overviewKpis.map((card) => (
                  <KpiCard
                    key={card.key}
                    kpiKey={card.key}
                    label={card.label}
                    value={card.value}
                    description={FINANCIAL_KPI_DESCRIPTIONS[card.key]}
                    hint="تقديري — اشتراكات مفعلة يدوياً"
                    status={card.key === "pending" && Number(overview.pendingReviews || 0) > 0 ? "attention" : "stable"}
                    onClick={
                      card.key === "pending"
                        ? () => setActiveTab("payment-reviews")
                        : card.key === "active"
                        ? () => setActiveTab("subscriptions")
                        : undefined
                    }
                  />
                ))}
              </div>

              {!overview.revenueScanComplete ? (
                <p className="admin-financial-note">تم حساب الإيرادات من {overview.revenueScannedRows || 0} سجل نشط.</p>
              ) : null}

              <div className="admin-financial-dashboard__grid admin-financial-dashboard__grid--charts">
                <article className="admin-section admin-financial-panel">
                  <h2 className="admin-heading text-lg">منحنى الإيرادات</h2>
                  <p className="admin-financial-panel__subtitle">Area Chart — تقديري</p>
                  <RevenueLineChart daily={chartReport?.daily || []} period={overviewPeriod} />
                </article>
                <article className="admin-section admin-financial-panel">
                  <h2 className="admin-heading text-lg">توزيع الإيرادات</h2>
                  <p className="admin-financial-panel__subtitle">Donut Chart — حسب الخدمة</p>
                  <RevenueDonutChart revenueByService={overview.revenueByService} />
                </article>
                <article className="admin-section admin-financial-panel md:col-span-2">
                  <h2 className="admin-heading text-lg">الإيرادات حسب الخدمة</h2>
                  <p className="admin-financial-panel__subtitle">Bar Chart</p>
                  <ServiceRevenueBars revenueByService={overview.revenueByService} />
                </article>
              </div>

              <div className="admin-financial-dashboard__grid">
                <article className="admin-section admin-financial-panel">
                  <div className="admin-financial-panel__head">
                    <h2 className="admin-heading text-lg">آخر الاشتراكات المفعلة</h2>
                    <button type="button" className="admin-user-manage-btn" onClick={() => setActiveTab("subscriptions")}>
                      عرض الكل
                    </button>
                  </div>
                  <div className="admin-financial-op-grid mt-4">
                    {recentActive.length === 0 ? (
                      <ChartEmptyState icon="💳" title="لا توجد اشتراكات حديثة" desc="ستظهر آخر الاشتراكات المفعلة هنا." />
                    ) : (
                      recentActive.map((item) => (
                        <RecentOpCard
                          key={item.id}
                          title={item.username || item.userEmail || "مستخدم"}
                          subtitle={item.plan}
                          meta={`${item.priceRaw || "—"} · ${item.startedAt ? new Date(item.startedAt).toLocaleDateString("ar") : "—"}`}
                          badge="مفعّل"
                          onAction={item.userId ? () => openUser(item.userId) : undefined}
                          actionLabel={item.userId ? "CRM" : undefined}
                        />
                      ))
                    )}
                  </div>
                </article>

                <article className="admin-section admin-financial-panel">
                  <div className="admin-financial-panel__head">
                    <h2 className="admin-heading text-lg">طلبات الدفع قيد المراجعة</h2>
                    <button type="button" className="admin-financial-action-button admin-financial-action-button--secondary" onClick={() => setActiveTab("payment-reviews")}>
                      عرض الكل
                    </button>
                  </div>
                  <p className="admin-financial-warning mt-2">وجود إثبات دفع لا يعني أن العملية مؤكدة.</p>
                  <div className="admin-financial-op-grid mt-4">
                    {recentPending.length === 0 ? (
                      <ChartEmptyState icon="🧾" title="لا توجد طلبات معلقة" desc="ستظهر إثباتات الدفع قيد المراجعة هنا." />
                    ) : (
                      recentPending.map((item) => (
                        <RecentOpCard
                          key={item.id}
                          title={item.username || item.userEmail || "مستخدم"}
                          subtitle={item.plan}
                          meta={`${item.priceRaw || "—"} · ${formatPaymentReviewStatusLabel(item.status)}`}
                          badge="مراجعة"
                          onAction={
                            item.paymentProofAvailable
                              ? () =>
                                  void openProof(item.requestId || item.id, {
                                    username: item.username,
                                    userEmail: item.userEmail,
                                    planName: item.plan,
                                    priceRaw: item.priceRaw,
                                    status: item.status,
                                  })
                              : undefined
                          }
                          actionLabel={
                            item.paymentProofAvailable
                              ? proofLoadingId === String(item.requestId || item.id)
                                ? "..."
                                : "عرض الإثبات"
                              : undefined
                          }
                        />
                      ))
                    )}
                  </div>
                </article>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {activeTab === "subscriptions" ? (
        <div className="admin-section admin-financial-panel space-y-4">
          <div className="admin-user-filters-grid">
            <input className="admin-field" placeholder="بحث..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="admin-field" value={filters.status} onChange={(e) => setFilters((c) => ({ ...c, status: e.target.value }))}>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select className="admin-field" value={filters.service} onChange={(e) => setFilters((c) => ({ ...c, service: e.target.value }))}>
              {SERVICE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          {loading ? <SectionSkeleton /> : subscriptions.length === 0 ? (
            <p className="text-center font-bold text-slate-500">لا توجد اشتراكات مطابقة</p>
          ) : (
            <div className="admin-table-wrap overflow-x-auto">
              <table className="admin-user-table">
                <thead>
                  <tr>
                    <th>المستخدم</th>
                    <th>الخدمة</th>
                    <th>الحالة</th>
                    <th>السعر</th>
                    <th>البداية</th>
                    <th>الانتهاء</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((item) => (
                    <tr key={item.id}>
                      <td>{item.username || item.userEmail}</td>
                      <td>{item.service}</td>
                      <td>{item.status}</td>
                      <td>{item.priceRaw}</td>
                      <td>{item.startedAt ? new Date(item.startedAt).toLocaleDateString("ar") : "—"}</td>
                      <td>{item.expiresAt ? new Date(item.expiresAt).toLocaleDateString("ar") : "—"}</td>
                      <td>
                        {item.userId ? (
                          <button type="button" className="admin-financial-action-button admin-financial-action-button--secondary" onClick={() => openUser(item.userId)}>
                            CRM
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "payment-reviews" ? (
        <div className="admin-section admin-financial-panel space-y-4">
          <p className="admin-financial-warning">وجود إثبات دفع لا يعني أن العملية مؤكدة.</p>
          <div className="flex flex-wrap gap-2">
            <input className="admin-field" placeholder="بحث..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="admin-field" value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value)}>
              <option value="all">كل المراجعات</option>
              <option value="pending_review">بانتظار المراجعة</option>
              <option value="confirmed">مؤكد</option>
              <option value="rejected">مرفوض</option>
            </select>
          </div>
          {loading && paymentReviews.length === 0 ? <SectionSkeleton /> : paymentReviews.length === 0 ? (
            <p className="text-center font-bold text-slate-500">لا توجد إثباتات دفع</p>
          ) : (
            <div className="admin-table-wrap overflow-x-auto">
              <table className="admin-user-table">
                <thead>
                  <tr>
                    <th>المستخدم</th>
                    <th>الخطة</th>
                    <th>السعر</th>
                    <th>حالة المراجعة</th>
                    <th>الإرسال</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentReviews.map((item) => (
                    <tr key={item.id}>
                      <td>{item.username || item.userEmail}</td>
                      <td>{item.plan}</td>
                      <td>{item.priceRaw}</td>
                      <td>{formatPaymentReviewStatusLabel(item.status)}</td>
                      <td>{item.submittedAt ? new Date(item.submittedAt).toLocaleDateString("ar") : "—"}</td>
                      <td>
                        <PaymentReviewActions
                          item={item}
                          proofLoadingId={proofLoadingId}
                          actionLoadingId={actionLoadingId}
                          onOpenProof={(row) =>
                            void openProof(row.requestId, {
                              username: row.username,
                              userEmail: row.userEmail,
                              planName: row.plan,
                              priceRaw: row.priceRaw,
                              status: row.status,
                            })
                          }
                          onActivate={handleActivatePaymentReview}
                          onReject={handleRejectPaymentReview}
                          onOpenSubscription={openSubscriptionRequest}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "revenue" ? (
        <div className="admin-section admin-financial-panel space-y-4">
          <div className="admin-financial-period-filters">
            {PERIOD_OPTIONS.filter((item) => item.id !== "today").map((item) => (
              <button
                key={item.id}
                type="button"
                className={`admin-filter-btn ${revenuePeriod === item.revenuePeriod ? "admin-filter-btn--active" : "admin-filter-btn--idle"}`}
                onClick={() => setRevenuePeriod(item.revenuePeriod)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {loading && !revenueReport ? (
            <SectionSkeleton />
          ) : revenueReport ? (
            <>
              <p className="admin-financial-note">{revenueReport.disclaimer}</p>
              <div className="admin-financial-kpi-grid">
                <KpiCard label="اليوم" value={formatCurrencyTotals(revenueReport.recognizedRevenueToday)} />
                <KpiCard label="الأسبوع" value={formatCurrencyTotals(revenueReport.recognizedRevenueWeek)} />
                <KpiCard label="الشهر" value={formatCurrencyTotals(revenueReport.recognizedRevenueMonth)} />
                <KpiCard label="السنة" value={formatCurrencyTotals(revenueReport.recognizedRevenueYear)} />
                <KpiCard label="الإجمالي" value={formatCurrencyTotals(revenueReport.recognizedRevenueTotal)} />
              </div>
              <article className="admin-section admin-financial-panel">
                <h2 className="admin-heading text-lg">منحنى الإيرادات</h2>
                <RevenueLineChart daily={revenueReport.daily || []} period={revenuePeriod} />
              </article>
              <div className="admin-table-wrap overflow-x-auto">
                <table className="admin-user-table">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>مفعّلة</th>
                      <th>USD</th>
                      <th>USDT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueReport.daily.map((row) => (
                      <tr key={row.date}>
                        <td>{row.date}</td>
                        <td>{row.activatedCount}</td>
                        <td>{row.revenue.USD}</td>
                        <td>{row.revenue.USDT}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {activeTab === "referrals" ? (
        <article className="admin-section admin-financial-panel">
          <h2 className="admin-heading text-2xl">الإحالات والسحوبات</h2>
          <p className="mt-3 max-w-2xl text-sm font-bold leading-7 text-slate-500">
            عرض read-only — لإدارة الشركاء والسحوبات استخدم صفحة الشركاء.
          </p>
          <Link href="/admin/partners" className="admin-hub-card__cta mt-6 inline-flex">
            فتح إدارة الشركاء والسحوبات
          </Link>
        </article>
      ) : null}

      <AdminPaymentProofModal proof={proofPreview} onClose={() => setProofPreview(null)} />

      <SubscriptionActivateConfirmModal
        request={activateTarget}
        loading={activateLoading}
        apiError={activateApiError}
        onCancel={() => {
          if (!activateLoading) {
            setActivateTarget(null);
            setActivateApiError("");
          }
        }}
        onConfirm={() => void confirmActivatePaymentReview()}
      />

      <SubscriptionRejectModal
        request={rejectTarget}
        loading={rejectLoading}
        apiError={rejectApiError}
        onCancel={() => {
          if (!rejectLoading) {
            setRejectTarget(null);
            setRejectApiError("");
          }
        }}
        onConfirm={confirmRejectPaymentReview}
      />
    </section>
  );
}
