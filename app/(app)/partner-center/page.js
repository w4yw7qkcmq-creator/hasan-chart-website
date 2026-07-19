"use client";

import "./partner-center-theme.css";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAppModal } from "../../components/AppModalProvider";
import { PartnerMetricSkeletonGrid } from "../../components/partner/PartnerLoadingSkeleton";
import { useRequireAuth } from "../../hooks/useRequireAuth";
import { useVisibilityRefresh } from "../../hooks/useVisibilityRefresh";
import {
  MIN_PARTNER_WITHDRAWAL_USDT,
  WITHDRAWAL_NETWORKS,
  commissionStatusLabel,
  formatPartnerMoney,
  buildReferralLink,
  getPartnerSiteUrl,
  serviceTypeLabel,
  withdrawalStatusLabel,
} from "../../../lib/partner-shared";

const PublicServiceLanding = dynamic(
  () =>
    import("../../components/public-seo/PublicServiceLanding").then(
      (mod) => mod.default
    ),
  { ssr: false }
);

const PartnerQrCode = dynamic(
  () => import("../../components/partner/PartnerQrCode").then((mod) => mod.PartnerQrCode),
  { ssr: false }
);

const PartnerAnalyticsDashboard = dynamic(
  () =>
    import("../../components/partner/PartnerAnalyticsDashboard").then(
      (mod) => mod.PartnerAnalyticsDashboard
    ),
  { ssr: false, loading: () => <PartnerMetricSkeletonGrid count={4} /> }
);

