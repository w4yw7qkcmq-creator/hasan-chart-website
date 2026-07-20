"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminFetch } from "../../../../lib/admin-fetch";
import {
  downloadCsvBlob,
  fetchFinancialCenterSection,
  fetchPaymentProof,
  formatCurrencyTotals,
} from "../../../../lib/admin-financial-center-client";

const TABS = [
  { id: "overview", label: "نظرة عامة", icon: "📊" },
  { id: "subscriptions", label: "الاشتراكات", icon: "💳" },
  { id: "payment-reviews", label: "إثباتات الدفع", icon: "🧾" },
  { id: "revenue", label: "الإيرادات", icon: "📈" },
  { id: "referrals", label: "الإحالات والسحوبات", icon: "🤝", future: true },
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
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-14 rounded-2xl bg-white/10" />
      ))}
    </div>
  );
}

function CurrencyCard({ title, totals, onClick }) {
  return (
    <button type="button" className="admin-financial-stat" onClick={onClick}>
      <p className="admin-financial-stat__label">{title}</p>
      <p className="admin-financial-stat__value">{formatCurrencyTotals(totals)}</p>
      <p className="admin-financial-stat__hint">إيرادات تقديرية معترف بها</p>
    </button>
  );
}

function ProofModal({ proof, onClose }) {
  if (!proof || typeof document === "undefined") return null;

  const isInline = proof.isInline && String(proof.proof || "").startsWith("data:image");

  return createPortal(
    <div className="admin-financial-proof-modal" role="presentation">
      <button type="button" className="admin-financial-proof-modal__backdrop" onClick={onClose} aria-label="إغلاق" />
      <div className="admin-financial-proof-modal__panel" role="dialog" aria-modal="true">
        <div className="admin-financial-proof-modal__head">
          <div>
            <p className="admin-user-hero__eyebrow">معاينة إثبات الدفع</p>
            <h3 className="admin-heading text-xl">{proof.planName || "طلب اشتراك"}</h3>
            <p className="text-sm font-bold text-amber-200/90">
              وجود إثبات دفع لا يعني أن العملية مؤكدة.
            </p>
          </div>
          <button type="button" className="admin-btn-surface px-4 py-2" onClick={onClose}>
            إغلاق
          </button>
        </div>
        <div className="admin-financial-proof-modal__body">
          {isInline ? (
            <Image
              src={proof.proof}
              alt="إثبات الدفع"
              width={900}
              height={700}
              unoptimized
              className="max-h-[70vh] w-full rounded-2xl object-contain"
            />
          ) : (
            <a href={proof.proof} target="_blank" rel="noopener noreferrer" className="admin-user-manage-btn">
              فتح رابط إثبات الدفع
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function FinancialCenterPanel({ onNavigateTab, onOpenUser, standalone = false }) {
  const router = useRouter();

  const openUser = useCallback(
    (userId) => {
      if (!userId) return;
      if (standalone || !onOpenUser) {
        router.push(`/admin/users/${encodeURIComponent(userId)}`);
        return;
      }
      onOpenUser(userId);
    },
    [onOpenUser, router, standalone]
  );
  const [activeTab, setActiveTab] = useState("overview");
  const [overview, setOverview] = useState(null);
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
  const [filters, setFilters] = useState({
    status: "all",
    service: "all",
    source: "all",
    paid: "all",
  });
  const [reviewStatus, setReviewStatus] = useState("all");
  const [revenuePeriod, setRevenuePeriod] = useState("30d");

  const abortRef = useRef(null);
  const loadedTabsRef = useRef(new Set());

  const loadSection = useCallback(
    async (tab, { force = false } = {}) => {
      if (!force && loadedTabsRef.current.has(tab)) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError("");

      try {
        if (tab === "referrals") {
          if (controller.signal.aborted) return;
          loadedTabsRef.current.add(tab);
          setLoading(false);
          return;
        }

        if (tab === "overview") {
          const result = await fetchFinancialCenterSection(adminFetch, "overview", { signal: controller.signal });
          if (controller.signal.aborted) return;
          setOverview(result.overview);
          setRecentActive(result.recentActive || []);
          setRecentPending(result.recentPending || []);
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
          if (controller.signal.aborted) return;
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
          if (controller.signal.aborted) return;
          setPaymentReviews(result.items || []);
          setPaymentPagination(result.pagination || paymentPagination);
        }

        if (tab === "revenue") {
          const result = await fetchFinancialCenterSection(adminFetch, "revenue", {
            signal: controller.signal,
            query: { period: revenuePeriod },
          });
          if (controller.signal.aborted) return;
          setRevenueReport(result.report || null);
        }

        loadedTabsRef.current.add(tab);
      } catch (err) {
        if (err?.name === "AbortError") return;
        setError(err?.message || "تعذر تحميل المركز المالي");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [filters, paymentPagination.page, revenuePeriod, reviewStatus, search, subscriptionPagination.page]
  );

  useEffect(() => {
    void loadSection(activeTab, { force: true });
    return () => abortRef.current?.abort();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "subscriptions") return;
    loadedTabsRef.current.delete("subscriptions");
    void loadSection("subscriptions", { force: true });
  }, [filters, search, subscriptionPagination.page]);

  useEffect(() => {
    if (activeTab !== "payment-reviews") return;
    loadedTabsRef.current.delete("payment-reviews");
    void loadSection("payment-reviews", { force: true });
  }, [reviewStatus, search, paymentPagination.page]);

  useEffect(() => {
    if (activeTab !== "revenue") return;
    loadedTabsRef.current.delete("revenue");
    void loadSection("revenue", { force: true });
  }, [revenuePeriod]);

  const handleExport = async (section) => {
    try {
      const query =
        section === "subscriptions"
          ? { export: "csv", search, status: filters.status, service: filters.service, source: filters.source, paid: filters.paid }
          : section === "payment-reviews"
          ? { export: "csv", search, reviewStatus }
          : { export: "csv", period: revenuePeriod };

      const result = await fetchFinancialCenterSection(adminFetch, section, { query });
      if (result.csvBlob) {
        downloadCsvBlob(result.csvBlob, `financial-${section}.csv`);
      }
    } catch (err) {
      setError(err?.message || "تعذر التصدير");
    }
  };

  const openProof = async (requestId) => {
    setProofLoadingId(String(requestId));
    try {
      const proof = await fetchPaymentProof(adminFetch, requestId);
      setProofPreview(proof);
    } catch (err) {
      setError(err?.message || "تعذر تحميل إثبات الدفع");
    } finally {
      setProofLoadingId("");
    }
  };

  const overviewCards = useMemo(() => {
    if (!overview) return [];
    return [
      { key: "today", label: "اليوم", totals: overview.recognizedRevenueToday, filter: { tab: "revenue" } },
      { key: "week", label: "هذا الأسبوع", totals: overview.recognizedRevenueWeek, filter: { tab: "revenue" } },
      { key: "month", label: "هذا الشهر", totals: overview.recognizedRevenueMonth, filter: { tab: "revenue" } },
      { key: "year", label: "هذه السنة", totals: overview.recognizedRevenueYear, filter: { tab: "revenue" } },
      { key: "total", label: "الإجمالي", totals: overview.recognizedRevenueTotal, filter: { tab: "revenue" } },
    ];
  }, [overview]);

  return (
    <section className="space-y-5">
      <div className="admin-section p-5 md:p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <p className="admin-user-hero__eyebrow">Financial Center · Phase 1</p>
            <h2 className="admin-heading text-3xl">💰 المركز المالي</h2>
            <p className="mt-2 text-sm font-bold text-slate-500">
              {overview?.disclaimer ||
                "هذه الأرقام مبنية على الاشتراكات المفعلة يدويًا وليست سجل معاملات دفع مصرفي."}
            </p>
          </div>
          <button
            type="button"
            className="admin-btn-surface px-4 py-2"
            onClick={() => {
              loadedTabsRef.current.clear();
              void loadSection(activeTab, { force: true });
            }}
          >
            تحديث
          </button>
        </div>

        <div className="admin-financial-tabs mt-5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`admin-financial-tabs__btn ${activeTab === tab.id ? "is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span aria-hidden="true">{tab.icon}</span> {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="admin-section p-5 text-center">
          <p className="font-black text-red-200">{error}</p>
          <button type="button" className="admin-btn-surface mt-4 px-5 py-3" onClick={() => void loadSection(activeTab, { force: true })}>
            إعادة المحاولة
          </button>
        </div>
      ) : null}

      {activeTab === "overview" ? (
        <div className="space-y-5">
          {loading && !overview ? (
            <SectionSkeleton rows={6} />
          ) : overview ? (
            <>
              <div className="admin-financial-stats-grid">
                {overviewCards.map((card) => (
                  <CurrencyCard
                    key={card.key}
                    title={card.label}
                    totals={card.totals}
                    onClick={() => setActiveTab("revenue")}
                  />
                ))}
                <button type="button" className="admin-financial-stat" onClick={() => setActiveTab("subscriptions")}>
                  <p className="admin-financial-stat__label">اشتراكات نشطة</p>
                  <p className="admin-financial-stat__value">{overview.activeSubscriptions?.toLocaleString("ar") || 0}</p>
                </button>
                <button type="button" className="admin-financial-stat" onClick={() => setActiveTab("payment-reviews")}>
                  <p className="admin-financial-stat__label">بانتظار المراجعة</p>
                  <p className="admin-financial-stat__value">{overview.pendingReviews?.toLocaleString("ar") || 0}</p>
                </button>
                <button type="button" className="admin-financial-stat" onClick={() => setActiveTab("subscriptions")}>
                  <p className="admin-financial-stat__label">منتهية</p>
                  <p className="admin-financial-stat__value">{overview.expiredSubscriptions?.toLocaleString("ar") || 0}</p>
                </button>
                <button type="button" className="admin-financial-stat" onClick={() => setActiveTab("subscriptions")}>
                  <p className="admin-financial-stat__label">مجانية</p>
                  <p className="admin-financial-stat__value">{overview.complimentarySubscriptions?.toLocaleString("ar") || 0}</p>
                </button>
                <button type="button" className="admin-financial-stat" onClick={() => setActiveTab("subscriptions")}>
                  <p className="admin-financial-stat__label">أسعار غير قابلة للتحليل</p>
                  <p className="admin-financial-stat__value">{overview.unparseablePriceCount?.toLocaleString("ar") || 0}</p>
                </button>
              </div>

              {!overview.revenueScanComplete ? (
                <p className="text-xs font-bold text-amber-200/90">
                  تم حساب الإيرادات من عينة {overview.revenueScannedRows || 0} سجل نشط.
                </p>
              ) : null}

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="admin-section p-5">
                  <h3 className="admin-heading text-lg">توزيع الإيرادات حسب الخدمة</h3>
                  <div className="mt-4 space-y-2">
                    {Object.entries(overview.revenueByService || {}).map(([service, totals]) => (
                      <div key={service} className="admin-financial-bar-row">
                        <span>{service}</span>
                        <span>{formatCurrencyTotals(totals)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="admin-section p-5">
                  <h3 className="admin-heading text-lg">توزيع الاشتراكات حسب الحالة</h3>
                  <div className="mt-4 space-y-2">
                    {Object.entries(overview.subscriptionsByStatus || {}).map(([status, count]) => (
                      <div key={status} className="admin-financial-bar-row">
                        <span>{status}</span>
                        <span>{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="admin-section p-5">
                  <h3 className="admin-heading text-lg">آخر 5 اشتراكات مفعلة</h3>
                  <div className="mt-4 space-y-2">
                    {recentActive.map((item) => (
                      <div key={item.id} className="admin-financial-list-item">
                        <div>
                          <p className="font-black">{item.username || item.userEmail}</p>
                          <p className="text-xs text-slate-500">{item.plan}</p>
                        </div>
                        <button type="button" className="admin-user-manage-btn" onClick={() => openUser(item.userId)}>
                          CRM
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="admin-section p-5">
                  <h3 className="admin-heading text-lg">آخر 5 طلبات تنتظر المراجعة</h3>
                  <div className="mt-4 space-y-2">
                    {recentPending.map((item) => (
                      <div key={item.id} className="admin-financial-list-item">
                        <div>
                          <p className="font-black">{item.username || item.userEmail}</p>
                          <p className="text-xs text-slate-500">{item.priceRaw}</p>
                        </div>
                        <button type="button" className="admin-btn-surface px-3 py-2 text-xs" onClick={() => onNavigateTab?.("subscriptions")}>
                          مراجعة
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {activeTab === "subscriptions" ? (
        <div className="admin-section p-5 space-y-4">
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
            <select className="admin-field" value={filters.paid} onChange={(e) => setFilters((c) => ({ ...c, paid: e.target.value }))}>
              <option value="all">الكل</option>
              <option value="paid">مدفوع</option>
              <option value="complimentary">مجاني</option>
              <option value="unparseable">غير قابل للتحليل</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="button" className="admin-btn-surface px-4 py-2" onClick={() => void handleExport("subscriptions")}>
              تصدير CSV
            </button>
          </div>
          {loading ? (
            <SectionSkeleton />
          ) : subscriptions.length === 0 ? (
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
                    <th>المبلغ</th>
                    <th>المصدر</th>
                    <th>البداية</th>
                    <th>الانتهاء</th>
                    <th>إثبات</th>
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
                      <td>{item.priceAmount ?? "—"} {item.currency || ""}</td>
                      <td>{item.source}</td>
                      <td>{item.startedAt ? new Date(item.startedAt).toLocaleDateString("ar") : "—"}</td>
                      <td>{item.expiresAt ? new Date(item.expiresAt).toLocaleDateString("ar") : "—"}</td>
                      <td>{item.paymentProofAvailable ? "نعم" : "لا"}</td>
                      <td>
                        {item.userId ? (
                          <button type="button" className="admin-user-manage-btn" onClick={() => openUser(item.userId)}>
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
        <div className="admin-section p-5 space-y-4">
          <p className="text-sm font-bold text-amber-200/90">وجود إثبات دفع لا يعني أن العملية مؤكدة.</p>
          <div className="flex flex-wrap gap-2">
            <input className="admin-field" placeholder="بحث..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="admin-field" value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value)}>
              <option value="all">كل المراجعات</option>
              <option value="pending_review">بانتظار المراجعة</option>
              <option value="confirmed">مؤكد</option>
              <option value="rejected">مرفوض</option>
            </select>
            <button type="button" className="admin-btn-surface px-4 py-2" onClick={() => void handleExport("payment-reviews")}>
              تصدير CSV
            </button>
            <button type="button" className="admin-btn-surface px-4 py-2" onClick={() => onNavigateTab?.("subscriptions")}>
              فتح مراجعة الاشتراكات الحالية
            </button>
          </div>
          {loading ? (
            <SectionSkeleton />
          ) : paymentReviews.length === 0 ? (
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
                    <th>التفعيل</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {paymentReviews.map((item) => (
                    <tr key={item.id}>
                      <td>{item.username || item.userEmail}</td>
                      <td>{item.plan}</td>
                      <td>{item.priceRaw}</td>
                      <td>{item.status}</td>
                      <td>{item.submittedAt ? new Date(item.submittedAt).toLocaleDateString("ar") : "—"}</td>
                      <td>{item.confirmedAt ? new Date(item.confirmedAt).toLocaleDateString("ar") : "—"}</td>
                      <td>
                        <button
                          type="button"
                          className="admin-user-manage-btn"
                          disabled={proofLoadingId === String(item.requestId)}
                          onClick={() => void openProof(item.requestId)}
                        >
                          {proofLoadingId === String(item.requestId) ? "..." : "معاينة"}
                        </button>
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
        <div className="admin-section p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "7d", label: "7 أيام" },
              { id: "30d", label: "30 يومًا" },
              { id: "90d", label: "90 يومًا" },
              { id: "year", label: "السنة الحالية" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                className={`admin-filter-btn ${revenuePeriod === item.id ? "admin-filter-btn--active" : "admin-filter-btn--idle"}`}
                onClick={() => setRevenuePeriod(item.id)}
              >
                {item.label}
              </button>
            ))}
            <button type="button" className="admin-btn-surface px-4 py-2" onClick={() => void handleExport("revenue")}>
              تصدير CSV
            </button>
          </div>
          {loading && !revenueReport ? (
            <SectionSkeleton />
          ) : revenueReport ? (
            <>
              <p className="text-sm font-bold text-amber-200/90">{revenueReport.disclaimer}</p>
              <div className="admin-financial-stats-grid">
                <CurrencyCard title="اليوم" totals={revenueReport.recognizedRevenueToday} />
                <CurrencyCard title="الأسبوع" totals={revenueReport.recognizedRevenueWeek} />
                <CurrencyCard title="الشهر" totals={revenueReport.recognizedRevenueMonth} />
                <CurrencyCard title="السنة" totals={revenueReport.recognizedRevenueYear} />
                <CurrencyCard title="الإجمالي" totals={revenueReport.recognizedRevenueTotal} />
              </div>
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
        <div className="admin-section p-6 md:p-8">
          <h3 className="admin-heading text-2xl">الإحالات والسحوبات</h3>
          <p className="mt-3 max-w-2xl text-sm font-bold leading-7 text-slate-500">
            هذا التبويب مخصص لربط بيانات الشركاء والسحوبات بالمركز المالي في مرحلة لاحقة. حاليًا يمكنك
            إدارة الشركاء من صفحة الشركاء دون تغيير منطق العمولات.
          </p>
          <Link href="/admin/partners" className="admin-hub-card__cta mt-6 inline-flex">
            فتح إدارة الشركاء والسحوبات
          </Link>
        </div>
      ) : null}

      <ProofModal proof={proofPreview} onClose={() => setProofPreview(null)} />
    </section>
  );
}
