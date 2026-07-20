"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "../../../../lib/admin-fetch";
import { fetchDashboardStats } from "./admin-user-management-ux-helpers";
import { formatCurrencyTotals } from "../../../../lib/admin-financial-center-client";

function HubCardSkeleton() {
  return (
    <div className="admin-hub-card admin-hub-card--skeleton animate-pulse">
      <div className="h-6 w-40 rounded bg-white/15" />
      <div className="mt-4 h-10 w-24 rounded bg-white/10" />
      <div className="mt-6 h-10 w-full rounded-xl bg-white/10" />
    </div>
  );
}

export default function AdminHubCards() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userStats, setUserStats] = useState(null);
  const [financeOverview, setFinanceOverview] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [userStatsResult, financeResponse] = await Promise.all([
        fetchDashboardStats(adminFetch),
        adminFetch("/api/admin/financial-center?section=overview", { cache: "no-store" }),
      ]);

      const financeResult = await financeResponse.json().catch(() => ({}));

      setUserStats(userStatsResult || null);

      if (financeResponse.ok && financeResult?.success) {
        setFinanceOverview(financeResult.overview || financeResult);
      }
    } catch (loadError) {
      setError(loadError?.message || "تعذر تحميل الملخص");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <section className="admin-hub-grid">
        <HubCardSkeleton />
        <HubCardSkeleton />
      </section>
    );
  }

  return (
    <section className="admin-hub-grid">
      <article className="admin-hub-card">
        <div className="admin-hub-card__head">
          <span className="admin-hub-card__icon" aria-hidden="true">
            👥
          </span>
          <div>
            <h2 className="admin-hub-card__title">إدارة المستخدمين</h2>
            <p className="admin-hub-card__desc">CRM كامل للمستخدمين، الفلاتر، الإجراءات، ومركز المستخدم المستقل.</p>
          </div>
        </div>
        <div className="admin-hub-card__stats">
          <div>
            <span>إجمالي المستخدمين</span>
            <strong>{userStats?.total ?? "—"}</strong>
          </div>
          <div>
            <span>نشطون</span>
            <strong>{userStats?.active ?? "—"}</strong>
          </div>
          <div>
            <span>اشتراكات نشطة</span>
            <strong>{userStats?.withActiveSubscriptions ?? "—"}</strong>
          </div>
        </div>
        <Link href="/admin/users" className="admin-hub-card__cta">
          فتح إدارة المستخدمين
        </Link>
      </article>

      <article className="admin-hub-card">
        <div className="admin-hub-card__head">
          <span className="admin-hub-card__icon" aria-hidden="true">
            💰
          </span>
          <div>
            <h2 className="admin-hub-card__title">المركز المالي</h2>
            <p className="admin-hub-card__desc">إيرادات تقديرية، الاشتراكات، إثباتات الدفع، والتقارير — Read-only.</p>
          </div>
        </div>
        <div className="admin-hub-card__stats">
          <div>
            <span>إيراد الشهر (تقديري)</span>
            <strong>{formatCurrencyTotals(financeOverview?.recognizedRevenueMonth)}</strong>
          </div>
          <div>
            <span>اشتراكات نشطة</span>
            <strong>{financeOverview?.activeSubscriptions ?? "—"}</strong>
          </div>
          <div>
            <span>بانتظار المراجعة</span>
            <strong>{financeOverview?.pendingReviews ?? "—"}</strong>
          </div>
        </div>
        <Link href="/admin/financial-center" className="admin-hub-card__cta">
          فتح المركز المالي
        </Link>
      </article>

      {error ? (
        <p className="admin-hub-card__error col-span-full text-sm font-bold text-amber-200/90">{error}</p>
      ) : null}
    </section>
  );
}