const PartnerRewardsPanel = dynamic(
  () => import("../../components/partner/PartnerRewardsPanel").then((mod) => mod.PartnerRewardsPanel),
  { ssr: false }
);

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
  const loadInFlightRef = useRef(false);

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (loadInFlightRef.current) {
      return;
    }

    loadInFlightRef.current = true;

    if (!silent) {
      setLoading(true);
    }

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
      loadInFlightRef.current = false;
      if (!silent) {
        setLoading(false);
      }
    }
  }, [showAppModal]);

  useEffect(() => {
    if (sessionPending || !isAuthenticated) return;
    void loadDashboard();
  }, [sessionPending, isAuthenticated, loadDashboard]);

  useVisibilityRefresh(() => loadDashboard({ silent: true }), {
    enabled: !sessionPending && isAuthenticated,
    intervalMs: 30000,
    refreshOnFocus: true,
  });

  const partner = data?.partner;
  const wallet = data?.wallet;
  const tierProgress = data?.tierProgress;
  const canRequestWithdrawal = Boolean(wallet?.canWithdraw);
  const referralLink = partner?.referralCode
    ? buildReferralLink(partner.referralCode, getPartnerSiteUrl())
    : partner?.referralLink || "";
  const qrLink = referralLink;

  const copyReferralLink = async () => {
    if (!referralLink) return;

    try {
      await navigator.clipboard.writeText(referralLink);
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

      if (result.withdrawal) {
        setData((current) => {
          if (!current) return current;

          return {
            ...current,
            withdrawals: [result.withdrawal, ...(current.withdrawals || [])].slice(0, 20),
            wallet: current.wallet
              ? {
                  ...current.wallet,
                  canWithdraw: false,
                  hasActiveWithdrawalRequest: true,
                }
              : current.wallet,
          };
        });
      }

      void loadDashboard({ silent: true });
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
    return <PublicServiceLanding pageKey="partner-center" />;
  }

  return (
    <div className="user-dashboard-page partner-center-page space-y-6">
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
              <div className="partner-surface partner-surface--p5">
                <p className="partner-label">المستوى الحالي</p>
                <p className="partner-title-lg">
                  {tierProgress?.tierName || partner.tierName || "Partner"}
                </p>
                <p className="partner-accent-green">
                  نسبة العمولة: {tierProgress?.commissionPercent ?? partner.commissionPercent ?? 10}%
                </p>
                {tierProgress?.tierUpdatedAt ? (
                  <p className="partner-muted--sm mt-2">
                    آخر تحديث للمستوى: {formatDate(tierProgress.tierUpdatedAt)}
                  </p>
                ) : null}
              </div>

              {tierProgress?.nextTier ? (
                <div className="partner-surface partner-surface--p5">
                  <p className="partner-label">
                    التقدم نحو {tierProgress.nextTier.tierName} ({tierProgress.nextTier.commissionPercent}%)
                  </p>
                  <div className="partner-progress">
                    <div className="partner-progress">
                      <div className="partner-progress__head">
                        <span>الحسابات النشطة</span>
                        <span>
                          {tierProgress.activeReferrals} / {tierProgress.nextTier.minActiveReferrals}
                        </span>
                      </div>
                      <div className="partner-progress__track">
                        <div
                          className="partner-progress__fill partner-progress__fill--cyan"
                          style={{ width: `${tierProgress.nextTier.activeReferralsProgress}%` }}
                        />
                      </div>
                    </div>
                    <div className="partner-progress">
                      <div className="partner-progress__head">
                        <span>إجمالي المبيعات المعتمدة</span>
                        <span>
                          {formatPartnerMoney(tierProgress.totalSales)} /{" "}
                          {formatPartnerMoney(tierProgress.nextTier.minTotalSales)}
                        </span>
                      </div>
                      <div className="partner-progress__track">
                        <div
                          className="partner-progress__fill partner-progress__fill--green"
                          style={{ width: `${tierProgress.nextTier.totalSalesProgress}%` }}
                        />
                      </div>
                    </div>
                    <p className="partner-progress__hint">
                      شروط المستوى التالي: {tierProgress.nextTier.minActiveReferrals} حساب نشط على
                      الأقل و{formatPartnerMoney(tierProgress.nextTier.minTotalSales)} مبيعات معتمدة.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="partner-surface partner-surface--p5 partner-surface--success">
                  <p className="partner-accent-success-title">أعلى مستوى — Diamond</p>
                  <p className="partner-accent-success-text">
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
              <div className="partner-surface partner-surface--p4 partner-wallet-note mt-4">
                <p className="partner-wallet-note__title">
                  حالة آخر طلب: {withdrawalStatusLabel(wallet.lastWithdrawalStatus)}
                </p>
                <p className="partner-wallet-note__meta">
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
                  <label className="partner-label mb-2 block">كود الإحالة</label>
                  <input
                    type="text"
                    readOnly
                    value={partner.referralCode}
                    className="partner-input partner-input--mono"
                  />
                </div>
                <div>
                  <label className="partner-label mb-2 block">رابط الإحالة</label>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      type="text"
                      readOnly
                      value={referralLink}
                      className="partner-input text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void copyReferralLink()}
                      className="partner-btn-primary"
                    >
                      نسخ الرابط
                    </button>
                  </div>
                </div>
              </div>

              {qrLink ? (
                <div className="partner-qr-box">
                  <PartnerQrCode value={qrLink} size={220} />
                  <p className="partner-qr-box__label">QR Code</p>
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel title="سجل الإحالات" subtitle="المستخدمون الذين سجّلوا عبر رابطك">
            {data.referrals?.length ? (
              <div className="partner-scroll-panel partner-scroll-panel--list space-y-3">
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
              <div className="partner-scroll-panel partner-scroll-panel--list space-y-3">
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
                <div className="partner-alert-warn">
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
                  className="partner-btn-success disabled:cursor-not-allowed"
                >
                  طلب سحب الأرباح
                </button>
              ) : (
                <form onSubmit={submitWithdrawal} className="space-y-4 max-w-xl">
                  <div>
                    <label className="partner-label mb-2 block">المبلغ (USDT)</label>
                    <input
                      type="number"
                      min={MIN_PARTNER_WITHDRAWAL_USDT}
                      step="0.01"
                      max={wallet?.balanceWithdrawable ?? partner.balanceWithdrawable}
                      value={withdrawAmount}
                      onChange={(event) => setWithdrawAmount(event.target.value)}
                      required
                      className="partner-input"
                    />
                    <p className="partner-input-hint">
                      الحد الأدنى: {MIN_PARTNER_WITHDRAWAL_USDT} USDT · الحد الأقصى:{" "}
                      {formatPartnerMoney(wallet?.balanceWithdrawable ?? partner.balanceWithdrawable)}
                    </p>
                  </div>

                    <div>
                      <label className="partner-label mb-2 block">العملة</label>
                      <input
                        type="text"
                        readOnly
                        value="USDT"
                        className="partner-input"
                      />
                    </div>

                    <div>
                      <label className="partner-label mb-2 block">الشبكة</label>
                      <select
                        value={withdrawNetwork}
                        onChange={(event) => setWithdrawNetwork(event.target.value)}
                        className="partner-select"
                      >
                        {WITHDRAWAL_NETWORKS.map((network) => (
                          <option key={network} value={network}>
                            {network}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="partner-label mb-2 block">عنوان المحفظة</label>
                      <input
                        type="text"
                        value={withdrawWallet}
                        onChange={(event) => setWithdrawWallet(event.target.value)}
                        required
                        className="partner-input partner-input--mono"
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
                      <label className="partner-label mb-2 block">ملاحظات (اختياري)</label>
                      <textarea
                        value={withdrawNote}
                        onChange={(event) => setWithdrawNote(event.target.value)}
                        rows={3}
                        maxLength={500}
                        className="partner-textarea"
                        placeholder="أي ملاحظات للإدارة..."
                      />
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="submit"
                        disabled={submittingWithdraw}
                        className="partner-btn-success"
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
                        className="partner-btn-ghost"
                      >
                        إلغاء
                      </button>
                    </div>
                  </form>
                )}

              {data.withdrawals?.length ? (
                <div className="partner-divider">
                  <h3 className="partner-divider__title">طلبات السحب السابقة</h3>
                  <div className="partner-scroll-panel partner-scroll-panel--list mt-3 space-y-3">
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
