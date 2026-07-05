"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAppModal } from "../components/AppModalProvider";
import { PartnerQrCode } from "../components/partner/PartnerQrCode";
import { PartnerAnalyticsDashboard } from "../components/partner/PartnerAnalyticsDashboard";
import { PartnerRewardsPanel } from "../components/partner/PartnerRewardsPanel";
import { PartnerMetricSkeletonGrid } from "../components/partner/PartnerLoadingSkeleton";
import { useRequireAuth } from "../hooks/useRequireAuth";
import {
  MIN_PARTNER_WITHDRAWAL_USDT,
  WITHDRAWAL_NETWORKS,
  commissionStatusLabel,
  formatPartnerMoney,
  serviceTypeLabel,
  withdrawalStatusLabel,
} from "../../lib/partner-shared";

function MetricCard({ title, value, icon, tone = "blue" }) {
  return (
    <div className={`user-dashboard-metric user-dashboard-metric--${tone}`}>
      <div className="user-dashboard-metric__icon" aria-hidden="true">
        {icon}
      </div>
      <div>
        <p className="user-dashboard-metric__title">{title}</p>
        <p className="user-dashboard-metric__value">{value}</p>
      </div>
    </div>
  );
}

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

function EmptyState({ message, icon = "📭" }) {
  return (
    <div className="user-dashboard-empty">
      <span className="user-dashboard-empty__icon" aria-hidden="true">
        {icon}
      </span>
      <p>{message}</p>
    </div>
  );
}

function statusLabel(status) {
  const referralMap = {
    registered: "مسجل",
    active: "نشط",
    inactive: "غير نشط",
  };

  return referralMap[status] || commissionStatusLabel(status);
}

