"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  countUsersByRole,
  filterBySearch,
  formatDateTime,
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
import {
  IamAuditViewer,
  IamPermissionsViewer,
  IamQuickActions,
  IamRoleCardPro,
  IamRoleDistribution,
  IamSecurityTimeline,
  IamSessionsTable,
} from "./IamPolish";
import { useIamListFeed } from "./useIamListFeed";

export function IamOverviewTab({
  assignments,
  sessions,
  securityEvents,
  auditLogs,
  roles,
  permissions,
  featureFlags,
  isSuperAdmin,
  onNavigateTab,
  onGrantClick,
  canGrant,
  loading,
}) {
  if (loading) return <IamLoadingSkeleton rows={6} variant="cards" />;

  const activeAssignments = assignments.filter((a) => !a.revoked_at);
  const adminCount = buildAdminUsersFromAssignments(activeAssignments).length;
  const activeSessions = sessions.filter((s) => !s.ended_at).length;
  const permGroups = groupPermissionsByCategory(permissions || []);

  const stats = [
    { title: "المستخدمون الإداريون", value: adminCount, icon: "👤", tab: "users", perm: IAM_PERMISSIONS.IAM_READ },
    { title: "الأدوار النشطة", value: roles.length, icon: "🛡", tab: "roles", perm: IAM_PERMISSIONS.IAM_READ },
    { title: "التعيينات النشطة", value: activeAssignments.length, icon: "📋", tab: "assignments", perm: IAM_PERMISSIONS.IAM_READ },
    { title: "الجلسات النشطة", value: activeSessions, icon: "🖥", tab: "sessions", perm: IAM_PERMISSIONS.IAM_SESSIONS_READ },
    { title: "أحداث 24 ساعة", value: securityEvents.length, icon: "🔒", tab: "security", perm: IAM_PERMISSIONS.IAM_SECURITY_READ },
    { title: "تعيينات ملغاة", value: assignments.filter((a) => a.revoked_at).length, icon: "⏸", tab: "assignments", perm: IAM_PERMISSIONS.IAM_READ },
  ];

  const flags = featureFlags || {};
  const allFlagsOn = Object.keys(IAM_FLAG_LABELS).every((k) => flags[k]);

  return (
    <div className="iam-tab-panel iam-overview">
      <div className="iam-stats-grid">
        {stats.map((s) => (
          <PermissionGate key={s.title} permission={s.perm} fallback={null}>
            <IamStatCard title={s.title} value={s.value} icon={s.icon} href={s.tab} onNavigate={onNavigateTab} />
          </PermissionGate>
        ))}
      </div>

      <div className="iam-overview-grid iam-overview-grid--wide">
        <section className="iam-panel iam-panel--health">
          <h3>صحة النظام</h3>
          <div className="iam-health-row">
            <IamBadge tone={allFlagsOn ? "success" : "warning"}>{allFlagsOn ? "سليم" : "يتطلب مراجعة"}</IamBadge>
            <span className="iam-muted">جميع طبقات IAM</span>
          </div>
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
              <summary>تفاصيل تقنية (Runtime Flags)</summary>
              <pre>{JSON.stringify(flags, null, 2)}</pre>
            </details>
          ) : null}
        </section>

        <IamQuickActions canGrant={canGrant} onGrant={onGrantClick} onNavigateTab={onNavigateTab} />

        <section className="iam-panel">
          <h3>ملخص الصلاحيات</h3>
          <ul className="iam-summary-list">
            {permGroups.slice(0, 8).map((g) => (
              <li key={g.category}>
                <span>{g.label}</span>
                <strong>{g.permissions.length}</strong>
              </li>
            ))}
          </ul>
        </section>

        <IamRoleDistribution assignments={assignments} roles={roles} />

        <section className="iam-panel">
          <h3>آخر التعيينات</h3>
          {!activeAssignments.length ? (
            <p className="iam-muted">لا توجد تعيينات حديثة.</p>
          ) : (
            <ul className="iam-timeline">
              {activeAssignments.slice(0, 5).map((a) => (
                <li key={a.id}>
                  <IamUserCell record={a} />
                  <IamRoleBadge roleId={a.role_id} />
                  <span className="iam-muted">{formatDateTime(a.granted_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="iam-panel">
          <h3>آخر الأحداث الأمنية</h3>
          {!securityEvents.length ? (
            <p className="iam-muted">لا توجد أحداث حديثة.</p>
          ) : (
            <ul className="iam-timeline">
              {securityEvents.slice(0, 5).map((e) => (
                <li key={e.id}>
                  <IamBadge tone={e.severity === "critical" ? "danger" : "warning"}>{labelSeverity(e.severity)}</IamBadge>
                  <span>{labelEventType(e.event_type)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="iam-panel">
          <h3>ملخص التدقيق</h3>
          {!auditLogs.length ? (
            <p className="iam-muted">لا توجد سجلات حديثة.</p>
          ) : (
            <ul className="iam-timeline">
              {auditLogs.slice(0, 5).map((log) => (
                <li key={log.id}>
                  <span>{labelAuditAction(log.action)}</span>
                  <span className="iam-muted">{log.actor_email || "—"}</span>
                </li>
              ))}
            </ul>
          )}
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

  if (loading) return <IamLoadingSkeleton rows={8} variant="table" />;

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
                <th>البريد</th>
                <th>الدور الحالي</th>
                <th>الحالة</th>
                <th>آخر تعيين</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.user_id}>
                  <td><IamUserCell record={u} /></td>
                  <td>{u.user_email || "—"}</td>
                  <td>{u.roles.map((r) => <IamRoleBadge key={r} roleId={r} />)}</td>
                  <td><IamStatusBadge assignment={u.assignments[0]} /></td>
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

export function IamRolesTab({ matrix, roles, permissions, assignments, loading, showTechnical }) {
  const [selected, setSelected] = useState(null);
  const userCounts = useMemo(() => countUsersByRole(assignments || []), [assignments]);

  if (loading) return <IamLoadingSkeleton rows={6} variant="cards" />;

  return (
    <div className="iam-tab-panel iam-roles">
      <div className="iam-roles-grid">
        {(roles || []).map((role) => {
          const entry = matrix[role.id] || {};
          const permCount = entry.permissions?.length || 0;
          return (
            <IamRoleCardPro
              key={role.id}
              role={role}
              permCount={permCount}
              userCount={userCounts.get(role.id) || 0}
              selected={selected === role.id}
              onSelect={setSelected}
            />
          );
        })}
      </div>

      {selected ? (
        <section className="iam-panel">
          <h3>صلاحيات {labelRole(selected)}</h3>
          <IamPermissionsViewer
            permissions={permissions}
            roleMatrix={matrix}
            selectedRoleId={selected}
            showTechnical={showTechnical}
          />
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
    () => filterBySearch(assignments, query, ["user_email", "user_display_name", "role_id", "grant_reason"]),
    [assignments, query]
  );

  if (loading) return <IamLoadingSkeleton rows={8} variant="table" />;

  return (
    <div className="iam-tab-panel">
      <div className="iam-toolbar">
        <input type="search" className="iam-search" placeholder="بحث بالاسم أو البريد…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="بحث التعيينات" />
        {canGrant ? (
          <button type="button" className="iam-btn iam-btn--primary" onClick={onGrantClick}>+ إسناد دور</button>
        ) : null}
      </div>
      {!filtered.length ? (
        <IamEmptyState title="لا توجد تعيينات" description="لم يتم العثور على تعيينات مطابقة." />
      ) : (
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
                  <td><IamUserCell record={a} /></td>
                  <td><IamRoleBadge roleId={a.role_id} /></td>
                  <td><IamStatusBadge assignment={a} /></td>
                  <td>{a.granted_by_email || "—"}</td>
                  <td>{formatTableDate(a.granted_at)}</td>
                  <td><IamReasonText reason={a.grant_reason} /></td>
                  <td>
                    {canRevoke && !a.revoked_at ? (
                      <button type="button" className="iam-btn iam-btn--danger-text" onClick={() => onRevoke(a)}>إلغاء التعيين</button>
                    ) : null}
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
  if (loading) return <IamLoadingSkeleton rows={6} variant="table" />;

  return (
    <div className="iam-tab-panel">
      <div className="iam-callout" role="note">
        تُستخدم الاستثناءات لمنح أو منع صلاحية محددة لمستخدم دون تغيير دوره الأساسي. المنع يتغلب على السماح.
      </div>
      <form onSubmit={onResolveUser} className="iam-toolbar iam-form-inline">
        <input type="email" placeholder="بريد المستخدم الإداري" value={overrideLookup.email} onChange={(e) => setOverrideLookup({ email: e.target.value, userId: "" })} aria-label="بريد المستخدم" />
        <button type="submit" className="iam-btn iam-btn--ghost">عرض الاستثناءات</button>
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
                  <td><IamBadge tone={row.effect === "deny" ? "danger" : "success"}>{row.effect === "deny" ? "منع" : "سماح"}</IamBadge></td>
                  <td>{row.reason || "—"}</td>
                  <td>{formatTableDate(row.granted_at)}</td>
                  <td>
                    <PermissionGate permission={IAM_PERMISSIONS.IAM_MANAGE}>
                      <button type="button" className="iam-btn iam-btn--danger-text" onClick={() => onRevokeOverride(row)}>إلغاء</button>
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
            <label className="iam-field"><span>البريد</span><input type="email" required value={overrideForm.email} onChange={(e) => setOverrideForm((c) => ({ ...c, email: e.target.value }))} /></label>
            <label className="iam-field"><span>الصلاحية</span><select value={overrideForm.permissionId} onChange={(e) => setOverrideForm((c) => ({ ...c, permissionId: e.target.value }))}>{permissions.map((p) => <option key={p.id} value={p.id}>{labelPermission(p.id)}</option>)}</select></label>
            <label className="iam-field"><span>التأثير</span><select value={overrideForm.effect} onChange={(e) => setOverrideForm((c) => ({ ...c, effect: e.target.value }))}><option value="deny">منع</option><option value="allow">سماح</option></select></label>
            <label className="iam-field"><span>السبب</span><input type="text" required value={overrideForm.reason} onChange={(e) => setOverrideForm((c) => ({ ...c, reason: e.target.value }))} /></label>
            <button type="submit" className="iam-btn iam-btn--primary">حفظ الاستثناء</button>
          </form>
        </section>
      </PermissionGate>
    </div>
  );
}

export function IamSessionsTab() {
  const feed = useIamListFeed("/api/iam/sessions", { legacyKey: "sessions", defaultLimit: 50 });

  useEffect(() => {
    feed.load({ activeOnly: "true" });
  }, []);

  if (feed.loading && !feed.items.length) {
    return <IamLoadingSkeleton rows={6} variant="table" />;
  }

  return (
    <div className="iam-tab-panel">
      <IamSessionsTable
        sessions={feed.items}
        loading={false}
        loadingMore={feed.loadingMore}
        hasMore={feed.hasMore}
        onLoadMore={feed.loadMore}
      />
    </div>
  );
}

export function IamSecurityTab() {
  const feed = useIamListFeed("/api/iam/security-events", { legacyKey: "events", defaultLimit: 50 });
  const handleFiltersApply = useCallback(
    (filters) => {
      feed.load(filters);
    },
    [feed.load]
  );

  useEffect(() => {
    feed.load({});
  }, []);

  if (feed.loading && !feed.items.length) {
    return <IamLoadingSkeleton rows={6} variant="rows" />;
  }

  return (
    <div className="iam-tab-panel">
      <IamSecurityTimeline
        events={feed.items}
        loading={false}
        loadingMore={feed.loadingMore}
        hasMore={feed.hasMore}
        error={feed.error}
        onLoadMore={feed.loadMore}
        onFiltersApply={handleFiltersApply}
      />
    </div>
  );
}

export function IamAuditTab() {
  const feed = useIamListFeed("/api/iam/audit", { legacyKey: "logs", defaultLimit: 50 });
  const handleFiltersApply = useCallback(
    (filters) => {
      feed.load(filters);
    },
    [feed.load]
  );

  useEffect(() => {
    feed.load({});
  }, []);

  if (feed.loading && !feed.items.length) {
    return <IamLoadingSkeleton rows={8} variant="table" />;
  }

  return (
    <div className="iam-tab-panel">
      <IamAuditViewer
        logs={feed.items}
        loading={false}
        loadingMore={feed.loadingMore}
        hasMore={feed.hasMore}
        error={feed.error}
        onLoadMore={feed.loadMore}
        onFiltersApply={handleFiltersApply}
        fetchDetail={feed.fetchDetail}
      />
    </div>
  );
}
