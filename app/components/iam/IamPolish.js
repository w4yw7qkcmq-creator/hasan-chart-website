"use client";

import { useMemo, useState } from "react";
import {
  groupPermissionsByCategory,
  IAM_ROLE_DESCRIPTIONS,
  IAM_ROLE_ICONS,
  IAM_ROLE_RISK,
  labelAuditAction,
  labelEventType,
  labelPermission,
  labelRole,
  labelSeverity,
} from "../../../lib/iam/ui-labels";
import {
  exportToCsv,
  exportToJson,
  filterByDateRange,
  filterBySearch,
  formatDateTime,
  formatRelativeTime,
  maskIp,
  paginateRows,
  parseUserAgent,
  sessionDuration,
} from "../../../lib/iam/ui-utils";
import {
  IamBadge,
  IamEmptyState,
  IamEventIcon,
  IamSeverityBadge,
  IamTableWrap,
  IamUserCell,
  formatTableDate,
} from "./IamShared";

const PAGE_SIZE = 15;

export function IamPermissionsViewer({ permissions, roleMatrix, selectedRoleId, showTechnical = false }) {
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState(() => new Set());

  const groups = useMemo(() => {
    const all = groupPermissionsByCategory(permissions || []);
    if (!selectedRoleId || !roleMatrix) return all;
    const rolePerms = new Set(
      (roleMatrix[selectedRoleId]?.permissions || []).map((p) => p.permissionId || p.id)
    );
    return all
      .map((g) => ({
        ...g,
        permissions: g.permissions.filter((p) => rolePerms.has(p.id)),
      }))
      .filter((g) => g.permissions.length > 0);
  }, [permissions, roleMatrix, selectedRoleId]);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        permissions: g.permissions.filter(
          (p) =>
            labelPermission(p.id).toLowerCase().includes(q) ||
            String(p.id).toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.permissions.length > 0);
  }, [groups, query]);

  const toggleGroup = (category) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <div className="iam-perm-viewer">
      <div className="iam-toolbar">
        <input
          type="search"
          className="iam-search"
          placeholder="بحث في الصلاحيات…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="بحث الصلاحيات"
        />
        <button
          type="button"
          className="iam-btn iam-btn--ghost"
          onClick={() => setOpenGroups(new Set(filtered.map((g) => g.category)))}
        >
          فتح الكل
        </button>
        <button type="button" className="iam-btn iam-btn--ghost" onClick={() => setOpenGroups(new Set())}>
          طي الكل
        </button>
      </div>
      {filtered.length === 0 ? (
        <IamEmptyState title="لا توجد صلاحيات" description="جرّب تعديل البحث أو اختر دورًا آخر." icon="🔐" />
      ) : (
        <div className="iam-perm-viewer__groups">
          {filtered.map((g) => {
            const isOpen = openGroups.has(g.category) || Boolean(query);
            return (
              <div key={g.category} className="iam-perm-viewer__group">
                <button
                  type="button"
                  className="iam-perm-viewer__group-head"
                  aria-expanded={isOpen}
                  onClick={() => toggleGroup(g.category)}
                >
                  <span>{g.label}</span>
                  <IamBadge tone="muted">{g.permissions.length}</IamBadge>
                </button>
                {isOpen ? (
                  <ul className="iam-perm-list">
                    {g.permissions.map((p) => (
                      <li key={p.id}>
                        <span className="iam-perm-list__label">✅ {labelPermission(p.id)}</span>
                        {showTechnical ? <code className="iam-tech-id">{p.id}</code> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function IamRoleCardPro({ role, permCount, userCount, selected, onSelect }) {
  const risk = IAM_ROLE_RISK[role.id] || "low";
  const icon = IAM_ROLE_ICONS[role.id] || "🛡";
  const desc = IAM_ROLE_DESCRIPTIONS[role.id] || role.description || "—";

  return (
    <button
      type="button"
      className={`iam-role-card-pro iam-role-card-pro--${risk} ${selected ? "is-selected" : ""}`}
      onClick={() => onSelect(role.id)}
      aria-pressed={selected}
    >
      <div className="iam-role-card-pro__head">
        <span className="iam-role-card-pro__icon" aria-hidden="true">
          {icon}
        </span>
        <div>
          <h3>{labelRole(role.id)}</h3>
        </div>
      </div>
      <p>{desc}</p>
      <div className="iam-role-card-pro__meta">
        <span>{userCount} مستخدم</span>
        <span>{permCount} صلاحية</span>
        <IamBadge tone={risk === "critical" ? "danger" : risk === "high" ? "warning" : "primary"}>
          {risk === "critical" ? "حرج" : risk === "high" ? "مرتفع" : risk === "medium" ? "متوسط" : "منخفض"}
        </IamBadge>
        {role.is_system ? <IamBadge tone="muted">نظامي</IamBadge> : null}
      </div>
    </button>
  );
}

export function IamAuditViewer({
  logs,
  loading,
  loadingMore = false,
  hasMore = false,
  error = "",
  onLoadMore,
  onFiltersApply,
  fetchDetail,
}) {
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [detailRow, setDetailRow] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const applyServerFilters = (next = {}) => {
    onFiltersApply?.({
      action: next.action ?? (actionFilter || undefined),
      dateFrom: next.dateFrom ?? (dateFrom || undefined),
      dateTo: next.dateTo ?? (dateTo || undefined),
    });
  };

  const actions = useMemo(
    () => [...new Set((logs || []).map((l) => l.action).filter(Boolean))],
    [logs]
  );

  const filtered = useMemo(() => {
    let rows = logs || [];
    rows = filterBySearch(rows, query, ["action", "actor_email", "target_type", "target_id", "reason"]);
    if (severityFilter) rows = rows.filter((r) => String(r.severity || "").toLowerCase() === severityFilter);
    return rows;
  }, [logs, query, severityFilter]);

  const handleToggleDetail = async (logId) => {
    if (expandedId === logId) {
      setExpandedId(null);
      setDetailRow(null);
      return;
    }
    setExpandedId(logId);
    if (!fetchDetail) {
      setDetailRow(filtered.find((l) => l.id === logId) || null);
      return;
    }
    setDetailLoading(true);
    try {
      const row = await fetchDetail(logId);
      setDetailRow(row);
    } catch {
      setDetailRow(null);
    } finally {
      setDetailLoading(false);
    }
  };

  if (loading) return null;

  return (
    <div className="iam-audit-viewer">
      {error ? <p className="iam-error">{error}</p> : null}
      <div className="iam-filter-bar">
        <input
          type="search"
          className="iam-search"
          placeholder="بحث في السجل…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="بحث سجل التدقيق"
        />
        <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); applyServerFilters({ action: e.target.value || undefined }); }} aria-label="فلتر الإجراء">
          <option value="">كل الإجراءات</option>
          {actions.map((a) => (
            <option key={a} value={a}>{labelAuditAction(a)}</option>
          ))}
        </select>
        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} aria-label="فلتر الخطورة">
          <option value="">كل المستويات</option>
          <option value="low">منخفض</option>
          <option value="medium">متوسط</option>
          <option value="high">مرتفع</option>
          <option value="critical">حرج</option>
        </select>
        <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); applyServerFilters({ dateFrom: e.target.value || undefined }); }} aria-label="من تاريخ" />
        <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); applyServerFilters({ dateTo: e.target.value || undefined }); }} aria-label="إلى تاريخ" />
        <button type="button" className="iam-btn iam-btn--ghost" onClick={() => exportToJson(filtered, "iam-audit.json")}>
          تصدير JSON
        </button>
        <button type="button" className="iam-btn iam-btn--ghost" onClick={() => exportToCsv(filtered, "iam-audit.csv", [
          { key: "action", label: "الإجراء", format: (v) => labelAuditAction(v) },
          { key: "actor_email", label: "المنفّذ" },
          { key: "target_type", label: "الهدف" },
          { key: "reason", label: "السبب" },
          { key: "created_at", label: "الوقت", format: formatDateTime },
        ])}>
          تصدير CSV
        </button>
      </div>

      {!filtered.length ? (
        <IamEmptyState title="لا توجد سجلات" description="لا توجد نتائج مطابقة للفلاتر." icon="📜" />
      ) : (
        <>
          <IamTableWrap>
            <table className="iam-table">
              <thead>
                <tr>
                  <th>الإجراء</th>
                  <th>المنفّذ</th>
                  <th>الهدف</th>
                  <th>السبب</th>
                  <th>الوقت</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => (
                  <tr key={log.id} className={expandedId === log.id ? "is-expanded" : ""}>
                    <td>{labelAuditAction(log.action)}</td>
                    <td>{log.actor_email || "—"}</td>
                    <td>{log.target_type ? `${log.target_type}` : "—"}</td>
                    <td>{log.reason || "—"}</td>
                    <td>{formatTableDate(log.created_at)}</td>
                    <td>
                      <button type="button" className="iam-btn iam-btn--ghost" onClick={() => handleToggleDetail(log.id)}>
                        {expandedId === log.id ? "إخفاء" : "تفاصيل"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </IamTableWrap>
          {expandedId ? (
            <details className="iam-tech-details iam-audit-detail" open>
              <summary>تفاصيل تقنية للسجل المحدد</summary>
              {detailLoading ? <p className="iam-muted">جاري التحميل…</p> : null}
              <pre>{JSON.stringify(detailRow || filtered.find((l) => l.id === expandedId) || {}, null, 2)}</pre>
            </details>
          ) : null}
          {hasMore ? (
            <div className="iam-load-more">
              <button type="button" className="iam-btn iam-btn--ghost" disabled={loadingMore} onClick={() => onLoadMore?.()}>
                {loadingMore ? "جاري التحميل…" : "تحميل المزيد"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export function IamSecurityTimeline({
  events,
  loading,
  loadingMore = false,
  hasMore = false,
  error = "",
  onLoadMore,
  onFiltersApply,
}) {
  const [query, setQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");

  const applyServerFilters = (next = {}) => {
    onFiltersApply?.({
      severity: next.severity ?? (severityFilter || undefined),
      eventType: next.eventType ?? (eventTypeFilter || undefined),
    });
  };

  const filtered = useMemo(() => {
    let rows = events || [];
    rows = filterBySearch(rows, query, ["event_type", "severity", "actor_email", "message"]);
    return rows;
  }, [events, query]);

  if (loading) return null;

  return (
    <div className="iam-security-timeline">
      {error ? <p className="iam-error">{error}</p> : null}
      <div className="iam-filter-bar">
        <input
          type="search"
          className="iam-search"
          placeholder="بحث في الأحداث…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="بحث الأحداث الأمنية"
        />
        <select value={severityFilter} onChange={(e) => { setSeverityFilter(e.target.value); applyServerFilters({ severity: e.target.value || undefined }); }} aria-label="فلتر الخطورة">
          <option value="">كل المستويات</option>
          <option value="low">منخفض</option>
          <option value="medium">متوسط</option>
          <option value="high">مرتفع</option>
          <option value="critical">حرج</option>
        </select>
        <input
          type="search"
          className="iam-search"
          placeholder="نوع الحدث…"
          value={eventTypeFilter}
          onChange={(e) => { setEventTypeFilter(e.target.value); applyServerFilters({ eventType: e.target.value || undefined }); }}
          aria-label="فلتر نوع الحدث"
        />
      </div>
      {!filtered.length ? (
        <IamEmptyState title="لا توجد أحداث" description="لم تُسجَّل أحداث أمنية مطابقة." icon="🔒" />
      ) : (
        <>
        <ol className="iam-timeline-pro">
          {filtered.map((e) => (
            <li key={e.id} className={`iam-timeline-pro__item iam-timeline-pro__item--${e.severity || "info"}`}>
              <div className="iam-timeline-pro__icon" aria-hidden="true">
                <IamEventIcon eventType={e.event_type} />
              </div>
              <div className="iam-timeline-pro__body">
                <div className="iam-timeline-pro__head">
                  <strong>{labelEventType(e.event_type)}</strong>
                  <IamSeverityBadge severity={e.severity} />
                  <span className="iam-muted">{formatRelativeTime(e.created_at)}</span>
                </div>
                <p className="iam-muted">
                  {e.message || e.actor_email || e.user_email || "النظام"}
                  {e.ip_address ? ` · ${maskIp(e.ip_address) || "—"}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
        {hasMore ? (
          <div className="iam-load-more">
            <button type="button" className="iam-btn iam-btn--ghost" disabled={loadingMore} onClick={() => onLoadMore?.()}>
              {loadingMore ? "جاري التحميل…" : "تحميل المزيد"}
            </button>
          </div>
        ) : null}
        </>
      )}
    </div>
  );
}

export function IamSessionsTable({
  sessions,
  loading,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
}) {
  if (loading) return null;

  const active = (sessions || []).filter((s) => !s.ended_at);

  if (!active.length) {
    return (
      <IamEmptyState title="لا توجد جلسات نشطة" description="ستظهر الجلسات الإدارية النشطة هنا." icon="🖥" />
    );
  }

  return (
    <>
    <IamTableWrap>
      <table className="iam-table iam-table--sessions">
        <thead>
          <tr>
            <th>المستخدم</th>
            <th>الجهاز / المتصفح</th>
            <th>المنصة</th>
            <th>IP</th>
            <th>بداية الجلسة</th>
            <th>آخر نشاط</th>
            <th>المدة</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>
          {active.map((s) => {
            const ua = parseUserAgent(s.user_agent);
            return (
              <tr key={s.id}>
                <td><IamUserCell record={s} /></td>
                <td>{ua.browser || "غير متوفر"}</td>
                <td>{ua.platform || "غير متوفر"}</td>
                <td>{maskIp(s.ip_address) || "غير متوفر"}</td>
                <td>{formatTableDate(s.started_at)}</td>
                <td>{formatTableDate(s.last_activity_at)}</td>
                <td>{sessionDuration(s.started_at, s.last_activity_at)}</td>
                <td><IamBadge tone="success">نشطة</IamBadge></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </IamTableWrap>
    {hasMore ? (
      <div className="iam-load-more">
        <button type="button" className="iam-btn iam-btn--ghost" disabled={loadingMore} onClick={() => onLoadMore?.()}>
          {loadingMore ? "جاري التحميل…" : "تحميل المزيد"}
        </button>
      </div>
    ) : null}
    </>
  );
}

export function IamPagination({ page, totalPages, total, onPageChange }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="iam-pagination" aria-label="ترقيم الصفحات">
      <button type="button" className="iam-btn iam-btn--ghost" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        السابق
      </button>
      <span className="iam-muted">
        صفحة {page} من {totalPages} ({total} سجل)
      </span>
      <button type="button" className="iam-btn iam-btn--ghost" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        التالي
      </button>
    </nav>
  );
}

export function IamQuickActions({ canGrant, onGrant, onNavigateTab }) {
  return (
    <div className="iam-quick-actions">
      <h3>إجراءات سريعة</h3>
      <div className="iam-quick-actions__grid">
        {canGrant ? (
          <button type="button" className="iam-btn iam-btn--primary" onClick={onGrant}>
            + إسناد دور
          </button>
        ) : null}
        <button type="button" className="iam-btn iam-btn--ghost" onClick={() => onNavigateTab("users")}>
          عرض المستخدمين
        </button>
        <button type="button" className="iam-btn iam-btn--ghost" onClick={() => onNavigateTab("audit")}>
          سجل التدقيق
        </button>
        <button type="button" className="iam-btn iam-btn--ghost" onClick={() => onNavigateTab("security")}>
          الأحداث الأمنية
        </button>
      </div>
    </div>
  );
}

export function IamRoleDistribution({ assignments, roles }) {
  const counts = useMemo(() => {
    const map = new Map();
    for (const a of assignments || []) {
      if (a.revoked_at) continue;
      map.set(a.role_id, (map.get(a.role_id) || 0) + 1);
    }
    return (roles || []).map((r) => ({
      roleId: r.id,
      count: map.get(r.id) || 0,
    }));
  }, [assignments, roles]);

  const max = Math.max(1, ...counts.map((c) => c.count));

  return (
    <section className="iam-panel">
      <h3>توزيع الأدوار</h3>
      <ul className="iam-distribution">
        {counts.map(({ roleId, count }) => (
          <li key={roleId}>
            <span className="iam-distribution__label">{labelRole(roleId)}</span>
            <div className="iam-distribution__bar" role="presentation">
              <span style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <strong>{count}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
