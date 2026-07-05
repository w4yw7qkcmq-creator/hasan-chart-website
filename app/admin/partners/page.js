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
  const styles = {
    pending: "border-amber-200 bg-amber-50 text-amber-800",
    approved: "border-blue-200 bg-blue-50 text-blue-800",
    rejected: "border-red-200 bg-red-50 text-red-800",
    paid: "border-emerald-200 bg-emerald-50 text-emerald-800",
    active: "border-emerald-200 bg-emerald-50 text-emerald-800",
    suspended: "border-red-200 bg-red-50 text-red-800",
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
    <span
      className={`rounded-full border px-3 py-1 text-xs font-black ${
        styles[status] || "border-slate-200 bg-slate-50 text-slate-700"
      }`}
    >
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

      await reloadAll();
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
      await reloadAll();
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
      <main className="rounded-[34px] border border-cyan-300/10 bg-[#020617] p-6 text-white">
        <p className="text-slate-300">جاري تحميل Admin Partner Center...</p>
      </main>
    );
  }

  return (
    <main className="admin-theme-page space-y-8 rounded-[34px] border border-cyan-300/10 bg-[#020617] p-4 text-white md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-cyan-200/70">Admin Partner Center</p>
          <h1 className="mt-2 text-3xl font-black">إدارة برنامج الشركاء</h1>
          <p className="mt-2 text-sm text-slate-400">
            إدارة الشركاء، الإحصائيات، وطلبات السحب — بدون دفع تلقائي.
          </p>
        </div>
        <Link
          href="/admin/partners/settings"
          className="rounded-2xl border border-emerald-300/20 px-4 py-2 text-sm font-black text-emerald-100"
        >
          ⚙️ Automation Settings
        </Link>
        <Link
          href="/api/admin/partner-health"
          className="rounded-2xl border border-amber-300/20 px-4 py-2 text-sm font-black text-amber-100"
        >
          🩺 Health Check
        </Link>
        <Link
          href="/admin"
          className="rounded-2xl border border-cyan-300/20 px-4 py-2 text-sm font-black text-cyan-100"
        >
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
                disabled={Boolean(actionLoadingId)}
                className="admin-btn admin-btn--paid px-5 py-2"
              >
                {actionLoadingId ? "جاري التسجيل..." : "تأكيد الدفع"}
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

      <section className="rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-5">
        <h2 className="text-xl font-black">Partner Analytics</h2>
        <p className="mt-2 text-sm text-slate-400">إحصائيات برنامج الشركاء — Aggregation عبر SQL RPC</p>
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
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <h3 className="font-black">أعلى 10 شركاء</h3>
            <div className="mt-3 space-y-2">
              {topPartners.map((partner) => (
                <Link
                  key={partner.partnerId}
                  href={`/admin/partners/${partner.partnerId}`}
                  className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2 hover:border-cyan-300/30"
                >
                  <span>{partner.username}</span>
                  <span className="text-emerald-200">{formatPartnerMoney(partner.totalSales)}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <h3 className="font-black">أكثر الخدمات مبيعاً</h3>
            <div className="mt-3 space-y-2">
              {(adminAnalytics?.topServices || []).map((item) => (
                <div
                  key={item.serviceType}
                  className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2"
                >
                  <span className="font-mono">{item.serviceType}</span>
                  <span>{formatPartnerMoney(item.sales)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <h3 className="font-black">أكثر المستويات انتشاراً</h3>
            <div className="mt-3 space-y-2">
              {(adminAnalytics?.topTiers || []).map((item) => (
                <div
                  key={item.tierKey}
                  className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2"
                >
                  <span>{item.tierName}</span>
                  <span>{item.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <h3 className="font-black">آخر التسجيلات</h3>
            <div className="mt-3 space-y-2">
              {(adminAnalytics?.latestSignups || []).map((item) => (
                <div key={item.id} className="rounded-xl border border-white/10 px-3 py-2 text-sm">
                  <p className="font-bold">{item.username || "عميل"}</p>
                  <p className="text-slate-400">{formatDate(item.registeredAt)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 lg:col-span-2">
            <h3 className="font-black">آخر عمليات السحب</h3>
            <div className="mt-3 space-y-2">
              {(adminAnalytics?.latestWithdrawals || []).map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm"
                >
                  <span>
                    {formatPartnerMoney(item.amount)} {item.currency} · {item.network}
                  </span>
                  <span className="text-slate-400">{formatDate(item.createdAt)}</span>
                  <StatusBadge status={item.status} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-5">
          <h2 className="text-xl font-black">أفضل الشركاء — التسجيلات</h2>
          <div className="mt-4 space-y-3">
            {(summary?.topBySignups || []).map((partner) => (
              <Link
                key={partner.id}
                href={`/admin/partners/${partner.id}`}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3 transition hover:border-cyan-300/30"
              >
                <span className="font-bold">{partner.username}</span>
                <span className="text-cyan-200">{partner.signupCount} تسجيل</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-5">
          <h2 className="text-xl font-black">أفضل الشركاء — الأرباح</h2>
          <div className="mt-4 space-y-3">
            {(summary?.topByEarnings || []).map((partner) => (
              <Link
                key={partner.id}
                href={`/admin/partners/${partner.id}`}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3 transition hover:border-cyan-300/30"
              >
                <span className="font-bold">{partner.username}</span>
                <span className="text-emerald-200">{formatPartnerMoney(partner.totalEarnings)}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xl font-black">جدول الشركاء</h2>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <span>فلتر المستوى:</span>
            <select
              value={tierFilter}
              onChange={(event) => setTierFilter(event.target.value)}
              className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
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
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-right text-slate-300">
                <th className="px-3 py-3">الشريك</th>
                <th className="px-3 py-3">البريد</th>
                <th className="px-3 py-3">Referral Code</th>
                <th className="px-3 py-3">المستوى</th>
                <th className="px-3 py-3">العمولة %</th>
                <th className="px-3 py-3">زيارات</th>
                <th className="px-3 py-3">تسجيلات</th>
                <th className="px-3 py-3">نشط</th>
                <th className="px-3 py-3">قابل للسحب</th>
                <th className="px-3 py-3">معلق</th>
                <th className="px-3 py-3">مكافآت</th>
                <th className="px-3 py-3">إجمالي</th>
                <th className="px-3 py-3">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {filteredPartners.map((partner) => (
                <tr key={partner.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="px-3 py-3">
                    <Link href={`/admin/partners/${partner.id}`} className="font-bold text-cyan-200">
                      {partner.username}
                    </Link>
                  </td>
                  <td className="px-3 py-3">{partner.email}</td>
                  <td className="px-3 py-3 font-mono">{partner.referralCode}</td>
                  <td className="px-3 py-3">{partner.tierName}</td>
                  <td className="px-3 py-3">{partner.commissionPercent}%</td>
                  <td className="px-3 py-3">{partner.visitCount}</td>
                  <td className="px-3 py-3">{partner.signupCount}</td>
                  <td className="px-3 py-3">{partner.activeAccountCount}</td>
                  <td className="px-3 py-3">{formatPartnerMoney(partner.balanceWithdrawable)}</td>
                  <td className="px-3 py-3">{formatPartnerMoney(partner.balancePending)}</td>
                  <td className="px-3 py-3">{formatPartnerMoney(partner.balanceBonusPending)}</td>
                  <td className="px-3 py-3">{formatPartnerMoney(partner.totalEarnings)}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={partner.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-5">
        <h2 className="text-xl font-black">Partner Tiers</h2>
        <p className="mt-2 text-sm text-slate-400">
          مستويات الشركاء ونسب العمولة — عرض فقط في هذه المرحلة.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-right text-slate-300">
                <th className="px-3 py-3">tier_key</th>
                <th className="px-3 py-3">tier_name</th>
                <th className="px-3 py-3">commission_percent</th>
                <th className="px-3 py-3">min_active_referrals</th>
                <th className="px-3 py-3">min_total_sales</th>
                <th className="px-3 py-3">sort_order</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => (
                <tr key={tier.tier_key} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="px-3 py-3 font-mono">{tier.tier_key}</td>
                  <td className="px-3 py-3">{tier.tier_name}</td>
                  <td className="px-3 py-3">{tier.commission_percent}%</td>
                  <td className="px-3 py-3">{tier.min_active_referrals}</td>
                  <td className="px-3 py-3">{formatPartnerMoney(tier.min_total_sales)}</td>
                  <td className="px-3 py-3">{tier.sort_order}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-5">
        <h2 className="text-xl font-black">Commission Rules</h2>
        <p className="mt-2 text-sm text-slate-400">
          قواعد العمولات العامة لكل خدمة — عرض فقط في هذه المرحلة.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-right text-slate-300">
                <th className="px-3 py-3">service_type</th>
                <th className="px-3 py-3">commission_percent</th>
                <th className="px-3 py-3">commission_mode</th>
                <th className="px-3 py-3">active</th>
                <th className="px-3 py-3">notes</th>
              </tr>
            </thead>
            <tbody>
              {commissionRules.map((rule) => (
                <tr key={rule.service_type} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="px-3 py-3 font-mono">{rule.service_type}</td>
                  <td className="px-3 py-3">{rule.commission_percent}%</td>
                  <td className="px-3 py-3">{rule.commission_mode}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={rule.is_active ? "active" : "suspended"} />
                  </td>
                  <td className="px-3 py-3">{rule.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">Wallet & Withdrawals</h2>
            <p className="mt-1 text-sm text-slate-400">
              إدارة طلبات السحب — الخصم من الرصيد يتم فقط عند Mark as Paid
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {WITHDRAWAL_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setWithdrawalStatus(status)}
                className={`rounded-full px-4 py-2 text-xs font-black ${
                  withdrawalStatus === status
                    ? "bg-cyan-400 text-slate-900"
                    : "border border-white/10 bg-black/20 text-slate-200"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <span>الشبكة:</span>
            <select
              value={withdrawalNetwork}
              onChange={(event) => setWithdrawalNetwork(event.target.value)}
              className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
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
            className="min-w-[240px] flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white"
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
                <tr key={item.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="px-3 py-3">{item.partner?.username || "—"}</td>
                  <td className="px-3 py-3">{item.partner?.email || "—"}</td>
                  <td className="px-3 py-3">{formatPartnerMoney(item.amount)}</td>
                  <td className="px-3 py-3">{item.currency}</td>
                  <td className="px-3 py-3">{item.network}</td>
                  <td className="px-3 py-3">
                    <div className="flex max-w-[320px] items-center gap-2">
                      <span className="break-all font-mono text-xs">{item.walletAddress}</span>
                      <button
                        type="button"
                        onClick={() => void copyWalletAddress(item.walletAddress)}
                        className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-xs font-black"
                      >
                        نسخ
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-3">{formatDate(item.createdAt)}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      {item.status === "pending" ? (
                        <button
                          type="button"
                          disabled={Boolean(actionLoadingId)}
                          onClick={() => void runWithdrawalAction(item.id, "approve")}
                          className="admin-btn admin-btn--approve"
                        >
                          Approve
                        </button>
                      ) : null}
                      {item.status === "approved" ? (
                        <button
                          type="button"
                          disabled={Boolean(actionLoadingId)}
                          onClick={() => void runWithdrawalAction(item.id, "mark-paid")}
                          className="admin-btn admin-btn--paid"
                        >
                          Mark as Paid
                        </button>
                      ) : null}
                      {["pending", "approved"].includes(item.status) ? (
                        <button
                          type="button"
                          disabled={Boolean(actionLoadingId)}
                          onClick={() => void runWithdrawalAction(item.id, "reject")}
                          className="admin-btn admin-btn--reject"
                        >
                          Reject
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
