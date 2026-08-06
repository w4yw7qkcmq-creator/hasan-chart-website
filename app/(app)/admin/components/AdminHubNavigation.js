"use client";

import Link from "next/link";
import { ADMIN_HUB_QUICK_NAV_ITEMS, filterAdminNavByPermission } from "./admin-hub-config";
import { useAuth } from "../../../components/AuthProvider";

function resolveStatValue(stats, key) {
  if (!key) return null;
  const value = stats?.[key];
  if (value === null || value === undefined) return null;
  return Number(value);
}

export default function AdminHubNavigation({ stats = {}, onNavigateTab }) {
  const { can, isAdmin, iamUiEnabled } = useAuth();
  const navItems = filterAdminNavByPermission(ADMIN_HUB_QUICK_NAV_ITEMS, can, {
    iamUiEnabled,
    isAdmin,
  });

  const handleClick = (item, event) => {
    if (item.tab) {
      event.preventDefault();
      onNavigateTab?.(item.tab);
    }
  };

  return (
    <section className="admin-hub-nav-section admin-section">
      <div className="admin-hub-section-head">
        <h2 className="admin-heading text-xl">مركز التحكم</h2>
        <p className="admin-hub-section-head__desc">انتقل مباشرة إلى أي قسم — بطاقة كاملة قابلة للنقر.</p>
      </div>

      <div className="admin-hub-tile-grid">
        {navItems.map((item, index) => {
          const statValue = resolveStatValue(stats, item.statKey);
          const needsAttention = item.attentionKey && resolveStatValue(stats, item.attentionKey) > 0;

          const body = (
            <>
              <span className="admin-hub-tile__icon" aria-hidden="true">
                {item.icon}
              </span>
              <div className="admin-hub-tile__body">
                <h3 className="admin-hub-tile__title">{item.title}</h3>
                <p className="admin-hub-tile__desc">{item.description}</p>
              </div>
              <div className="admin-hub-tile__footer">
                {statValue !== null ? (
                  <p className="admin-hub-tile__value">{statValue.toLocaleString("ar")}</p>
                ) : (
                  <p className="admin-hub-tile__value admin-hub-tile__value--muted">—</p>
                )}
                {statValue !== null && item.statLabel ? (
                  <p className="admin-hub-tile__stat-label">{item.statLabel}</p>
                ) : null}
              </div>
              {needsAttention ? <span className="admin-hub-tile__flag">متابعة</span> : null}
              <span className="admin-hub-tile__arrow" aria-hidden="true">
                ←
              </span>
            </>
          );

          const className = `admin-hub-tile admin-animate-in ${needsAttention ? "is-attention" : ""}`;

          if (item.href) {
            return (
              <Link
                key={item.id || item.title}
                href={item.href}
                className={className}
                style={{ animationDelay: `${index * 35}ms` }}
              >
                {body}
              </Link>
            );
          }

          return (
            <button
              key={item.id || item.title}
              type="button"
              className={`${className} admin-hub-tile--button`}
              style={{ animationDelay: `${index * 35}ms` }}
              onClick={(event) => handleClick(item, event)}
            >
              {body}
            </button>
          );
        })}
      </div>
    </section>
  );
}
