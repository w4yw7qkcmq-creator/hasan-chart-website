"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../lib/admin-fetch";
import { formatPartnerMoney, WITHDRAWAL_NETWORKS } from "../../../lib/partner-shared";
import StatusBadge from "../../(app)/admin/components/StatusBadge";
import AdminPartnerMarketingCenter from "./AdminPartnerMarketingCenter";
import {
  PartnerAdminShell,
  PartnerAdminHeader,
  PartnerAdminTabs,
  PartnerAdminSection,
  PartnerAdminStatCard,
  PartnerAdminEmptyState,
  PartnerAdminBadge,
  PartnerAdminTable,
  PartnerAdminToolbar,
  PartnerAdminSegmented,
  serviceLabel,
} from "./partner-admin";

const WITHDRAWAL_STATUSES = ["all", "pending", "approved", "rejected", "paid"];

const WITHDRAWAL_STATUS_LABELS = {
  all: "الكل",
  pending: "معلقة",
  approved: "معتمدة",
  rejected: "مرفوضة",
  paid: "مدفوعة",
};

const HUB_TABS = [
  { id: "overview", label: "نظرة عامة" , icon: "📊" },
  { id: "partners", label: "الشركاء" , icon: "🤝" },
  { id: "commissions", label: "العمولات والمكافآت" , icon: "💰" },
  { id: "campaigns", label: "الحملات والمهمات" , icon: "🎯" },
  { id: "withdrawals", label: "السحوبات" , icon: "💳" },
  { id: "fraud", label: "الاحتيال والمراجعة" , icon: "🛡️" },
  { id: "audit", label: "السجل والتدقيق" , icon: "🧾" },
];

const HEALTH_CHECK_LABELS = {
  settings: "إعدادات البرنامج",
  tiers: "مستويات الشركاء",
  commissionRules: "قواعد العمولات",
};


