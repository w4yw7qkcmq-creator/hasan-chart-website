"use client";

import "../admin-theme.css";
import "./iam-ui.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminFetch } from "../../../../lib/admin-fetch";
import { PermissionGate } from "../../../components/PermissionGate";
import { useAuth } from "../../../components/AuthProvider";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants";
import { IAM_TAB_DEFS } from "../../../../lib/iam/ui-labels";
import { IamToast } from "../../../components/iam/IamShared";
import { IamGrantModal, IamRevokeModal, IamOverrideRevokeModal, IamUserDrawer } from "../../../components/iam/IamModals";
import {
  IamOverviewTab,
  IamAdminUsersTab,
  IamRolesTab,
  IamAssignmentsTab,
  IamOverridesTab,
  IamSessionsTab,
  IamSecurityTab,
  IamAuditTab,
} from "../../../components/iam/IamTabs";

export default function AdminIamPage() {
  const { can, iam } = useAuth();
  const featureFlags = iam?.featureFlags;
  const isSuperAdmin = Boolean(iam?.isSuperAdmin);
  const [activeTab, setActiveTab] = useState("overview");
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [allAssignments, setAllAssignments] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [securityEvents, setSecurityEvents] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [matrix, setMatrix] = useState({});
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [toast, setToast] = useState({ message: "", type: "ok" });
  const [error, setError] = useState("");
  const [grantOpen, setGrantOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [overrideForm, setOverrideForm] = useState({
    email: "",
    permissionId: "news.publish",
    effect: "deny",
    reason: "",
  });
  const [overrideLookup, setOverrideLookup] = useState({ email: "", userId: "" });
  const [overrideRevokeTarget, setOverrideRevokeTarget] = useState(null);

  const visibleTabs = useMemo(
    () => IAM_TAB_DEFS.filter((t) => can(t.permission)),
    [can]
  );

  const loadCore = useCallback(async () => {
    const [rolesRes, permsRes, assignRes, assignAllRes] = await Promise.all([
      adminFetch("/api/iam/roles"),
      adminFetch("/api/iam/permissions"),
      adminFetch("/api/iam/assignments?activeOnly=true"),
      adminFetch("/api/iam/assignments?activeOnly=false"),
    ]);
    const rolesJson = await rolesRes.json();
    const permsJson = await permsRes.json();
    const assignJson = await assignRes.json();
    const assignAllJson = await assignAllRes.json();

    if (rolesJson.success) {
      setRoles(rolesJson.roles || []);
      setMatrix(rolesJson.matrix || {});
    }
    if (permsJson.success) setPermissions(permsJson.permissions || []);
    if (assignJson.success) setAssignments(assignJson.assignments || []);
    if (assignAllJson.success) setAllAssignments(assignAllJson.assignments || []);
  }, []);

  const loadTabData = useCallback(async (tab) => {
    if (tab === "sessions" && can(IAM_PERMISSIONS.IAM_SESSIONS_READ)) {
      const res = await adminFetch("/api/iam/sessions?activeOnly=true&limit=100");
      const json = await res.json();
      if (json.success) setSessions(json.sessions || []);
    }
    if (tab === "security" && can(IAM_PERMISSIONS.IAM_SECURITY_READ)) {
      const res = await adminFetch("/api/iam/security-events?limit=50");
      const json = await res.json();
      if (json.success) setSecurityEvents(json.events || []);
    }
    if (tab === "audit" && can(IAM_PERMISSIONS.IAM_AUDIT_READ)) {
      const res = await adminFetch("/api/iam/audit?limit=50");
      const json = await res.json();
      if (json.success) setAuditLogs(json.logs || []);
    }
    if (tab === "overview") {
      await Promise.all([
        can(IAM_PERMISSIONS.IAM_SESSIONS_READ)
          ? adminFetch("/api/iam/sessions?activeOnly=true&limit=20").then((r) => r.json())
          : Promise.resolve({ success: true, sessions: [] }),
        can(IAM_PERMISSIONS.IAM_SECURITY_READ)
          ? adminFetch("/api/iam/security-events?limit=10").then((r) => r.json())
          : Promise.resolve({ success: true, events: [] }),
        can(IAM_PERMISSIONS.IAM_AUDIT_READ)
          ? adminFetch("/api/iam/audit?limit=10").then((r) => r.json())
          : Promise.resolve({ success: true, logs: [] }),
      ]).then(([sJson, eJson, aJson]) => {
        if (sJson.success) setSessions(sJson.sessions || []);
        if (eJson.success) setSecurityEvents(eJson.events || []);
        if (aJson.success) setAuditLogs(aJson.logs || []);
      });
    }
  }, [can]);

  const refresh = useCallback(async () => {
    setTabLoading(true);
    setError("");
    try {
      await loadCore();
      await loadTabData(activeTab);
    } catch (err) {
      setError(err?.message || "تعذر تحميل بيانات الصلاحيات");
    } finally {
      setLoading(false);
      setTabLoading(false);
    }
  }, [activeTab, loadCore, loadTabData]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!visibleTabs.find((t) => t.id === activeTab) && visibleTabs.length) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  const handleGrant = async (form) => {
    setSubmitting(true);
    setError("");
    try {
      const res = await adminFetch("/api/iam/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "grant",
          email: form.email,
          roleId: form.roleId,
          reason: form.reason,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "تعذر إسناد الدور");
      setToast({ message: "تم إسناد الدور بنجاح", type: "ok" });
      setGrantOpen(false);
      await refresh();
    } catch (err) {
      setError(err?.message || "تعذر إسناد الدور");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (assignment) => {
    setSubmitting(true);
    setError("");
    try {
      const res = await adminFetch("/api/iam/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "revoke",
          assignmentId: assignment.id,
          userId: assignment.user_id,
          roleId: assignment.role_id,
          reason: assignment.reason || "revoked_from_iam_ui",
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "تعذر إلغاء التعيين");
      setToast({ message: "تم إلغاء التعيين", type: "ok" });
      setRevokeTarget(null);
      await refresh();
    } catch (err) {
      setError(err?.message || "تعذر إلغاء التعيين");
    } finally {
      setSubmitting(false);
    }
  };

  const resolveOverrideUser = async (event) => {
    event.preventDefault();
    setError("");
    const email = overrideLookup.email.trim();
    if (!email) return;
    const match = assignments.find((a) => a.user_email?.toLowerCase() === email.toLowerCase());
    const userId = match?.user_id || "";
    setOverrideLookup({ email, userId });
    if (!userId) {
      setError("لم يتم العثور على مستخدم إداري نشط بهذا البريد");
      setUserOverrides([]);
      return;
    }
    const res = await adminFetch(`/api/iam/overrides?userId=${encodeURIComponent(userId)}`);
    const json = await res.json();
    if (!json.success) {
      setError(json.error || "تعذر تحميل الاستثناءات");
      return;
    }
    setUserOverrides(json.overrides || []);
  };

  const handleOverrideGrant = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const res = await adminFetch("/api/iam/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "grant",
          email: overrideForm.email || overrideLookup.email,
          permissionId: overrideForm.permissionId,
          effect: overrideForm.effect,
          reason: overrideForm.reason,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "تعذر حفظ الاستثناء");
      setToast({ message: "تم حفظ الاستثناء", type: "ok" });
      if (overrideLookup.userId) {
        const reload = await adminFetch(`/api/iam/overrides?userId=${encodeURIComponent(overrideLookup.userId)}`);
        const reloadJson = await reload.json();
        if (reloadJson.success) setUserOverrides(reloadJson.overrides || []);
      }
    } catch (err) {
      setError(err?.message || "تعذر حفظ الاستثناء");
    }
  };

  const handleOverrideRevoke = async (override) => {
    if (!override?.reason) {
      setOverrideRevokeTarget(override);
      return;
    }
    setSubmitting(true);
    try {
      const res = await adminFetch("/api/iam/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", overrideId: override.id, reason: override.reason.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "تعذر إلغاء الاستثناء");
      setToast({ message: "تم إلغاء الاستثناء", type: "ok" });
      setUserOverrides((rows) => rows.filter((row) => row.id !== override.id));
      setOverrideRevokeTarget(null);
    } catch (err) {
      setError(err?.message || "تعذر إلغاء الاستثناء");
    } finally {
      setSubmitting(false);
    }
  };

  const canGrant = can(IAM_PERMISSIONS.IAM_ASSIGNMENTS_GRANT);
  const canRevoke = can(IAM_PERMISSIONS.IAM_ASSIGNMENTS_REVOKE);
  const flags = featureFlags || {};

  return (
    <main className="admin-hub admin-iam-page iam-redesign">
      <header className="iam-page-header">
        <Link href="/admin" className="iam-breadcrumb">
          لوحة الإدارة ← إدارة الصلاحيات والأدوار
        </Link>
        <h1>إدارة الصلاحيات والأدوار</h1>
        <p>إدارة وصول الموظفين، الأدوار، الصلاحيات، الجلسات، والسجل الأمني من مكان واحد.</p>
      </header>

      <nav className="iam-tabs" aria-label="تبويبات إدارة الصلاحيات">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`iam-tabs__btn ${activeTab === tab.id ? "is-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      <IamToast message={toast.message} type={toast.type} onClose={() => setToast({ message: "", type: "ok" })} />
      {error ? (
        <div className="iam-toast iam-toast--error" role="alert">
          {error}
          <button type="button" className="iam-btn iam-btn--ghost" onClick={() => refresh()}>
            إعادة المحاولة
          </button>
        </div>
      ) : null}

      {activeTab === "overview" ? (
        <IamOverviewTab
          assignments={allAssignments}
          sessions={sessions}
          securityEvents={securityEvents}
          auditLogs={auditLogs}
          roles={roles}
          featureFlags={flags}
          isSuperAdmin={isSuperAdmin}
          onNavigateTab={setActiveTab}
          loading={loading || tabLoading}
        />
      ) : null}

      {activeTab === "users" ? (
        <IamAdminUsersTab
          assignments={assignments}
          loading={loading || tabLoading}
          onSelectUser={setSelectedUser}
          onGrantClick={() => setGrantOpen(true)}
          canGrant={canGrant}
        />
      ) : null}

      {activeTab === "roles" ? (
        <IamRolesTab matrix={matrix} roles={roles} permissions={permissions} loading={loading || tabLoading} />
      ) : null}

      {activeTab === "assignments" ? (
        <IamAssignmentsTab
          assignments={assignments}
          loading={loading || tabLoading}
          onRevoke={setRevokeTarget}
          onGrantClick={() => setGrantOpen(true)}
          canGrant={canGrant}
          canRevoke={canRevoke}
        />
      ) : null}

      {activeTab === "overrides" ? (
        <IamOverridesTab
          permissions={permissions}
          userOverrides={userOverrides}
          overrideLookup={overrideLookup}
          setOverrideLookup={setOverrideLookup}
          overrideForm={overrideForm}
          setOverrideForm={setOverrideForm}
          onResolveUser={resolveOverrideUser}
          onGrantOverride={handleOverrideGrant}
          onRevokeOverride={handleOverrideRevoke}
          loading={loading || tabLoading}
        />
      ) : null}

      {activeTab === "sessions" ? (
        <IamSessionsTab sessions={sessions} loading={loading || tabLoading} />
      ) : null}

      {activeTab === "security" ? (
        <IamSecurityTab events={securityEvents} loading={loading || tabLoading} />
      ) : null}

      {activeTab === "audit" ? (
        <IamAuditTab logs={auditLogs} loading={loading || tabLoading} />
      ) : null}

      <PermissionGate permission={IAM_PERMISSIONS.IAM_ASSIGNMENTS_GRANT}>
        <IamGrantModal
          open={grantOpen}
          onClose={() => setGrantOpen(false)}
          roles={roles}
          onSubmit={handleGrant}
          submitting={submitting}
        />
      </PermissionGate>

      <PermissionGate permission={IAM_PERMISSIONS.IAM_ASSIGNMENTS_REVOKE}>
        <IamRevokeModal
          open={Boolean(revokeTarget)}
          assignment={revokeTarget}
          onClose={() => setRevokeTarget(null)}
          onConfirm={handleRevoke}
          submitting={submitting}
        />
      </PermissionGate>

      <IamOverrideRevokeModal
        open={Boolean(overrideRevokeTarget)}
        override={overrideRevokeTarget}
        onClose={() => setOverrideRevokeTarget(null)}
        onConfirm={handleOverrideRevoke}
        submitting={submitting}
      />

      <IamUserDrawer
        user={selectedUser}
        assignments={selectedUser?.assignments || []}
        onClose={() => setSelectedUser(null)}
        showTechnical={isSuperAdmin}
      />
    </main>
  );
}
