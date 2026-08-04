"use client";

import { useMemo, useState } from "react";
import { PermissionGate } from "../PermissionGate";
import { IAM_PERMISSIONS } from "../../../lib/iam/constants";
import {
  groupPermissionsByCategory,
  IAM_FLAG_LABELS,
  labelPermission,
  labelRole,
} from "../../../lib/iam/ui-labels";
import {
  buildAdminUsersFromAssignments,
  filterBySearch,
  formatDateTime,
  userDisplayName,
} from "../../../lib/iam/ui-utils";
import {
  formatTableDate,
  IamBadge,
  IamEmptyState,
  IamLoadingSkeleton,
  IamReasonText,
  IamRoleBadge,
  IamStatCard,
  IamStatusBadge,
  IamTableWrap,
  IamUserCell,
  labelAuditAction,
  labelEventType,
  labelSeverity,
} from "./IamShared";

export function IamOverviewTab({
  assignments,
  sessions,
  securityEvents,
  auditLogs,
  roles,
  featureFlags,
  isSuperAdmin,
  onNavigateTab,
  loading,
}) {
  if (loading) return <IamLoadingSkeleton rows={6} />;

  const activeAssignments = assignments.filter((a) => !a.revoked_at);
  const stats = [
    {
      title: "المستخدمون الإداريون",
      value: buildAdminUsersFromAssignments(activeAssignments).length,
      icon: "👤",
      tab: "users",
      perm: IAM_PERMISSIONS.IAM_READ,
    },
    {
      title: "الأدوار النشطة",
      value: roles.length,
      icon: "🛡",
      tab: "roles",
      perm: IAM_PERMISSIONS.IAM_READ,
    },
    {
      title: "التعيينات النشطة",
      value: activeAssignments.length,
      icon: "📋",
      tab: "assignments",
      perm: IAM_PERMISSIONS.IAM_READ,
    },
    {
      title: "الجلسات النشطة",
      value: sessions.filter((s) => !s.ended_at).length,
      icon: "🖥",
      tab: "sessions",
      perm: IAM_PERMISSIONS.IAM_SESSIONS_READ,
    },
    {
      title: "أحداث 24 ساعة",
      value: securityEvents.length,
      icon: "🔒",
      tab: "security",
      perm: IAM_PERMISSIONS.IAM_SECURITY_READ,
    },
    {
      title: "تعيينات ملغاة",
      value: assignments.filter((a) => a.revoked_at).length,
      icon: "⏸",
      tab: "assignments",
      perm: IAM_PERMISSIONS.IAM_READ,
    },
  ];

  const flags = featureFlags || {};

  return (
    <div className="iam-overview">
      <div className="iam-stats-grid">
        {stats.map((s) => (
          <PermissionGate key={s.title} permission={s.perm} fallback={null}>
            <IamStatCard
              title={s.title}
              value={s.value}
              icon={s.icon}
              href={s.tab}
              onNavigate={onNavigateTab}
            />
          </PermissionGate>
        ))}
      </div>

      <div className="iam-overview-grid">
        <section className="iam-panel">
          <h3>آخر التعيينات</h3>
          <ul className="iam-timeline">
            {activeAssignments.slice(0, 5).map((a) => (
              <li key={a.id}>
                <IamUserCell record={a} />
                <IamRoleBadge roleId={a.role_id} />
                <span className="iam-muted">{formatDateTime(a.granted_at)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="iam-panel">
          <h3>حالة نظام IAM</h3>
          <ul className="iam-flag-list">
            {Object.entries(IAM_FLAG_LABELS).map(([key, label]) => (
              <li key={key}>
                <span>{label}</span>
                <IamBadge tone={flags[key] ? "success" : "muted"}>{flags[key] ? "مفعلة" : "غير مفعلة"}</IamBadge>
              </li>
            ))}
          </ul>
          {isSuperAdmin ? (
            <details className="iam-tech-details">
              <summary>تفاصيل تقنية</summary>
              <pre>{JSON.stringify(flags, null, 2)}</pre>
            </details>
          ) : null}
        </section>

        <section className="iam-panel">
          <h3>آخر الأحداث الأمنية</h3>
          <ul className="iam-timeline">
            {securityEvents.slice(0, 5).map((e) => (
              <li key={e.id}>
                <IamBadge tone={e.severity === "critical" ? "danger" : "warning"}>
                  {labelSeverity(e.severity)}
                </IamBadge>
                <span>{labelEventType(e.event_type)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="iam-panel">
          <h3>آخر سجل التدقيق</h3>
          <ul className="iam-timeline">
            {auditLogs.slice(0, 5).map((log) => (
              <li key={log.id}>
                <span>{labelAuditAction(log.action)}</span>
                <span className="iam-muted">{log.actor_email || "—"}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

export function IamAdminUsersTab({
  assignments,
  loading,
  onSelectUser,
  onGrantClick,
  canGrant,
}) {
  const [query, setQuery] = useState("");
  const users = useMemo(() => buildAdminUsersFromAssignments(assignments), [assignments]);
  const filtered = useMemo(
    () => filterBySearch(users, query, ["user_email", "user_display_name"]),
    [users, query]
  );

  if (loading) return <IamLoadingSkeleton rows={8} />;

  return (
    <div className="iam-tab-panel">
      <div className="iam-toolbar">
        <input
          type="search"
          className="iam-search"
          placeholder="بحث بالاسم أو البريد…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="بحث المستخدمين"
        />
        {canGrant ? (
          <button type="button" className="iam-btn iam-btn--primary" onClick={onGrantClick}>
            + إسناد دور لمستخدم
          </button>
        ) : null}
      </div>

      {!filtered.length ? (
        <IamEmptyState title="لا يوجد مستخدمون إداريون" description="لم يتم العثور على تعيينات نشطة." />
      ) : (
        <IamTableWrap>
          <table className="iam-table">
            <thead>
              <tr>
                <th>المستخدم</th>
                <th>الدور الحالي</th>
                <th>الحالة</th>
                <th>آخر تعيين</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.user_id}>
                  <td>
                    <IamUserCell record={u} />
                  </td>
                  <td>
                    {u.roles.map((r) => (
                      <IamRoleBadge key={r} roleId={r} />
                    ))}
                  </td>
                  <td>
                    <IamStatusBadge assignment={u.assignments[0]} />
                  </td>
                  <td>{formatTableDate(u.last_granted_at)}</td>
                  <td>
                    <button type="button" className="iam-btn iam-btn--ghost" onClick={() => onSelectUser(u)}>
                      عرض التفاصيل
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </IamTableWrap>
      )}
    </div>
  );
}

export function IamRolesTab({ matrix, roles, permissions, loading }) {
  const [selected, setSelected] = useState(null);

  if (loading) return <IamLoadingSkeleton rows={6} />;

  const groups = groupPermissionsByCategory(permissions);

  return (
    <div className="iam-tab-panel iam-roles">
      <div className="iam-roles-grid">
        {(roles || []).map((role) => {
          const entry = matrix[role.id] || {};
          const count = entry.permissions?.length || 0;
          return (
            <button
              key={role.id}
              type="button"
              className={`iam-role-card ${selected === role.id ? "is-selected" : ""}`}
              onClick={() => setSelected(role.id)}
            >
              <h3>{labelRole(role.id)}</h3>
              <p>{role.description || "—"}</p>
              <div className="iam-role-card__meta">
                <span>{count} صلاحية</span>
                {role.is_system ? <IamBadge tone="muted">نظامي</IamBadge> : null}
              </div>
            </button>
          );
        })}
      </div>

      {selected ? (
        <section className="iam-panel">
          <h3>صلاحيات {labelRole(selected)}</h3>
          {groups.map((g) => {
            const rolePerms = new Set(
              (matrix[selected]?.permissions || []).map((p) => p.permissionId)
            );
            const inGroup = g.permissions.filter((p) => rolePerms.has(p.id));
            if (!inGroup.length) return null;
            return (
              <div key={g.category} className="iam-perm-group">
                <h4>{g.label}</h4>
                <ul>
                  {inGroup.map((p) => (
                    <li key={p.id}>✅ {labelPermission(p.id)}</li>
                  ))}
                </ul>
              </div>
            );
          })}
          <p className="iam-readonly-note">عرض للقراءة — التعديل عبر API الإداري فقط.</p>
        </section>
      ) : (
        <IamEmptyState title="اختر دورًا" description="اضغط على بطاقة دور لعرض صلاحياته." icon="🛡" />
      )}
    </div>
  );
}

export function IamAssignmentsTab({
  assignments,
  loading,
  onRevoke,
  onGrantClick,
  canGrant,
  canRevoke,
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () =>
      filterBySearch(assignments, query, [
        "user_email",
        "user_display_name",
        "role_id",
        "grant_reason",
      ]),
    [assignments, query]
  );

  if (loading) return <IamLoadingSkeleton rows={8} />;

  return (
    <div className="iam-tab-panel">
      <div className="iam-toolbar">
        <input
          type="search"
          className="iam-search"
          placeholder="بحث…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {canGrant ? (
          <button type="button" className="iam-btn iam-btn--primary" onClick={onGrantClick}>
            + إسناد دور
          </button>
        ) : null}
      </div>
      <IamTableWrap>
        <table className="iam-table">
          <thead>
            <tr>
              <th>المستخدم</th>
              <th>الدور</th>
              <th>الحالة</th>
              <th>تم التعيين بواسطة</th>
              <th>التاريخ</th>
              <th>السبب</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id}>
                <td>
                  <IamUserCell record={a} />
                </td>
                <td>
                  <IamRoleBadge roleId={a.role_id} />
                </td>
                <td>
                  <IamStatusBadge assignment={a} />
                </td>
                <td>{a.granted_by_email || "—"}</td>
                <td>{formatTableDate(a.granted_at)}</td>
                <td>
                  <IamReasonText reason={a.grant_reason} />
                </td>
                <td>
                  {canRevoke && !a.revoked_at ? (
                    <button type="button" className="iam-btn iam-btn--danger-text" onClick={() => onRevoke(a)}>
                      إلغاء التعيين
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </IamTableWrap>
    </div>
  );
}

export function IamOverridesTab({
  permissions,
  userOverrides,
  overrideLookup,
  setOverrideLookup,
  overrideForm,
  setOverrideForm,
  onResolveUser,
  onGrantOverride,
  onRevokeOverride,
  loading,
}) {
  if (loading) return <IamLoadingSkeleton rows={6} />;

  return (
    <div className="iam-tab-panel">
      <div className="iam-callout" role="note">
        تُستخدم الاستثناءات لمنح أو منع صلاحية محددة لمستخدم دون تغيير دوره الأساسي. المنع يتغلب على
        السماح.
      </div>

      <form onSubmit={onResolveUser} className="iam-toolbar iam-form-inline">
        <input
          type="email"
          placeholder="بريد المستخدم الإداري"
          value={overrideLookup.email}
          onChange={(e) => setOverrideLookup({ email: e.target.value, userId: "" })}
        />
        <button type="submit" className="iam-btn iam-btn--ghost">
          عرض الاستثناءات
        </button>
      </form>

      {userOverrides.length ? (
        <IamTableWrap>
          <table className="iam-table">
            <thead>
              <tr>
                <th>الصلاحية</th>
                <th>النوع</th>
                <th>السبب</th>
                <th>منذ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {userOverrides.map((row) => (
                <tr key={row.id}>
                  <td>{labelPermission(row.permission_id)}</td>
                  <td>
                    <IamBadge tone={row.effect === "deny" ? "danger" : "success"}>
                      {row.effect === "deny" ? "منع" : "سماح"}
                    </IamBadge>
                  </td>
                  <td>{row.reason || "—"}</td>
                  <td>{formatTableDate(row.granted_at)}</td>
                  <td>
                    <PermissionGate permission={IAM_PERMISSIONS.IAM_MANAGE}>
                      <button type="button" className="iam-btn iam-btn--danger-text" onClick={() => onRevokeOverride(row)}>
                        إلغاء
                      </button>
                    </PermissionGate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </IamTableWrap>
      ) : (
        <IamEmptyState title="لا توجد استثناءات" description="ابحث عن مستخدم لعرض استثناءاته." />
      )}

      <PermissionGate permission={IAM_PERMISSIONS.IAM_MANAGE}>
        <section className="iam-panel">
          <h3>إضافة استثناء</h3>
          <form onSubmit={onGrantOverride} className="iam-form-grid">
            <label className="iam-field">
              <span>البريد</span>
              <input
                type="email"
                required
                value={overrideForm.email}
                onChange={(e) => setOverrideForm((c) => ({ ...c, email: e.target.value }))}
              />
            </label>
            <label className="iam-field">
              <span>الصلاحية</span>
              <select
                value={overrideForm.permissionId}
                onChange={(e) => setOverrideForm((c) => ({ ...c, permissionId: e.target.value }))}
              >
                {permissions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {labelPermission(p.id)}
                  </option>
                ))}
              </select>
            </label>
            <label className="iam-field">
              <span>التأثير</span>
              <select
                value={overrideForm.effect}
                onChange={(e) => setOverrideForm((c) => ({ ...c, effect: e.target.value }))}
              >
                <option value="deny">منع</option>
                <option value="allow">سماح</option>
              </select>
            </label>
            <label className="iam-field">
              <span>السبب</span>
              <input
                type="text"
                required
                value={overrideForm.reason}
                onChange={(e) => setOverrideForm((c) => ({ ...c, reason: e.target.value }))}
              />
            </label>
            <button type="submit" className="iam-btn iam-btn--primary">
              حفظ الاستثناء
            </button>
          </form>
        </section>
      </PermissionGate>
    </div>
  );
}

export function IamSessionsTab({ sessions, loading }) {
  if (loading) return <IamLoadingSkeleton rows={6} />;

  const active = sessions.filter((s) => !s.ended_at);

  if (!active.length) {
    return (
      <IamEmptyState title="لا توجد جلسات نشطة" description="ستظهر الجلسات الإدارية النشطة هنا." icon="🖥" />
    );
  }

  return (
    <IamTableWrap>
      <table className="iam-table">
        <thead>
          <tr>
            <th>المستخدم</th>
            <th>بداية الجلسة</th>
            <th>آخر نشاط</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>
          {active.map((s) => (
            <tr key={s.id}>
              <td>
                <IamUserCell record={s} />
              </td>
              <td>{formatTableDate(s.started_at)}</td>
              <td>{formatTableDate(s.last_activity_at)}</td>
              <td>
                <IamBadge tone="success">نشطة</IamBadge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </IamTableWrap>
  );
}

export function IamSecurityTab({ events, loading }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => filterBySearch(events, query, ["event_type", "severity"]),
    [events, query]
  );

  if (loading) return <IamLoadingSkeleton rows={6} />;

  return (
    <div className="iam-tab-panel">
      <input
        type="search"
        className="iam-search"
        placeholder="بحث…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <IamTableWrap>
        <table className="iam-table">
          <thead>
            <tr>
              <th>الخطورة</th>
              <th>الحدث</th>
              <th>الوقت</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id}>
                <td>
                  <IamBadge tone={e.severity === "critical" ? "danger" : "warning"}>
                    {labelSeverity(e.severity)}
                  </IamBadge>
                </td>
                <td>{labelEventType(e.event_type)}</td>
                <td>{formatTableDate(e.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </IamTableWrap>
    </div>
  );
}

export function IamAuditTab({ logs, loading }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => filterBySearch(logs, query, ["action", "actor_email"]),
    [logs, query]
  );

  if (loading) return <IamLoadingSkeleton rows={6} />;

  return (
    <div className="iam-tab-panel">
      <input
        type="search"
        className="iam-search"
        placeholder="بحث…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <IamTableWrap>
        <table className="iam-table">
          <thead>
            <tr>
              <th>الإجراء</th>
              <th>من</th>
              <th>الوقت</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((log) => (
              <tr key={log.id}>
                <td>{labelAuditAction(log.action)}</td>
                <td>{log.actor_email || "—"}</td>
                <td>{formatTableDate(log.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </IamTableWrap>
    </div>
  );
}