function sourceLabel(sourceType) {
  const map = {
    signup_bonus: "مكافأة تسجيل",
    vip_subscription: "اشتراك VIP",
    account_management: "إدارة حسابات",
  };

  return map[sourceType] || sourceType || "—";
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

export default function PartnerCenterPage() {
  const { showAppModal } = useAppModal();
  const { sessionPending, isAuthenticated, shouldShowLogin } = useRequireAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawNetwork, setWithdrawNetwork] = useState("TRC20");
  const [withdrawWallet, setWithdrawWallet] = useState("");
  const [withdrawNote, setWithdrawNote] = useState("");
  const [withdrawConfirmed, setWithdrawConfirmed] = useState(false);
  const [submittingWithdraw, setSubmittingWithdraw] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);

    try {
      const [centerResponse, walletResponse] = await Promise.all([
        fetch("/api/partner/center", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/partner/wallet", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }),
      ]);

      const result = await centerResponse.json().catch(() => null);
      const walletResult = await walletResponse.json().catch(() => null);

      if (!centerResponse.ok || !result?.success) {
        throw new Error(result?.error || "تعذر تحميل مركز الشركاء");
      }

      setData({
        ...result,
        wallet: walletResult?.success ? walletResult.wallet : null,
      });
    } catch (error) {
      showAppModal({
        type: "error",
        title: "مركز الشركاء",
        message: error?.message || "تعذر تحميل البيانات",
      });
    } finally {
      setLoading(false);
    }
  }, [showAppModal]);

  useEffect(() => {
    if (sessionPending || !isAuthenticated) return;
    void loadDashboard();
  }, [sessionPending, isAuthenticated, loadDashboard]);

  const partner = data?.partner;
  const wallet = data?.wallet;
  const tierProgress = data?.tierProgress;
  const canRequestWithdrawal = Boolean(wallet?.canWithdraw);
  const qrLink = partner?.shortReferralLink || partner?.referralLink || "";

  const copyReferralLink = async () => {
    if (!partner?.referralLink) return;

    try {
      await navigator.clipboard.writeText(partner.referralLink);
      showAppModal({
        type: "success",
        title: "تم النسخ",
        message: "تم نسخ رابط الإحالة بنجاح",
      });
    } catch {
      showAppModal({
        type: "warning",
        title: "تعذر النسخ",
        message: "انسخ الرابط يدويًا من الحقل",
      });
    }
  };

  const submitWithdrawal = async (event) => {
    event.preventDefault();

    if (!withdrawConfirmed) {
      showAppModal({
        type: "warning",
        title: "تأكيد مطلوب",
        message: "يرجى تأكيد صحة عنوان المحفظة والشبكة",
      });
      return;
    }

    setSubmittingWithdraw(true);

    try {
      const response = await fetch("/api/partner/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: withdrawAmount,
          network: withdrawNetwork,
          walletAddress: withdrawWallet,
          partnerNote: withdrawNote,
          confirmed: withdrawConfirmed,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر إرسال طلب السحب");
      }

      showAppModal({
        type: "success",
        title: "طلب السحب",
        message: result.message || "تم إرسال الطلب بنجاح",
      });

      setWithdrawOpen(false);
      setWithdrawAmount("");
      setWithdrawWallet("");
      setWithdrawNote("");
      setWithdrawConfirmed(false);
      await loadDashboard();
    } catch (error) {
      showAppModal({
        type: "error",
        title: "طلب السحب",
        message: error?.message || "تعذر إرسال الطلب",
      });
    } finally {
      setSubmittingWithdraw(false);
    }
  };

  if (sessionPending) {
    return (
      <div className="user-dashboard-page">
        <div className="user-dashboard-empty">
          <span className="user-dashboard-empty__icon" aria-hidden="true">
            ⏳
          </span>
          <p>جاري التحقق من الجلسة...</p>
        </div>
      </div>
    );
  }

  if (shouldShowLogin) {
    return (
      <div className="user-dashboard-page">
        <div className="user-dashboard-empty">
          <span className="user-dashboard-empty__icon" aria-hidden="true">
            🔐
          </span>
          <p>يجب تسجيل الدخول للوصول إلى مركز الشركاء</p>
          <Link href="/login" className="user-dashboard-action mt-4 inline-flex">
            <span className="user-dashboard-action__icon" aria-hidden="true">
              →
            </span>
            <div>
              <h3 className="user-dashboard-action__title">الدخول للحساب</h3>
            </div>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="user-dashboard-page space-y-6">
      <header className="user-dashboard-hero">
        <div>
          <p className="user-dashboard-hero__eyebrow">Partner Program</p>
          <h1 className="user-dashboard-hero__title">مركز الشركاء</h1>
          <p className="user-dashboard-hero__subtitle">
            شارك رابط الإحالة الخاص بك وتابع الزيارات والتسجيلات والأرباح من مكان واحد.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="user-dashboard-panel">
          <div className="user-dashboard-panel__body">
            <PartnerMetricSkeletonGrid count={6} />
          </div>
        </div>
      ) : partner ? (
        <>
          <PartnerAnalyticsDashboard />

          <PartnerRewardsPanel initialRewards={data?.rewards} />

          <Panel
            title="مستوى الشريك"
            subtitle="تزداد نسبة العمولة 5% مع كل مستوى — الترقية تلقائية للأعلى فقط"
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-[#07142f]/60 p-5">
                <p className="text-sm font-bold text-cyan-100/70">المستوى الحالي</p>
                <p className="mt-2 text-3xl font-black text-white">
                  {tierProgress?.tierName || partner.tierName || "Partner"}
                </p>
                <p className="mt-2 text-lg font-bold text-emerald-300">
                  نسبة العمولة: {tierProgress?.commissionPercent ?? partner.commissionPercent ?? 10}%
                </p>
                {tierProgress?.tierUpdatedAt ? (
                  <p className="mt-2 text-xs text-slate-400">
                    آخر تحديث للمستوى: {formatDate(tierProgress.tierUpdatedAt)}
                  </p>
                ) : null}
              </div>

              {tierProgress?.nextTier ? (
                <div className="rounded-2xl border border-white/10 bg-[#07142f]/60 p-5">
                  <p className="text-sm font-bold text-cyan-100/70">
                    التقدم نحو {tierProgress.nextTier.tierName} ({tierProgress.nextTier.commissionPercent}%)
                  </p>
                  <div className="mt-4 space-y-4">
                    <div>
                      <div className="mb-1 flex justify-between text-xs text-slate-300">
                        <span>الحسابات النشطة</span>
                        <span>
                          {tierProgress.activeReferrals} / {tierProgress.nextTier.minActiveReferrals}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-cyan-400 transition-all"
                          style={{ width: `${tierProgress.nextTier.activeReferralsProgress}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-xs text-slate-300">
                        <span>إجمالي المبيعات المعتمدة</span>
                        <span>
                          {formatPartnerMoney(tierProgress.totalSales)} /{" "}
                          {formatPartnerMoney(tierProgress.nextTier.minTotalSales)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-emerald-400 transition-all"
                          style={{ width: `${tierProgress.nextTier.totalSalesProgress}%` }}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-slate-400">
                      شروط المستوى التالي: {tierProgress.nextTier.minActiveReferrals} حساب نشط على
                      الأقل و{formatPartnerMoney(tierProgress.nextTier.minTotalSales)} مبيعات معتمدة.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-5">
                  <p className="text-lg font-black text-emerald-200">أعلى مستوى — Diamond</p>
                  <p className="mt-2 text-sm text-emerald-100/80">
                    وصلت إلى أعلى مستوى في برنامج الشركاء بنسبة عمولة 30%.
                  </p>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="محفظة الشريك" subtitle="أرصدتك وطلبات السحب — USDT">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <MetricCard
                title="الرصيد القابل للسحب"
                value={formatPartnerMoney(wallet?.balanceWithdrawable ?? partner.balanceWithdrawable)}
                icon="💵"
                tone="green"
              />
              <MetricCard
                title="الرصيد المعلق"
                value={formatPartnerMoney(wallet?.balancePending ?? partner.balancePending)}
                icon="⏳"
                tone="blue"
              />
              <MetricCard
                title="رصيد مكافآت التسجيل"
                value={formatPartnerMoney(wallet?.balanceBonusPending ?? partner.balanceBonusPending)}
                icon="🎁"
                tone="cyan"
              />
              <MetricCard
                title="إجمالي الأرباح"
                value={formatPartnerMoney(wallet?.totalEarnings ?? partner.totalEarnings)}
                icon="💰"
                tone="gold"
              />
              <MetricCard
                title="إجمالي المسحوب"
                value={formatPartnerMoney(wallet?.totalWithdrawn ?? 0)}
                icon="🏦"
                tone="blue"
              />
              <MetricCard
                title="آخر عملية سحب"
                value={
                  wallet?.lastWithdrawal
                    ? formatPartnerMoney(wallet.lastWithdrawal.amount)
                    : "—"
                }
                icon="📤"
                tone="cyan"
              />
            </div>

            {wallet?.lastWithdrawal ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-[#07142f]/60 p-4 text-sm">
                <p className="font-bold text-white">
                  حالة آخر طلب: {withdrawalStatusLabel(wallet.lastWithdrawalStatus)}
                </p>
                <p className="mt-2 text-slate-300">
                  {wallet.lastWithdrawal.network} · {formatDate(wallet.lastWithdrawal.createdAt)}
                  {wallet.lastWithdrawal.paidAt
                    ? ` · مدفوع: ${formatDate(wallet.lastWithdrawal.paidAt)}`
                    : ""}
                </p>
              </div>
            ) : null}
          </Panel>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="مشتركو VIP Signals" value={partner.vipSignalCount ?? 0} icon="⭐" tone="blue" />
            <MetricCard title="VIP Spot" value={partner.vipSpotCount ?? 0} icon="📈" tone="cyan" />
            <MetricCard
              title="إدارة الحسابات"
              value={partner.accountManagementCount ?? 0}
              icon="📂"
              tone="green"
            />
            <MetricCard title="الأكاديمية" value={partner.academyCount ?? 0} icon="🎓" tone="gold" />
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="إجمالي العمولات"
              value={partner.totalCommissionsCount ?? 0}
              icon="💼"
              tone="blue"
            />
            <MetricCard
              title="العمولات المعلقة"
              value={formatPartnerMoney(partner.pendingCommissionsAmount ?? 0)}
              icon="⏳"
              tone="cyan"
            />
            <MetricCard
              title="العمولات القابلة للسحب"
              value={formatPartnerMoney(partner.withdrawableCommissionsAmount ?? 0)}
              icon="💵"
              tone="green"
            />
            <MetricCard
              title="إجمالي الأرباح"
              value={formatPartnerMoney(partner.totalEarnings)}
              icon="💰"
              tone="gold"
            />
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="عدد الزيارات" value={partner.visitCount} icon="👁️" tone="blue" />
            <MetricCard title="عدد المسجلين" value={partner.signupCount} icon="📝" tone="cyan" />
            <MetricCard
              title="عدد الحسابات النشطة"
              value={partner.activeAccountCount}
              icon="✅"
              tone="green"
            />
            <MetricCard
              title="رصيد المكافآت"
              value={formatPartnerMoney(partner.balanceBonusPending)}
              icon="🎁"
              tone="gold"
            />
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <MetricCard
              title="الرصيد القابل للسحب"
              value={formatPartnerMoney(partner.balanceWithdrawable)}
              icon="💵"
              tone="green"
            />
            <MetricCard
              title="الرصيد المعلق"
              value={formatPartnerMoney(partner.balancePending)}
              icon="⏳"
              tone="blue"
            />
            <MetricCard
              title="رصيد المكافآت"
              value={formatPartnerMoney(partner.balanceBonusPending)}
              icon="🎁"
              tone="cyan"
            />
          </section>

          <Panel title="رابط الإحالة" subtitle="شارك هذا الرابط — الزائر يرى الصفحة الرئيسية بشكل طبيعي">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-bold text-cyan-100/80">كود الإحالة</label>
                  <input
                    type="text"
                    readOnly
                    value={partner.referralCode}
                    className="w-full rounded-2xl border border-white/10 bg-[#07142f]/80 px-4 py-3 font-mono text-white"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-bold text-cyan-100/80">رابط الإحالة</label>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      type="text"
                      readOnly
                      value={partner.referralLink}
                      className="w-full rounded-2xl border border-white/10 bg-[#07142f]/80 px-4 py-3 text-sm text-white"
                    />
                    <button
                      type="button"
                      onClick={() => void copyReferralLink()}
                      className="shrink-0 rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-5 py-3 font-black text-white"
                    >
                      نسخ الرابط
                    </button>
                  </div>
                </div>
              </div>

              {qrLink ? (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-white p-4">
                  <PartnerQrCode value={qrLink} size={220} />
                  <p className="mt-3 text-sm font-bold text-slate-700">QR Code</p>
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel title="سجل الإحالات" subtitle="المستخدمون الذين سجّلوا عبر رابطك">
            {data.referrals?.length ? (
              <div className="space-y-3">
                {data.referrals.map((item) => (
                  <article key={item.id} className="user-dashboard-list-item">
                    <div className="user-dashboard-list-item__head">
                      <div className="user-dashboard-list-item__main">
                        <h3 className="user-dashboard-list-item__title">
                          {item.referred_username || "مستخدم مدعو"}
                        </h3>
                        <p className="user-dashboard-list-item__meta">
                          كود {item.referral_code} · {formatDate(item.registered_at)}
                        </p>
                      </div>
                      <span className="user-dashboard-badge user-dashboard-badge--active">
                        {statusLabel(item.status)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState message="لا توجد إحالات مسجلة بعد" icon="🔗" />
            )}
          </Panel>

          <Panel title="سجل العمولات" subtitle="تفاصيل كل عمولة: الخدمة، السبب، النسبة، المبلغ، الحالة، والتاريخ">
            {data.commissions?.length ? (
              <div className="space-y-3">
                {data.commissions.map((item) => (
                  <article key={item.id} className="user-dashboard-list-item">
                    <div className="user-dashboard-list-item__head">
                      <div className="user-dashboard-list-item__main">
                        <h3 className="user-dashboard-list-item__title">
                          {serviceTypeLabel(item.service_type)} — {formatPartnerMoney(item.amount)}
                        </h3>
                        <p className="user-dashboard-list-item__meta">
                          السبب: {item.reason || item.description || "—"}
                        </p>
                        <p className="user-dashboard-list-item__meta">
                          النسبة: {item.commission_percent != null ? `${item.commission_percent}%` : "—"}
                          {" · "}
                          المستخدم: {item.invited_username || "—"}
                          {" · "}
                          {formatDate(item.created_at)}
                        </p>
                      </div>
                      <span
                        className={`user-dashboard-badge ${
                          item.status === "withdrawable" || item.is_withdrawable
                            ? "user-dashboard-badge--done"
                            : "user-dashboard-badge--active"
                        }`}
                      >
                        {statusLabel(item.status)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState message="لا توجد عمولات بعد" icon="💼" />
            )}
          </Panel>

          <Panel
            title="طلب السحب"
            subtitle={`السحب يدوي بعد مراجعة الإدارة — الحد الأدنى ${MIN_PARTNER_WITHDRAWAL_USDT} USDT`}
          >
            <div className="space-y-4">
              {!canRequestWithdrawal ? (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  {(wallet?.balanceWithdrawable ?? partner.balanceWithdrawable ?? 0) <
                  MIN_PARTNER_WITHDRAWAL_USDT
                    ? `الحد الأدنى للسحب هو ${MIN_PARTNER_WITHDRAWAL_USDT} USDT`
                    : wallet?.hasActiveWithdrawalRequest
                      ? "لديك طلب سحب قيد المراجعة — لا يمكن إنشاء طلب جديد حتى تتم معالجته"
                      : "لا يمكن طلب السحب حاليًا"}
                </div>
              ) : null}

              {!withdrawOpen ? (
                <button
                  type="button"
                  onClick={() => setWithdrawOpen(true)}
                  disabled={!canRequestWithdrawal}
                  className="rounded-2xl bg-gradient-to-l from-emerald-600 to-cyan-400 px-6 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  طلب سحب الأرباح
                </button>
              ) : (
                <form onSubmit={submitWithdrawal} className="space-y-4 max-w-xl">
                  <div>
                    <label className="mb-2 block text-sm font-bold">المبلغ (USDT)</label>
                    <input
                      type="number"
                      min={MIN_PARTNER_WITHDRAWAL_USDT}
                      step="0.01"
                      max={wallet?.balanceWithdrawable ?? partner.balanceWithdrawable}
                      value={withdrawAmount}
                      onChange={(event) => setWithdrawAmount(event.target.value)}
                      required
                      className="w-full rounded-2xl border border-white/10 bg-[#07142f]/80 px-4 py-3 text-white"
                    />
                    <p className="mt-2 text-xs text-cyan-100/60">
                      الحد الأدنى: {MIN_PARTNER_WITHDRAWAL_USDT} USDT · الحد الأقصى:{" "}
                      {formatPartnerMoney(wallet?.balanceWithdrawable ?? partner.balanceWithdrawable)}
                    </p>
                  </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold">العملة</label>
                      <input
                        type="text"
                        readOnly
                        value="USDT"
                        className="w-full rounded-2xl border border-white/10 bg-[#07142f]/80 px-4 py-3 text-white"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold">الشبكة</label>
                      <select
                        value={withdrawNetwork}
                        onChange={(event) => setWithdrawNetwork(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-[#07142f]/80 px-4 py-3 text-white"
                      >
                        {WITHDRAWAL_NETWORKS.map((network) => (
                          <option key={network} value={network}>
                            {network}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold">عنوان المحفظة</label>
                      <input
                        type="text"
                        value={withdrawWallet}
                        onChange={(event) => setWithdrawWallet(event.target.value)}
                        required
                        className="w-full rounded-2xl border border-white/10 bg-[#07142f]/80 px-4 py-3 font-mono text-white"
                        placeholder="أدخل عنوان المحفظة"
                      />
                    </div>

                    <label className="flex items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={withdrawConfirmed}
                        onChange={(event) => setWithdrawConfirmed(event.target.checked)}
                        className="mt-1"
                      />
                      <span>أؤكد أن عنوان المحفظة والشبكة صحيحان</span>
                    </label>

                    <div>
                      <label className="mb-2 block text-sm font-bold">ملاحظات (اختياري)</label>
                      <textarea
                        value={withdrawNote}
                        onChange={(event) => setWithdrawNote(event.target.value)}
                        rows={3}
                        maxLength={500}
                        className="w-full rounded-2xl border border-white/10 bg-[#07142f]/80 px-4 py-3 text-white"
                        placeholder="أي ملاحظات للإدارة..."
                      />
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="submit"
                        disabled={submittingWithdraw}
                        className="rounded-2xl bg-gradient-to-l from-emerald-600 to-cyan-400 px-6 py-3 font-black text-white disabled:opacity-60"
                      >
                        {submittingWithdraw ? "جاري الإرسال..." : "إرسال"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setWithdrawOpen(false);
                          setWithdrawConfirmed(false);
                          setWithdrawNote("");
                        }}
                        className="rounded-2xl border border-white/15 px-6 py-3 font-bold text-white"
                      >
                        إلغاء
                      </button>
                    </div>
                  </form>
                )}

              {data.withdrawals?.length ? (
                <div className="mt-6 space-y-3 border-t border-white/10 pt-6">
                  <h3 className="font-black text-white">طلبات السحب السابقة</h3>
                  {data.withdrawals.map((item) => (
                    <article key={item.id} className="user-dashboard-list-item">
                      <div className="user-dashboard-list-item__head">
                        <div className="user-dashboard-list-item__main">
                          <h3 className="user-dashboard-list-item__title">
                            {formatPartnerMoney(item.amount)} {item.currency} · {item.network}
                          </h3>
                          <p className="user-dashboard-list-item__meta break-all">
                            {item.wallet_address} · {formatDate(item.created_at)}
                          </p>
                          {item.partner_note ? (
                            <p className="user-dashboard-list-item__meta">ملاحظة: {item.partner_note}</p>
                          ) : null}
                        </div>
                        <span className="user-dashboard-badge user-dashboard-badge--active">
                          {withdrawalStatusLabel(item.status)}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          </Panel>
        </>
      ) : (
        <EmptyState message="تعذر تحميل بيانات مركز الشركاء" icon="⚠️" />
      )}
    </div>
  );
}