function formatDate(value) {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat("ar", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function patchWithdrawalFromApi(existing, raw) {
  if (!raw) return existing;

  return {
    ...(existing || {}),
    id: raw.id ?? existing?.id,
    partnerId: raw.partner_id ?? existing?.partnerId,
    amount: Number(raw.amount ?? existing?.amount ?? 0),
    currency: raw.currency ?? existing?.currency,
    network: raw.network ?? existing?.network,
    walletAddress: raw.wallet_address ?? existing?.walletAddress,
    status: raw.status ?? existing?.status,
    adminNote: raw.admin_note ?? existing?.adminNote ?? null,
    partnerNote: raw.partner_note ?? existing?.partnerNote ?? null,
    createdAt: raw.created_at ?? existing?.createdAt,
    approvedAt: raw.approved_at ?? existing?.approvedAt ?? null,
    rejectedAt: raw.rejected_at ?? existing?.rejectedAt ?? null,
    paidAt: raw.paid_at ?? existing?.paidAt ?? null,
    partner: existing?.partner ?? null,
  };
}

export default function AdminPartnerCenterHub() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = useMemo(() => {
    const tab = searchParams.get("tab");
    return HUB_TABS.some((item) => item.id === tab) ? tab : "overview";
  }, [searchParams]);

  const setActiveTab = useCallback(
    (tabId) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tabId === "overview") params.delete("tab");
      else params.set("tab", tabId);
      const query = params.toString();
      router.replace(query ? `/admin/partners?${query}` : "/admin/partners", { scroll: false });
    },
    [router, searchParams]
  );

  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [partners, setPartners] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [tiers, setTiers] = useState([]);
  const [tierFilter, setTierFilter] = useState("all");
  const [partnerSearch, setPartnerSearch] = useState("");
  const [withdrawalStatus, setWithdrawalStatus] = useState("pending");
  const [withdrawalNetwork, setWithdrawalNetwork] = useState("all");
  const [withdrawalSearch, setWithdrawalSearch] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [markPaidTarget, setMarkPaidTarget] = useState(null);
  const [markPaidNote, setMarkPaidNote] = useState("");
  const [markPaidProof, setMarkPaidProof] = useState("");
  const [withdrawalActionModal, setWithdrawalActionModal] = useState(null);
  const [withdrawalActionNote, setWithdrawalActionNote] = useState("");
  const [adminAnalytics, setAdminAnalytics] = useState(null);
  const [topPartners, setTopPartners] = useState([]);
  const [healthModalOpen, setHealthModalOpen] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthResult, setHealthResult] = useState(null);
  const [healthError, setHealthError] = useState("");

  const withdrawalsAbortRef = useRef(null);
  const withdrawalsRequestRef = useRef(0);

  const loadPartners = useCallback(async () => {
    const response = await adminFetch("/api/admin/partners", {
      method: "GET",
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result?.success) {
      if (response.status === 429) {
        throw new Error(
          result?.error ||
            "تم إرسال عدد كبير من الطلبات خلال وقت قصير. سنعيد المحاولة بعد لحظات."
        );
      }
      throw new Error(result?.error || "تعذر تحميل بيانات الشركاء");
    }

    setSummary(result.summary || null);
    setPartners(result.partners || []);
    setTiers(result.tiers || []);
  }, []);

  const loadAdminAnalytics = useCallback(async () => {
    const [analyticsRes, topPartnersRes] = await Promise.all([
      adminFetch("/api/admin/partner-analytics", { method: "GET", cache: "no-store" }),
      adminFetch("/api/admin/top-partners?limit=10", { method: "GET", cache: "no-store" }),
    ]);

    const analyticsResult = await analyticsRes.json().catch(() => ({}));
    const topPartnersResult = await topPartnersRes.json().catch(() => ({}));

    if (!analyticsRes.ok || !analyticsResult?.success) {
      throw new Error(analyticsResult?.error || "تعذر تحميل تحليلات الشركاء");
    }

    setAdminAnalytics(analyticsResult.analytics || null);
    setTopPartners(topPartnersResult?.success ? topPartnersResult.partners || [] : []);
  }, []);

  const loadOverviewData = useCallback(async () => {
    setInitialLoading(true);
    setError("");

    try {
      await Promise.all([loadPartners(), loadAdminAnalytics()]);
    } catch (loadError) {
      setError(loadError?.message || "تعذر تحميل لوحة الشركاء");
    } finally {
      setInitialLoading(false);
    }
  }, [loadPartners, loadAdminAnalytics]);

  const loadWithdrawals = useCallback(async () => {
    setWithdrawalsLoading(true);
    withdrawalsAbortRef.current?.abort();
    const controller = new AbortController();
    withdrawalsAbortRef.current = controller;
    const requestId = ++withdrawalsRequestRef.current;

    const params = new URLSearchParams();

    if (withdrawalStatus && withdrawalStatus !== "all") {
      params.set("status", withdrawalStatus);
    }

    if (withdrawalNetwork && withdrawalNetwork !== "all") {
      params.set("network", withdrawalNetwork);
    }

    if (withdrawalSearch.trim()) {
      params.set("search", withdrawalSearch.trim());
    }

    const query = params.toString() ? `?${params.toString()}` : "";

    try {
      const response = await adminFetch(`/api/admin/partner-withdrawals${query}`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));

      if (requestId !== withdrawalsRequestRef.current) return;

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر تحميل طلبات السحب");
      }

      setWithdrawals(result.withdrawals || []);
    } catch (loadError) {
      if (loadError?.name === "AbortError" || requestId !== withdrawalsRequestRef.current) return;
      throw loadError;
    } finally {
      if (requestId === withdrawalsRequestRef.current) {
        setWithdrawalsLoading(false);
      }
    }
  }, [withdrawalStatus, withdrawalNetwork, withdrawalSearch]);

  const refreshWithdrawalSection = useCallback(async () => {
    await Promise.all([loadWithdrawals(), loadPartners()]);
  }, [loadWithdrawals, loadPartners]);

  const applyWithdrawalUpdate = useCallback(
    (withdrawalId, rawWithdrawal) => {
      setWithdrawals((current) => {
        const updated = current.map((item) =>
          item.id === withdrawalId ? patchWithdrawalFromApi(item, rawWithdrawal) : item
        );

        if (withdrawalStatus === "all") {
          return updated;
        }

        const changed = updated.find((item) => item.id === withdrawalId);
        if (changed && changed.status !== withdrawalStatus) {
          return updated.filter((item) => item.id !== withdrawalId);
        }

        return updated;
      });
    },
    [withdrawalStatus]
  );

  useEffect(() => {
    void loadOverviewData();
    return () => {
      withdrawalsRequestRef.current += 1;
      withdrawalsAbortRef.current?.abort();
    };
  }, [loadOverviewData]);

  useEffect(() => {
    if (initialLoading || activeTab !== "withdrawals") return;
    void loadWithdrawals().catch((loadError) => {
      if (loadError?.name === "AbortError") return;
      setError(loadError?.message || "تعذر تحميل طلبات السحب");
    });
  }, [
    withdrawalStatus,
    withdrawalNetwork,
    withdrawalSearch,
    initialLoading,
    loadWithdrawals,
    activeTab,
  ]);

  const copyWalletAddress = async (address) => {
    if (!address) return;

    try {
      await navigator.clipboard.writeText(address);
    } catch {
      window.prompt("انسخ عنوان المحفظة:", address);
    }
  };

  const runWithdrawalAction = async (withdrawalId, action) => {
    if (action === "mark-paid") {
      setMarkPaidTarget({ id: withdrawalId });
      setMarkPaidNote("");
      setMarkPaidProof("");
      return;
    }

    if (action === "reject") {
      setWithdrawalActionModal({ id: withdrawalId, action: "reject" });
      setWithdrawalActionNote("");
      return;
    }

    if (action === "approve") {
      setWithdrawalActionModal({ id: withdrawalId, action: "approve" });
      setWithdrawalActionNote("");
      return;
    }
  };

  const submitWithdrawalActionModal = async () => {
    if (!withdrawalActionModal?.id || !withdrawalActionModal?.action) return;

    const { id: withdrawalId, action } = withdrawalActionModal;
    const adminNote = withdrawalActionNote.trim();

    if (action === "reject" && !adminNote) {
      setError("يرجى إدخال سبب الرفض");
      return;
    }

    setActionLoadingId(`${action}-${withdrawalId}`);

    try {
      const response = await adminFetch(
        `/api/admin/partner-withdrawals/${withdrawalId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminNote: adminNote || undefined }),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر تنفيذ العملية");
      }

      if (result.withdrawal) {
        applyWithdrawalUpdate(withdrawalId, result.withdrawal);
      }

      setWithdrawalActionModal(null);
      setWithdrawalActionNote("");
      void refreshWithdrawalSection().catch(() => {});
    } catch (actionError) {
      setError(actionError?.message || "تعذر تنفيذ العملية");
    } finally {
      setActionLoadingId("");
    }
  };

  const handleMarkPaidProof = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const maxBytes = 6 * 1024 * 1024;

    if (!allowedTypes.includes(file.type)) {
      setError("يرجى رفع صورة JPG أو PNG أو WEBP فقط.");
      return;
    }

    if (file.size > maxBytes) {
      setError("الحد الأقصى لحجم إثبات التحويل هو 6MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setMarkPaidProof(reader.result || "");
    };
    reader.readAsDataURL(file);
  };

  const submitMarkPaid = async () => {
    if (!markPaidTarget?.id) return;

    setActionLoadingId(`mark-paid-${markPaidTarget.id}`);

    try {
      const response = await adminFetch(
        `/api/admin/partner-withdrawals/${markPaidTarget.id}/mark-paid`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adminNote: markPaidNote.trim() || undefined,
            paymentProof: markPaidProof || undefined,
          }),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر تسجيل الدفع");
      }

      setMarkPaidTarget(null);
      setMarkPaidNote("");
      setMarkPaidProof("");

      if (result.withdrawal) {
        applyWithdrawalUpdate(markPaidTarget.id, result.withdrawal);
      }

      void refreshWithdrawalSection().catch(() => {});
    } catch (actionError) {
      setError(actionError?.message || "تعذر تسجيل الدفع");
    } finally {
      setActionLoadingId("");
    }
  };

  const filteredPartners = useMemo(() => {
    let list = partners;
    if (tierFilter && tierFilter !== "all") {
      list = list.filter((partner) => partner.tierKey === tierFilter);
    }
    const query = partnerSearch.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (partner) =>
          String(partner.username || "").toLowerCase().includes(query) ||
          String(partner.email || "").toLowerCase().includes(query) ||
          String(partner.referralCode || "").toLowerCase().includes(query)
      );
    }
    return list;
  }, [partners, tierFilter, partnerSearch]);

  const runHealthCheck = async () => {
    setHealthModalOpen(true);
    setHealthLoading(true);
    setHealthResult(null);
    setHealthError("");

    try {
      const response = await adminFetch("/api/admin/partner-health", {
        method: "GET",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر فحص صحة النظام");
      }

      setHealthResult(result.health || null);
    } catch (healthCheckError) {
      setHealthError(healthCheckError?.message || "تعذر فحص صحة النظام");
    } finally {
      setHealthLoading(false);
    }
  };

  const topCards = useMemo(
    () => [
      { title: "إجمالي الشركاء", value: summary?.totalPartners ?? 0, icon: "🤝" },
      { title: "الزيارات الفريدة", value: summary?.totalUniqueVisits ?? 0, icon: "👁️" },
      { title: "إجمالي التسجيلات", value: summary?.totalSignups ?? 0, icon: "📝" },
      {
        title: "العمولات المعلقة",
        value: summary?.totalPendingCommissionsLabel || "$0.00",
        icon: "⏳",
      },
      {
        title: "الأرصدة القابلة للسحب",
        value: summary?.totalWithdrawableBalanceLabel || "$0.00",
        icon: "💵",
      },
      {
        title: "السحوبات المدفوعة",
        value: summary?.totalPaidWithdrawalsLabel || "$0.00",
        icon: "✅",
      },
    ],
    [summary]
  );

  if (initialLoading) {
    return (
      <PartnerAdminShell>
        <div className="pa-skeleton-grid">
          <div className="pa-skeleton" />
          <div className="pa-skeleton" />
          <div className="pa-skeleton" />
        </div>
        <p className="admin-muted text-sm">جاري تحميل مركز إدارة الشركاء...</p>
      </PartnerAdminShell>
    );
  }

  return (
    <PartnerAdminShell>
      <PartnerAdminHeader onHealthCheck={() => void runHealthCheck()} />

      {error ? <div className="pa-alert">{error}</div> : null}

      {healthModalOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="admin-modal w-full max-w-md">
            <h3 className="text-2xl font-black">🩺 Health Check</h3>
            {healthLoading ? (
              <p className="admin-muted mt-4 text-sm">جاري فحص نظام الشركاء...</p>
            ) : healthError ? (
              <div className="mt-4 space-y-3">
                <p className="font-black text-red-300">تعذر إكمال الفحص</p>
                <p className="admin-muted text-sm">{healthError}</p>
              </div>
            ) : healthResult?.healthy ? (
              <div className="mt-4 space-y-3">
                <p className="text-lg font-black text-emerald-300">✅ النظام سليم</p>
                <ul className="space-y-2 text-sm">
                  {Object.entries(healthResult.checks || {}).map(([key, ok]) => (
                    <li key={key} className="admin-list-item justify-between">
                      <span>{HEALTH_CHECK_LABELS[key] || key}</span>
                      <span className={ok ? "text-emerald-300" : "text-red-300"}>
                        {ok ? "✅" : "❌"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-lg font-black text-amber-300">⚠️ يوجد مشكلة في النظام</p>
                <ul className="space-y-2 text-sm">
                  {Object.entries(healthResult?.checks || {}).map(([key, ok]) => (
                    <li key={key} className="admin-list-item justify-between">
                      <span>{HEALTH_CHECK_LABELS[key] || key}</span>
                      <span className={ok ? "text-emerald-300" : "text-red-300"}>
                        {ok ? "سليم" : "غير متوفر"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-6">
              <button
                type="button"
                onClick={() => {
                  setHealthModalOpen(false);
                  setHealthResult(null);
                  setHealthError("");
                }}
                className="admin-btn admin-btn--ghost px-5 py-2"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {withdrawalActionModal ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="admin-modal w-full max-w-lg">
            <h3 className="text-2xl font-black">
              {withdrawalActionModal.action === "approve"
                ? "قبول طلب السحب"
                : "رفض طلب السحب"}
            </h3>
            <p className="admin-muted mt-2 text-sm">
              {withdrawalActionModal.action === "approve"
                ? "يمكنك إضافة ملاحظة اختيارية للشريك قبل تأكيد القبول."
                : "يرجى توضيح سبب الرفض — سيصل للشريك مع الإشعار."}
            </p>
            <div className="mt-4">
              <label className="block">
                <span className="mb-2 block text-sm font-bold">
                  {withdrawalActionModal.action === "approve"
                    ? "ملاحظة الإدارة (اختياري)"
                    : "سبب الرفض"}
                </span>
                <textarea
                  value={withdrawalActionNote}
                  onChange={(event) => setWithdrawalActionNote(event.target.value)}
                  rows={4}
                  className="admin-input w-full"
                  placeholder={
                    withdrawalActionModal.action === "approve"
                      ? "أي ملاحظات للشريك..."
                      : "اكتب سبب الرفض..."
                  }
                />
              </label>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void submitWithdrawalActionModal()}
                disabled={
                  actionLoadingId ===
                  `${withdrawalActionModal.action}-${withdrawalActionModal.id}`
                }
                className={
                  withdrawalActionModal.action === "approve"
                    ? "admin-btn admin-btn--approve px-5 py-2"
                    : "admin-btn admin-btn--reject px-5 py-2"
                }
              >
                {actionLoadingId ===
                `${withdrawalActionModal.action}-${withdrawalActionModal.id}`
                  ? "جاري التنفيذ..."
                  : withdrawalActionModal.action === "approve"
                    ? "تأكيد القبول"
                    : "تأكيد الرفض"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setWithdrawalActionModal(null);
                  setWithdrawalActionNote("");
                }}
                className="admin-btn admin-btn--ghost px-5 py-2"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {markPaidTarget ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="admin-modal w-full max-w-lg">
            <h3 className="text-2xl font-black">تأكيد الدفع</h3>
            <p className="admin-muted mt-2 text-sm">
              سيتم خصم الرصيد من محفظة الشريك. أرفق صورة إثبات التحويل ليرسلها للمستخدم.
            </p>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-bold">ملاحظة الإدارة (اختياري)</span>
                <textarea
                  value={markPaidNote}
                  onChange={(event) => setMarkPaidNote(event.target.value)}
                  rows={3}
                  className="admin-input w-full"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold">صورة إثبات التحويل</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleMarkPaidProof}
                  className="admin-input w-full"
                />
              </label>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void submitMarkPaid()}
                disabled={actionLoadingId === `mark-paid-${markPaidTarget.id}`}
                className="admin-btn admin-btn--paid px-5 py-2"
              >
                {actionLoadingId === `mark-paid-${markPaidTarget.id}`
                  ? "جاري التسجيل..."
                  : "تأكيد الدفع"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMarkPaidTarget(null);
                  setMarkPaidNote("");
                  setMarkPaidProof("");
                }}
                className="admin-btn admin-btn--ghost px-5 py-2"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <PartnerAdminTabs tabs={HUB_TABS} activeTab={activeTab} onChange={setActiveTab} />

      <div className="pa-tab-content">

      {activeTab === "overview" ? (
        <>
      <PartnerAdminSection title="مؤشرات الأداء" description="نظرة سريعة على صحة برنامج الشركاء والأرقام الرئيسية."><div className="pa-stat-grid pa-stat-grid--6">
        {topCards.map((card) => (
          <PartnerAdminStatCard key={card.title} title={card.title} value={card.value} icon={card.icon} money={typeof card.value === "string" && card.value.includes("$")} />
        ))}
      </div></PartnerAdminSection>

      <PartnerAdminSection title="تحليلات الشركاء" description="إحصائيات برنامج الشركاء — Aggregation عبر SQL RPC">
        <div className="pa-stat-grid pa-stat-grid--5">
          <PartnerAdminStatCard title="عدد الشركاء" value={adminAnalytics?.totalPartners ?? 0} icon="🤝" />
          <PartnerAdminStatCard title="الشركاء النشطين" value={adminAnalytics?.activePartners ?? 0} icon="✅" />
          <PartnerAdminStatCard
            title="إجمالي العمولات"
            money
            value={formatPartnerMoney(adminAnalytics?.totalCommissions ?? 0)}
            icon="💼"
          />
          <PartnerAdminStatCard
            title="إجمالي السحوبات"
            money
            value={formatPartnerMoney(adminAnalytics?.totalWithdrawals ?? 0)}
            icon="🏦"
          />
          <PartnerAdminStatCard
            title="إجمالي المبيعات"
            money
            value={formatPartnerMoney(adminAnalytics?.totalSales ?? 0)}
            icon="📈"
          />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="pa-card">
            <h3 className="pa-card__title">أعلى 10 شركاء</h3>
            <div className="pa-rank-list pa-scroll-list mt-3">
              {topPartners.map((partner) => (
                <Link
                  key={partner.partnerId}
                  href={`/admin/partners/${partner.partnerId}`}
                  className="pa-rank-item"
                >
                  <span className="font-bold">{partner.username}</span>
                  <span className="font-black text-emerald-300">{formatPartnerMoney(partner.totalSales)}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="pa-card">
            <h3 className="pa-card__title">أكثر الخدمات مبيعاً</h3>
            <div className="pa-rank-list pa-scroll-list mt-3">
              {(adminAnalytics?.topServices || []).map((item) => (
                <div key={item.serviceType} className="pa-rank-item">
                  <span>{serviceLabel(item.serviceType)}<span className="block text-xs text-[var(--pa-text-muted)] pa-ltr">{item.serviceType}</span></span>
                  <span className="font-black">{formatPartnerMoney(item.sales)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pa-card">
            <h3 className="pa-card__title">أكثر المستويات انتشاراً</h3>
            <div className="pa-rank-list pa-scroll-list mt-3">
              {(adminAnalytics?.topTiers || []).map((item) => (
                <div key={item.tierKey} className="pa-rank-item">
                  <span>{item.tierName}</span>
                  <span className="font-black">{item.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pa-card">
            <h3 className="pa-card__title">آخر التسجيلات</h3>
            <div className="pa-rank-list pa-scroll-list mt-3">
              {(adminAnalytics?.latestSignups || []).map((item) => (
                <div key={item.id} className="pa-rank-item text-sm">
                  <p className="font-bold">{item.username || "عميل"}</p>
                  <p className="admin-muted">{formatDate(item.registeredAt)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="pa-card lg:col-span-2">
            <h3 className="pa-card__title">آخر عمليات السحب</h3>
            <div className="pa-rank-list pa-scroll-list mt-3">
              {(adminAnalytics?.latestWithdrawals || []).map((item) => (
                <div key={item.id} className="pa-rank-item text-sm">
                  <span>
                    {formatPartnerMoney(item.amount)} {item.currency} · {item.network}
                  </span>
                  <span className="admin-muted">{formatDate(item.createdAt)}</span>
                  <StatusBadge status={item.status} variant="partner" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </PartnerAdminSection>

      <PartnerAdminSection title="أبرز الشركاء" description="ترتيب سريع حسب التسجيلات والأرباح.">
        <div className="pa-panel-grid pa-panel-grid--2">
        <div className="pa-card">
          <h3 className="pa-card__title">أفضل الشركاء — التسجيلات</h3>
          <div className="pa-rank-list pa-scroll-list mt-3">
            {(summary?.topBySignups || []).map((partner) => (
              <Link
                key={partner.id}
                href={`/admin/partners/${partner.id}`}
                className="pa-rank-item"
              >
                <span className="font-bold">{partner.username}</span>
                <span className="font-black text-cyan-300">{partner.signupCount} تسجيل</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="pa-card">
          <h3 className="pa-card__title">أفضل الشركاء — الأرباح</h3>
          <div className="pa-rank-list pa-scroll-list mt-3">
            {(summary?.topByEarnings || []).map((partner) => (
              <Link
                key={partner.id}
                href={`/admin/partners/${partner.id}`}
                className="pa-rank-item"
              >
                <span className="font-bold">{partner.username}</span>
                <span className="font-black text-emerald-300">{formatPartnerMoney(partner.totalEarnings)}</span>
              </Link>
            ))}
          </div>
        </div>
        </div>
      </PartnerAdminSection>
        </>
      ) : null}

      {activeTab === "partners" ? (
      <PartnerAdminSection title="جدول الشركاء" description="إدارة ومراقبة حسابات الشركاء، المستويات، والأرصدة.">
        <PartnerAdminToolbar>
          <span className="pa-count-badge">{filteredPartners.length.toLocaleString("ar")} شريك</span>
          <input
            type="search"
            value={partnerSearch}
            onChange={(event) => setPartnerSearch(event.target.value)}
            placeholder="بحث بالاسم أو البريد أو رمز الإحالة..."
            className="pa-input min-w-[240px] flex-1"
          />
          <label className="pa-field">
            <span className="pa-field__label">المستوى</span>
            <select
              value={tierFilter}
              onChange={(event) => setTierFilter(event.target.value)}
              className="pa-select min-w-[180px]"
            >
              <option value="all">الكل</option>
              {tiers.map((tier) => (
                <option key={tier.tier_key} value={tier.tier_key}>
                  {tier.tier_name}
                </option>
              ))}
            </select>
          </label>
        </PartnerAdminToolbar>
        {filteredPartners.length === 0 ? (
          <PartnerAdminEmptyState
            icon="🤝"
            title="لا يوجد الشركاء مطابقون"
            description="جرّب تغيير البحث أو فلتر المستوى لعرض النتائج."
          />
        ) : (
        <PartnerAdminTable>
            <thead>
              <tr>
                <th>الشريك</th>
                <th>البريد</th>
                <th>رمز الإحالة</th>
                <th>المستوى</th>
                <th>نسبة العمولة</th>
                <th>الزيارات</th>
                <th>التسجيلات</th>
                <th>النشطون</th>
                <th>قابل للسحب</th>
                <th>معلق</th>
                <th>المكافآت</th>
                <th>الإجمالي</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {filteredPartners.map((partner) => (
                <tr key={partner.id}>
                  <td>
                    <Link href={`/admin/partners/${partner.id}`} className="admin-link">
                      {partner.username}
                    </Link>
                  </td>
                  <td><span className="pa-ltr">{partner.email}</span></td>
                  <td><span className="pa-code">{partner.referralCode}</span></td>
                  <td>{partner.tierName}</td>
                  <td>{partner.commissionPercent}%</td>
                  <td>{partner.visitCount}</td>
                  <td>{partner.signupCount}</td>
                  <td>{partner.activeAccountCount}</td>
                  <td className="pa-ltr">{formatPartnerMoney(partner.balanceWithdrawable)}</td>
                  <td className="pa-ltr">{formatPartnerMoney(partner.balancePending)}</td>
                  <td className="pa-ltr">{formatPartnerMoney(partner.balanceBonusPending)}</td>
                  <td className="pa-ltr">{formatPartnerMoney(partner.totalEarnings)}</td>
                  <td>
                    <StatusBadge status={partner.status} variant="partner" />
                  </td>
                </tr>
              ))}
            </tbody>
        </PartnerAdminTable>
        )}
      </PartnerAdminSection>

      ) : null}

      {activeTab === "commissions" ? (
        <AdminPartnerMarketingCenter embedded forcedSection="commissions-bundle" />
      ) : null}

      {activeTab === "campaigns" ? (
        <AdminPartnerMarketingCenter embedded forcedSection="campaigns" />
      ) : null}

      {activeTab === "fraud" ? (
        <AdminPartnerMarketingCenter embedded forcedSection="fraud" />
      ) : null}

      {activeTab === "audit" ? (
        <AdminPartnerMarketingCenter embedded forcedSection="audit" />
      ) : null}

      {activeTab === "withdrawals" ? (
      <PartnerAdminSection
        title="السحوبات والمحفظة"
        description="إدارة طلبات السحب — الخصم من الرصيد يتم فقط عند تأكيد الدفع."
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div />
          <div className="flex flex-wrap gap-2">
            {WITHDRAWAL_STATUSES.map((status) => (
              <button
                key={WITHDRAWAL_STATUS_LABELS[status] || status}
                type="button"
                onClick={() => setWithdrawalStatus(status)}
                className={`admin-filter-btn ${
                  withdrawalStatus === status
                    ? "admin-filter-btn--active"
                    : "admin-filter-btn--idle"
                }`}
              >
                {WITHDRAWAL_STATUS_LABELS[status] || status}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          {withdrawalsLoading ? (
            <p className="admin-muted text-sm">جاري تحميل طلبات السحب...</p>
          ) : null}
          <label className="flex items-center gap-2 text-sm font-bold">
            <span className="admin-muted">الشبكة:</span>
            <select
              value={withdrawalNetwork}
              onChange={(event) => setWithdrawalNetwork(event.target.value)}
              className="admin-select"
            >
              <option value="all">الكل</option>
              {WITHDRAWAL_NETWORKS.map((network) => (
                <option key={network} value={network}>
                  {network}
                </option>
              ))}
            </select>
          </label>
          <input
            type="search"
            value={withdrawalSearch}
            onChange={(event) => setWithdrawalSearch(event.target.value)}
            placeholder="بحث بالبريد أو اسم الشريك..."
            className="admin-input min-w-[240px] flex-1 text-sm"
          />
        </div>

        {withdrawals.length === 0 && !withdrawalsLoading ? (
          <PartnerAdminEmptyState
            icon="💳"
            title="لا توجد طلبات سحب مطابقة للفلاتر الحالية"
            description="جرّب تغيير الحالة أو البحث لعرض النتائج."
          />
        ) : (
        <PartnerAdminTable>
            <thead>
              <tr>
                <th>الشريك</th>
                <th>البريد</th>
                <th>المبلغ</th>
                <th>العملة</th>
                <th>الشبكة</th>
                <th>المحفظة</th>
                <th>التاريخ</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((item) => (
                <tr key={item.id}>
                  <td>{item.partner?.username || "—"}</td>
                  <td>{item.partner?.email || "—"}</td>
                  <td className="font-black">{formatPartnerMoney(item.amount)}</td>
                  <td>{item.currency}</td>
                  <td>{item.network}</td>
                  <td>
                    <div className="flex max-w-[320px] items-center gap-2">
                      <span className="break-all font-mono text-xs">{item.walletAddress}</span>
                      <button
                        type="button"
                        onClick={() => void copyWalletAddress(item.walletAddress)}
                        className="admin-btn admin-btn--ghost shrink-0 px-2 py-1 text-xs"
                      >
                        نسخ
                      </button>
                    </div>
                  </td>
                  <td>{formatDate(item.createdAt)}</td>
                  <td>
                    <StatusBadge status={item.status} variant="partner" />
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {item.status === "pending" ? (
                        <button
                          type="button"
                          disabled={Boolean(actionLoadingId)}
                          onClick={() => void runWithdrawalAction(item.id, "approve")}
                          className="admin-btn admin-btn--approve"
                        >
                          {actionLoadingId === `approve-${item.id}` ? "جاري..." : "Approve"}
                        </button>
                      ) : null}
                      {item.status === "approved" ? (
                        <button
                          type="button"
                          disabled={Boolean(actionLoadingId)}
                          onClick={() => void runWithdrawalAction(item.id, "mark-paid")}
                          className="admin-btn admin-btn--paid"
                        >
                          {actionLoadingId === `mark-paid-${item.id}` ? "جاري..." : "تأكيد الدفع"}
                        </button>
                      ) : null}
                      {["pending", "approved"].includes(item.status) ? (
                        <button
                          type="button"
                          disabled={Boolean(actionLoadingId)}
                          onClick={() => void runWithdrawalAction(item.id, "reject")}
                          className="admin-btn admin-btn--reject"
                        >
                          {actionLoadingId === `reject-${item.id}` ? "جاري..." : "رفض"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
        </PartnerAdminTable>
        )}
      </PartnerAdminSection>
      ) : null}
      </div>
    </PartnerAdminShell>
  );
}
