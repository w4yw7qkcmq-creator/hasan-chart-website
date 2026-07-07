"use client";

import "../admin-theme.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "../../../lib/admin-fetch";
import { formatPartnerMoney, WITHDRAWAL_NETWORKS } from "../../../lib/partner-shared";

const WITHDRAWAL_STATUSES = ["all", "pending", "approved", "rejected", "paid"];

function AdminStatCard({ title, value, icon }) {
  return (
    <div className="admin-stat-card relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-500/20 to-cyan-400/10" />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <p className="admin-stat-card__title">{title}</p>
          <h3 className="admin-stat-card__value">{value}</h3>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-300/20 bg-black/25 text-xl">
          {icon}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const badgeClass = {
    pending: "admin-badge--pending",
    approved: "admin-badge--approved",
    rejected: "admin-badge--rejected",
    paid: "admin-badge--paid",
    active: "admin-badge--active",
    suspended: "admin-badge--suspended",
  };

  const labels = {
    pending: "معلق",
    approved: "معتمد",
    rejected: "مرفوض",
    paid: "مدفوع",
    active: "نشط",
    suspended: "موقوف",
  };

  return (
    <span className={`admin-badge ${badgeClass[status] || "admin-badge--suspended"}`}>
      {labels[status] || status}
    </span>
  );
}

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

export default function AdminPartnersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [partners, setPartners] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [commissionRules, setCommissionRules] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [tierFilter, setTierFilter] = useState("all");
  const [withdrawalStatus, setWithdrawalStatus] = useState("pending");
  const [withdrawalNetwork, setWithdrawalNetwork] = useState("all");
  const [withdrawalSearch, setWithdrawalSearch] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [markPaidTarget, setMarkPaidTarget] = useState(null);
  const [markPaidNote, setMarkPaidNote] = useState("");
  const [markPaidProof, setMarkPaidProof] = useState("");
  const [adminAnalytics, setAdminAnalytics] = useState(null);
  const [topPartners, setTopPartners] = useState([]);

  const loadPartners = useCallback(async () => {
    const response = await adminFetch("/api/admin/partners", {
      method: "GET",
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result?.success) {
      throw new Error(result?.error || "تعذر تحميل بيانات الشركاء");
    }

    setSummary(result.summary || null);
    setPartners(result.partners || []);
    setTiers(result.tiers || []);
  }, []);

  const loadCommissionRules = useCallback(async () => {
    const response = await adminFetch("/api/admin/partners/commission-rules", {
      method: "GET",
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result?.success) {
      throw new Error(result?.error || "تعذر تحميل قواعد العمولات");
    }

    setCommissionRules(result.rules || []);
  }, []);

  const loadWithdrawals = useCallback(async () => {
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
    const response = await adminFetch(`/api/admin/partner-withdrawals${query}`, {
      method: "GET",
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result?.success) {
      throw new Error(result?.error || "تعذر تحميل طلبات السحب");
    }

    setWithdrawals(result.withdrawals || []);
  }, [withdrawalStatus, withdrawalNetwork, withdrawalSearch]);

  const loadAdminAnalytics = useCallback(async () => {
    const [analyticsRes, topPartnersRes] = await Promise.all([
      adminFetch("/api/admin/partner-analytics", { method: "GET", cache: "no-store" }),
      adminFetch("/api/admin/top-partners?limit=10", { method: "GET", cache: "no-store" }),
    ]);

    const analyticsResult = await analyticsRes.json().catch(() => ({}));
    const topPartnersResult = await topPartnersRes.json().catch(() => ({}));

    if (!analyticsRes.ok || !analyticsResult?.success) {
      throw new Error(analyticsResult?.error || "تعذر تحميل Partner Analytics");
    }

    setAdminAnalytics(analyticsResult.analytics || null);
    setTopPartners(topPartnersResult?.success ? topPartnersResult.partners || [] : []);
  }, []);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      await Promise.all([
        loadPartners(),
        loadWithdrawals(),
        loadCommissionRules(),
        loadAdminAnalytics(),
      ]);
    } catch (loadError) {
      setError(loadError?.message || "تعذر تحميل لوحة الشركاء");
    } finally {
      setLoading(false);
    }
  }, [loadPartners, loadWithdrawals, loadCommissionRules, loadAdminAnalytics]);

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
    void reloadAll();
  }, []);

  useEffect(() => {
    if (loading) return;
    void loadWithdrawals().catch((loadError) => {
      setError(loadError?.message || "تعذر تحميل طلبات السحب");
    });
  }, [withdrawalStatus, withdrawalNetwork, withdrawalSearch, loading, loadWithdrawals]);

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

    let adminNote = "";

    if (action === "reject") {
      adminNote = window.prompt("سبب الرفض:") || "";

      if (!adminNote.trim()) {
        return;
      }
    } else if (action === "approve") {
      adminNote = window.prompt("ملاحظة الإدارة (اختياري):") || "";
    }

    setActionLoadingId(`${action}-${withdrawalId}`);

    try {
      const response = await adminFetch(
        `/api/admin/partner-withdrawals/${withdrawalId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminNote: adminNote.trim() || undefined }),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر تنفيذ العملية");
      }

      if (result.withdrawal) {
        applyWithdrawalUpdate(withdrawalId, result.withdrawal);
      }

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

    if (!file.type.startsWith("image/")) {
      setError("يرجى رفع صورة إثبات التحويل فقط.");
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
    if (!tierFilter || tierFilter === "all") {
      return partners;
    }

    return partners.filter((partner) => partner.tierKey === tierFilter);
  }, [partners, tierFilter]);

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

  if (loading) {
    return (
      <main className="admin-theme-page admin-panel p-6">
        <p className="admin-muted">جاري تحميل Admin Partner Center...</p>
      </main>
    );
  }

  return (
    <main className="admin-theme-page admin-panel space-y-8 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-cyan-300">Admin Partner Center</p>
          <h1 className="mt-2 text-3xl font-black">إدارة برنامج الشركاء</h1>
          <p className="admin-subheading">
            إدارة الشركاء، الإحصائيات، وطلبات السحب — بدون دفع تلقائي.
          </p>
        </div>
        <Link
          href="/admin/partners/settings"
          className="admin-btn admin-btn--ghost px-4 py-2 text-sm"
        >
          ⚙️ Automation Settings
        </Link>
        <Link href="/api/admin/partner-health" className="admin-btn admin-btn--ghost px-4 py-2 text-sm">
          🩺 Health Check
        </Link>
        <Link href="/admin" className="admin-btn admin-btn--ghost px-4 py-2 text-sm">
          ← العودة للوحة الإدارة
        </Link>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {markPaidTarget ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="admin-modal w-full max-w-lg">
            <h3 className="text-2xl font-black">Mark as Paid</h3>
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {topCards.map((card) => (
          <AdminStatCard key={card.title} title={card.title} value={card.value} icon={card.icon} />
        ))}
      </section>

      <section className="admin-surface p-5">
        <h2 className="admin-heading">Partner Analytics</h2>
        <p className="admin-subheading">إحصائيات برنامج الشركاء — Aggregation عبر SQL RPC</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <AdminStatCard title="عدد الشركاء" value={adminAnalytics?.totalPartners ?? 0} icon="🤝" />
          <AdminStatCard title="الشركاء النشطين" value={adminAnalytics?.activePartners ?? 0} icon="✅" />
          <AdminStatCard
            title="إجمالي العمولات"
            value={formatPartnerMoney(adminAnalytics?.totalCommissions ?? 0)}
            icon="💼"
          />
          <AdminStatCard
            title="إجمالي السحوبات"
            value={formatPartnerMoney(adminAnalytics?.totalWithdrawals ?? 0)}
            icon="🏦"
          />
          <AdminStatCard
            title="إجمالي المبيعات"
            value={formatPartnerMoney(adminAnalytics?.totalSales ?? 0)}
            icon="📈"
          />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="admin-surface p-4">
            <h3 className="font-black">أعلى 10 شركاء</h3>
            <div className="mt-3 space-y-2">
              {topPartners.map((partner) => (
                <Link
                  key={partner.partnerId}
                  href={`/admin/partners/${partner.partnerId}`}
                  className="admin-list-item"
                >
                  <span className="font-bold">{partner.username}</span>
                  <span className="font-black text-emerald-300">{formatPartnerMoney(partner.totalSales)}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="admin-surface p-4">
            <h3 className="font-black">أكثر الخدمات مبيعاً</h3>
            <div className="mt-3 space-y-2">
              {(adminAnalytics?.topServices || []).map((item) => (
                <div key={item.serviceType} className="admin-list-item">
                  <span className="font-mono">{item.serviceType}</span>
                  <span className="font-black">{formatPartnerMoney(item.sales)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="admin-surface p-4">
            <h3 className="font-black">أكثر المستويات انتشاراً</h3>
            <div className="mt-3 space-y-2">
              {(adminAnalytics?.topTiers || []).map((item) => (
                <div key={item.tierKey} className="admin-list-item">
                  <span>{item.tierName}</span>
                  <span className="font-black">{item.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="admin-surface p-4">
            <h3 className="font-black">آخر التسجيلات</h3>
            <div className="mt-3 space-y-2">
              {(adminAnalytics?.latestSignups || []).map((item) => (
                <div key={item.id} className="admin-list-item text-sm">
                  <p className="font-bold">{item.username || "عميل"}</p>
                  <p className="admin-muted">{formatDate(item.registeredAt)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="admin-surface p-4 lg:col-span-2">
            <h3 className="font-black">آخر عمليات السحب</h3>
            <div className="mt-3 space-y-2">
              {(adminAnalytics?.latestWithdrawals || []).map((item) => (
                <div key={item.id} className="admin-list-item text-sm">
                  <span>
                    {formatPartnerMoney(item.amount)} {item.currency} · {item.network}
                  </span>
                  <span className="admin-muted">{formatDate(item.createdAt)}</span>
                  <StatusBadge status={item.status} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="admin-surface p-5">
          <h2 className="admin-heading">أفضل الشركاء — التسجيلات</h2>
          <div className="mt-4 space-y-3">
            {(summary?.topBySignups || []).map((partner) => (
              <Link
                key={partner.id}
                href={`/admin/partners/${partner.id}`}
                className="admin-list-item"
              >
                <span className="font-bold">{partner.username}</span>
                <span className="font-black text-cyan-300">{partner.signupCount} تسجيل</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="admin-surface p-5">
          <h2 className="admin-heading">أفضل الشركاء — الأرباح</h2>
          <div className="mt-4 space-y-3">
            {(summary?.topByEarnings || []).map((partner) => (
              <Link
                key={partner.id}
                href={`/admin/partners/${partner.id}`}
                className="admin-list-item"
              >
                <span className="font-bold">{partner.username}</span>
                <span className="font-black text-emerald-300">{formatPartnerMoney(partner.totalEarnings)}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="admin-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="admin-heading">جدول الشركاء</h2>
          <label className="flex items-center gap-2 text-sm font-bold">
            <span className="admin-muted">فلتر المستوى:</span>
            <select
              value={tierFilter}
              onChange={(event) => setTierFilter(event.target.value)}
              className="admin-select"
            >
              <option value="all">الكل</option>
              {tiers.map((tier) => (
                <option key={tier.tier_key} value={tier.tier_key}>
                  {tier.tier_name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>الشريك</th>
                <th>البريد</th>
                <th>Referral Code</th>
                <th>المستوى</th>
                <th>العمولة %</th>
                <th>زيارات</th>
                <th>تسجيلات</th>
                <th>نشط</th>
                <th>قابل للسحب</th>
                <th>معلق</th>
                <th>مكافآت</th>
                <th>إجمالي</th>
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
                  <td>{partner.email}</td>
                  <td className="font-mono">{partner.referralCode}</td>
                  <td>{partner.tierName}</td>
                  <td>{partner.commissionPercent}%</td>
                  <td>{partner.visitCount}</td>
                  <td>{partner.signupCount}</td>
                  <td>{partner.activeAccountCount}</td>
                  <td>{formatPartnerMoney(partner.balanceWithdrawable)}</td>
                  <td>{formatPartnerMoney(partner.balancePending)}</td>
                  <td>{formatPartnerMoney(partner.balanceBonusPending)}</td>
                  <td>{formatPartnerMoney(partner.totalEarnings)}</td>
                  <td>
                    <StatusBadge status={partner.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-surface p-5">
        <h2 className="admin-heading">Partner Tiers</h2>
        <p className="admin-subheading">
          مستويات الشركاء ونسب العمولة — عرض فقط في هذه المرحلة.
        </p>
        <div className="mt-4 admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>tier_key</th>
                <th>tier_name</th>
                <th>commission_percent</th>
                <th>min_active_referrals</th>
                <th>min_total_sales</th>
                <th>sort_order</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => (
                <tr key={tier.tier_key}>
                  <td className="font-mono">{tier.tier_key}</td>
                  <td>{tier.tier_name}</td>
                  <td>{tier.commission_percent}%</td>
                  <td>{tier.min_active_referrals}</td>
                  <td>{formatPartnerMoney(tier.min_total_sales)}</td>
                  <td>{tier.sort_order}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-surface p-5">
        <h2 className="admin-heading">Commission Rules</h2>
        <p className="admin-subheading">
          قواعد العمولات العامة لكل خدمة — عرض فقط في هذه المرحلة.
        </p>
        <div className="mt-4 admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>service_type</th>
                <th>commission_percent</th>
                <th>commission_mode</th>
                <th>active</th>
                <th>notes</th>
              </tr>
            </thead>
            <tbody>
              {commissionRules.map((rule) => (
                <tr key={rule.service_type}>
                  <td className="font-mono">{rule.service_type}</td>
                  <td>{rule.commission_percent}%</td>
                  <td>{rule.commission_mode}</td>
                  <td>
                    <StatusBadge status={rule.is_active ? "active" : "suspended"} />
                  </td>
                  <td>{rule.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="admin-heading">Wallet & Withdrawals</h2>
            <p className="admin-subheading">
              إدارة طلبات السحب — الخصم من الرصيد يتم فقط عند Mark as Paid
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {WITHDRAWAL_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setWithdrawalStatus(status)}
                className={`admin-filter-btn ${
                  withdrawalStatus === status
                    ? "admin-filter-btn--active"
                    : "admin-filter-btn--idle"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
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

        <div className="mt-4 admin-table-wrap">
          <table className="admin-table">
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
                    <StatusBadge status={item.status} />
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
                          {actionLoadingId === `mark-paid-${item.id}` ? "جاري..." : "Mark as Paid"}
                        </button>
                      ) : null}
                      {["pending", "approved"].includes(item.status) ? (
                        <button
                          type="button"
                          disabled={Boolean(actionLoadingId)}
                          onClick={() => void runWithdrawalAction(item.id, "reject")}
                          className="admin-btn admin-btn--reject"
                        >
                          {actionLoadingId === `reject-${item.id}` ? "جاري..." : "Reject"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
