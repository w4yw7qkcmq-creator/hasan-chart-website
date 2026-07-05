"use client";

import "../../admin-theme.css";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { adminFetch } from "../../../../lib/admin-fetch";
import { formatPartnerMoney, serviceTypeLabel } from "../../../../lib/partner-shared";

function StatusBadge({ status }) {
  const labels = {
    pending: "معلق",
    approved: "معتمد",
    rejected: "مرفوض",
    paid: "مدفوع",
    registered: "مسجل",
    active: "نشط",
    suspended: "موقوف",
  };

  return (
    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-black">
      {labels[status] || status}
    </span>
  );
}

function timelineLabel(eventType) {
  const map = {
    client_registered: "تسجيل العميل",
    first_commission: "أول عمولة",
    tier_upgrade: "ترقية المستوى",
    withdrawal_request: "طلب سحب",
    withdrawal_approved: "قبول طلب السحب",
    withdrawal_paid: "دفع السحب",
    withdrawal_rejected: "رفض السحب",
    commission_release: "تحويل عمولة لقابل للسحب",
    admin_adjustment: "تعديل إداري",
    adjustment: "تعديل إداري",
  };

  return map[eventType] || eventType;
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

function Panel({ title, children }) {
  return (
    <section className="rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-5">
      <h2 className="mb-4 text-xl font-black">{title}</h2>
      {children}
    </section>
  );
}

export default function AdminPartnerDetailsPage() {
  const params = useParams();
  const partnerId = String(params?.id || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [timeline, setTimeline] = useState([]);

  const loadDetails = useCallback(async () => {
    if (!partnerId) return;

    setLoading(true);
    setError("");

    try {
      const [detailsResponse, timelineResponse] = await Promise.all([
        adminFetch(`/api/admin/partners/${partnerId}`, {
          method: "GET",
          cache: "no-store",
        }),
        adminFetch(`/api/admin/partner-timeline?partnerId=${encodeURIComponent(partnerId)}`, {
          method: "GET",
          cache: "no-store",
        }),
      ]);

      const result = await detailsResponse.json().catch(() => ({}));
      const timelineResult = await timelineResponse.json().catch(() => ({}));

      if (!detailsResponse.ok || !result?.success) {
        throw new Error(result?.error || "تعذر تحميل تفاصيل الشريك");
      }

      setData(result);
      setTimeline(timelineResult?.success ? timelineResult.timeline || [] : []);
    } catch (loadError) {
      setError(loadError?.message || "تعذر تحميل تفاصيل الشريك");
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  if (loading) {
    return (
      <main className="rounded-[34px] border border-cyan-300/10 bg-[#020617] p-6 text-white">
        <p className="text-slate-300">جاري تحميل تفاصيل الشريك...</p>
      </main>
    );
  }

  if (error || !data?.partner) {
    return (
      <main className="rounded-[34px] border border-cyan-300/10 bg-[#020617] p-6 text-white">
        <p className="text-red-200">{error || "الشريك غير موجود"}</p>
        <Link href="/admin/partners" className="mt-4 inline-block text-cyan-200">
          ← العودة
        </Link>
      </main>
    );
  }

  const { partner } = data;

  return (
    <main className="admin-theme-page space-y-8 rounded-[34px] border border-cyan-300/10 bg-[#020617] p-4 text-white md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-cyan-200/70">Partner Details</p>
          <h1 className="mt-2 text-3xl font-black">{partner.username}</h1>
          <p className="mt-2 text-sm text-slate-400">{partner.email}</p>
        </div>
        <Link
          href="/admin/partners"
          className="rounded-2xl border border-cyan-300/20 px-4 py-2 text-sm font-black text-cyan-100"
        >
          ← العودة لقائمة الشركاء
        </Link>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-sm text-slate-400">Referral Code</p>
          <p className="mt-2 font-mono text-lg font-black">{partner.referralCode}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-sm text-slate-400">المستوى</p>
          <p className="mt-2 text-lg font-black">{partner.tierName}</p>
          <p className="mt-1 text-sm text-emerald-300">{partner.commissionPercent}% عمولة</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-sm text-slate-400">الحالة</p>
          <p className="mt-2">
            <StatusBadge status={partner.status} />
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-sm text-slate-400">إجمالي الأرباح</p>
          <p className="mt-2 text-lg font-black">{formatPartnerMoney(partner.totalEarnings)}</p>
        </div>
      </section>

      <Panel title="Wallet Summary">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm text-slate-400">قابل للسحب</p>
            <p className="mt-2 text-lg font-black">{formatPartnerMoney(data.wallet?.balanceWithdrawable ?? partner.balanceWithdrawable)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm text-slate-400">معلق</p>
            <p className="mt-2 text-lg font-black">{formatPartnerMoney(data.wallet?.balancePending ?? partner.balancePending)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm text-slate-400">مكافآت التسجيل</p>
            <p className="mt-2 text-lg font-black">{formatPartnerMoney(data.wallet?.balanceBonusPending ?? partner.balanceBonusPending)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm text-slate-400">إجمالي الأرباح</p>
            <p className="mt-2 text-lg font-black">{formatPartnerMoney(data.wallet?.totalEarnings ?? partner.totalEarnings)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm text-slate-400">إجمالي المسحوب</p>
            <p className="mt-2 text-lg font-black">{formatPartnerMoney(data.wallet?.totalWithdrawn ?? partner.totalWithdrawn ?? 0)}</p>
          </div>
        </div>
      </Panel>

      <Panel title="Wallet Ledger">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-right text-slate-300">
                <th className="px-3 py-3">النوع</th>
                <th className="px-3 py-3">المبلغ</th>
                <th className="px-3 py-3">قبل</th>
                <th className="px-3 py-3">بعد</th>
                <th className="px-3 py-3">ملاحظة</th>
                <th className="px-3 py-3">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {(data.ledger || []).map((entry) => (
                <tr key={entry.id} className="border-b border-white/5">
                  <td className="px-3 py-3 font-mono">{entry.type}</td>
                  <td className="px-3 py-3">{formatPartnerMoney(entry.amount)}</td>
                  <td className="px-3 py-3">{formatPartnerMoney(entry.balanceBefore)}</td>
                  <td className="px-3 py-3">{formatPartnerMoney(entry.balanceAfter)}</td>
                  <td className="px-3 py-3">{entry.note || "—"}</td>
                  <td className="px-3 py-3">{formatDate(entry.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.ledger?.length ? <p className="mt-3 text-slate-400">لا يوجد سجل محفظة بعد.</p> : null}
        </div>
      </Panel>

      <Panel title="آخر العمولات القابلة للسحب">
        <div className="space-y-3">
          {(data.recentlyWithdrawableCommissions || []).map((item) => (
            <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-bold">
                  {formatPartnerMoney(item.amount)} — {serviceTypeLabel(item.service_type)}
                </p>
                <StatusBadge status={item.status} />
              </div>
              <p className="mt-2 text-sm text-slate-400">
                {item.reason || item.description} · {formatDate(item.created_at)}
              </p>
            </div>
          ))}
          {!data.recentlyWithdrawableCommissions?.length ? (
            <p className="text-slate-400">لا توجد عمولات قابلة للسحب حديثًا.</p>
          ) : null}
        </div>
      </Panel>

      <Panel title="Timeline">
        <div className="space-y-3">
          {timeline.map((item) => (
            <div
              key={`${item.eventType}-${item.referenceId}-${item.eventAt}`}
              className="relative rounded-2xl border border-white/10 bg-black/20 px-4 py-3 pl-8"
            >
              <span className="absolute right-3 top-4 h-2 w-2 rounded-full bg-cyan-400" aria-hidden="true" />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-bold">{timelineLabel(item.eventType)}</p>
                <span className="text-xs text-slate-500">{formatDate(item.eventAt)}</span>
              </div>
              <p className="mt-2 text-sm text-slate-300">{item.title}</p>
              {item.meta ? <p className="mt-1 text-xs text-slate-500">{String(item.meta)}</p> : null}
            </div>
          ))}
          {!timeline.length ? <p className="text-slate-400">لا يوجد Timeline بعد.</p> : null}
        </div>
      </Panel>

      <Panel title="روابط الإحالة">
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-sm text-slate-400">/?ref=</p>
            <input
              readOnly
              value={partner.referralLink}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm"
            />
          </div>
          <div>
            <p className="mb-1 text-sm text-slate-400">/r/</p>
            <input
              readOnly
              value={partner.shortReferralLink}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm"
            />
          </div>
        </div>
      </Panel>

      <Panel title="الإحالات">
        <div className="space-y-3">
          {(data.referrals || []).map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
            >
              <div>
                <p className="font-bold">{item.referred_username || "مستخدم"}</p>
                <p className="text-sm text-slate-400">{formatDate(item.registered_at)}</p>
              </div>
              <StatusBadge status={item.status} />
            </div>
          ))}
          {!data.referrals?.length ? <p className="text-slate-400">لا توجد إحالات.</p> : null}
        </div>
      </Panel>

      <Panel title="العمولات">
        <div className="space-y-3">
          {(data.commissions || []).map((item) => (
            <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-bold">
                  {formatPartnerMoney(item.amount)} — {item.source_type}
                </p>
                <StatusBadge status={item.status} />
              </div>
              <p className="mt-2 text-sm text-slate-400">
                {item.reason || item.description} · {item.invited_username || "—"} ·{" "}
                {serviceTypeLabel(item.service_type)} · {formatDate(item.created_at)}
              </p>
            </div>
          ))}
          {!data.commissions?.length ? <p className="text-slate-400">لا توجد عمولات.</p> : null}
        </div>
      </Panel>

      <Panel title="السحوبات">
        <div className="space-y-3">
          {(data.withdrawals || []).map((item) => (
            <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-bold">
                  {formatPartnerMoney(item.amount)} {item.currency} · {item.network}
                </p>
                <StatusBadge status={item.status} />
              </div>
              <p className="mt-2 break-all font-mono text-sm text-slate-400">{item.wallet_address}</p>
              <p className="mt-2 text-sm text-slate-400">
                {formatDate(item.created_at)}
                {item.paid_at ? ` · paid_at: ${formatDate(item.paid_at)}` : ""}
                {item.admin_note ? ` · ${item.admin_note}` : ""}
              </p>
            </div>
          ))}
          {!data.withdrawals?.length ? <p className="text-slate-400">لا توجد سحوبات.</p> : null}
        </div>
      </Panel>

      <Panel title="الحملات">
        <div className="space-y-3">
          {(data.campaigns || []).map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
            >
              <div>
                <p className="font-bold">{item.name}</p>
                <p className="text-sm text-slate-400">
                  زيارات {item.visit_count} · تسجيلات {item.signup_count}
                </p>
              </div>
              <StatusBadge status={item.is_active ? "active" : "suspended"} />
            </div>
          ))}
          {!data.campaigns?.length ? <p className="text-slate-400">لا توجد حملات.</p> : null}
        </div>
      </Panel>

      <Panel title="آخر النشاطات">
        <div className="space-y-3">
          {(data.activity || []).map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
            >
              <div>
                <p className="font-bold">{item.title}</p>
                <p className="text-sm text-slate-400">{item.meta}</p>
              </div>
              <span className="text-xs text-slate-500">{formatDate(item.createdAt)}</span>
            </div>
          ))}
          {!data.activity?.length ? <p className="text-slate-400">لا يوجد نشاط بعد.</p> : null}
        </div>
      </Panel>
    </main>
  );
}
