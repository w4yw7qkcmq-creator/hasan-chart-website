"use client";

import "../admin-theme.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminFetch } from "../../../../lib/admin-fetch";
import { PermissionGate } from "../../../components/PermissionGate";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants";

const TABS = [
  { id: "users", label: "Admin Users", permission: IAM_PERMISSIONS.IAM_READ },
  { id: "roles", label: "Roles", permission: IAM_PERMISSIONS.IAM_READ },
  { id: "assignments", label: "Assignments", permission: IAM_PERMISSIONS.IAM_READ },
  { id: "overrides", label: "الاستثناءات الفردية", permission: IAM_PERMISSIONS.IAM_READ },
  { id: "sessions", label: "Sessions", permission: IAM_PERMISSIONS.IAM_SESSIONS_READ },
  { id: "security", label: "Security Events", permission: IAM_PERMISSIONS.IAM_SECURITY_READ },
  { id: "audit", label: "Audit Logs", permission: IAM_PERMISSIONS.IAM_AUDIT_READ },
];

export default function AdminIamPage() {
  const [activeTab, setActiveTab] = useState("users");
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [securityEvents, setSecurityEvents] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [matrix, setMatrix] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [grantForm, setGrantForm] = useState({ email: "", roleId: "support", reason: "" });
  const [overrideForm, setOverrideForm] = useState({
    email: "",
    permissionId: "news.publish",
    effect: "deny",
    reason: "",
  });
  const [overrideLookup, setOverrideLookup] = useState({ email: "", userId: "" });
  const [userOverrides, setUserOverrides] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rolesRes, permsRes, assignRes] = await Promise.all([
        adminFetch("/api/iam/roles"),
        adminFetch("/api/iam/permissions"),
        adminFetch("/api/iam/assignments"),
      ]);

      const rolesJson = await rolesRes.json();
      const permsJson = await permsRes.json();
      const assignJson = await assignRes.json();

      if (rolesJson.success) {
        setRoles(rolesJson.roles || []);
        setMatrix(rolesJson.matrix || {});
      }
      if (permsJson.success) setPermissions(permsJson.permissions || []);
      if (assignJson.success) setAssignments(assignJson.assignments || []);

      if (activeTab === "sessions") {
        const res = await adminFetch("/api/iam/sessions?activeOnly=true");
        const json = await res.json();
        if (json.success) setSessions(json.sessions || []);
      }
      if (activeTab === "security") {
        const res = await adminFetch("/api/iam/security-events?limit=50");
        const json = await res.json();
        if (json.success) setSecurityEvents(json.events || []);
      }
      if (activeTab === "audit") {
        const res = await adminFetch("/api/iam/audit?limit=50");
        const json = await res.json();
        if (json.success) setAuditLogs(json.logs || []);
      }
      if (activeTab === "overrides" && overrideLookup.userId) {
        const res = await adminFetch(`/api/iam/overrides?userId=${encodeURIComponent(overrideLookup.userId)}`);
        const json = await res.json();
        if (json.success) setUserOverrides(json.overrides || []);
      }
    } catch (err) {
      setError(err?.message || "تعذر تحميل بيانات IAM");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGrant = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      const res = await adminFetch("/api/iam/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "grant",
          email: grantForm.email,
          roleId: grantForm.roleId,
          reason: grantForm.reason,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Grant failed");
      setMessage("تم منح الدور بنجاح");
      setGrantForm({ email: "", roleId: "support", reason: "" });
      loadData();
    } catch (err) {
      setError(err?.message || "تعذر منح الدور");
    }
  };

  const handleRevoke = async (assignment) => {
    if (!window.confirm(`Revoke ${assignment.role_id} from ${assignment.user_id}?`)) return;
    setMessage("");
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
          reason: "revoked_from_iam_ui",
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Revoke failed");
      setMessage("تم سحب الدور");
      loadData();
    } catch (err) {
      setError(err?.message || "تعذر سحب الدور");
    }
  };

  const resolveOverrideUser = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    const email = overrideLookup.email.trim();
    if (!email) return;
    const match = assignments.find((a) => a.user_email?.toLowerCase() === email.toLowerCase());
    const userId = match?.user_id || "";
    setOverrideLookup({ email, userId });
    if (!userId) {
      setError("لم يتم العثور على مستخدم إداري بهذا البريد ضمن التعيينات النشطة");
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
    setMessage("");
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
      if (!json.success) throw new Error(json.error || "تعذر إنشاء الاستثناء");
      setMessage("تم حفظ الاستثناء الفردي");
      setOverrideForm((prev) => ({ ...prev, reason: "" }));
      if (overrideLookup.userId) {
        const reload = await adminFetch(`/api/iam/overrides?userId=${encodeURIComponent(overrideLookup.userId)}`);
        const reloadJson = await reload.json();
        if (reloadJson.success) setUserOverrides(reloadJson.overrides || []);
      }
    } catch (err) {
      setError(err?.message || "تعذر إنشاء الاستثناء");
    }
  };

  const handleOverrideRevoke = async (override) => {
    const reason = window.prompt("سبب إلغاء الاستثناء (مطلوب):");
    if (!reason?.trim()) return;
    setMessage("");
    setError("");
    try {
      const res = await adminFetch("/api/iam/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "revoke",
          overrideId: override.id,
          reason: reason.trim(),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "تعذر إلغاء الاستثناء");
      setMessage("تم إلغاء الاستثناء");
      setUserOverrides((rows) => rows.filter((row) => row.id !== override.id));
    } catch (err) {
      setError(err?.message || "تعذر إلغاء الاستثناء");
    }
  };

  const roleOptions = useMemo(() => roles.map((r) => r.id), [roles]);

  return (
    <main className="admin-hub admin-iam-page">
      <header className="admin-hub__header">
        <div>
          <Link href="/admin" className="admin-hub__back">
            ← لوحة الإدارة
          </Link>
          <h1>IAM / RBAC</h1>
          <p>إدارة الأدوار والصلاحيات والتدقيق</p>
        </div>
      </header>

      <nav className="admin-hub-tabs__list admin-iam-tabs">
        {TABS.map((tab) => (
          <PermissionGate key={tab.id} permission={tab.permission} fallback={null}>
            <button
              type="button"
              className={`admin-hub-tabs__tab ${activeTab === tab.id ? "is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          </PermissionGate>
        ))}
      </nav>

      {message && <p className="admin-iam-message admin-iam-message--ok">{message}</p>}
      {error && <p className="admin-iam-message admin-iam-message--error">{error}</p>}
      {loading && <p className="admin-iam-message">جاري التحميل...</p>}

      {(activeTab === "users" || activeTab === "assignments") && (
        <PermissionGate permission={IAM_PERMISSIONS.IAM_ASSIGNMENTS_GRANT}>
          <section className="admin-hub-card admin-iam-grant">
            <h2>Grant Role</h2>
            <form onSubmit={handleGrant} className="admin-iam-form">
              <label>
                Email
                <input
                  type="email"
                  required
                  value={grantForm.email}
                  onChange={(e) => setGrantForm((c) => ({ ...c, email: e.target.value }))}
                />
              </label>
              <label>
                Role
                <select
                  value={grantForm.roleId}
                  onChange={(e) => setGrantForm((c) => ({ ...c, roleId: e.target.value }))}
                >
                  {roleOptions.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Reason
                <input
                  type="text"
                  required
                  value={grantForm.reason}
                  onChange={(e) => setGrantForm((c) => ({ ...c, reason: e.target.value }))}
                />
              </label>
              <button type="submit" className="admin-hub-card__cta">
                Grant
              </button>
            </form>
          </section>
        </PermissionGate>
      )}

      {(activeTab === "users" || activeTab === "assignments") && (
        <section className="admin-hub-card">
          <h2>Active Assignments</h2>
          <div className="admin-iam-table-wrap">
            <table className="admin-iam-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Granted</th>
                  <th>Reason</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id}>
                    <td>{a.user_id}</td>
                    <td>{a.role_id}</td>
                    <td>{a.granted_at}</td>
                    <td>{a.grant_reason || "—"}</td>
                    <td>
                      <PermissionGate permission={IAM_PERMISSIONS.IAM_ASSIGNMENTS_REVOKE}>
                        <button type="button" onClick={() => handleRevoke(a)}>
                          Revoke
                        </button>
                      </PermissionGate>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "roles" && (
        <section className="admin-hub-card">
          <h2>Permission Matrix</h2>
          {Object.entries(matrix).map(([roleId, entry]) => (
            <details key={roleId} className="admin-iam-matrix-block">
              <summary>
                {entry.role?.label || roleId} ({entry.permissions?.length || 0})
              </summary>
              <ul>
                {(entry.permissions || []).map((p) => (
                  <li key={`${roleId}-${p.permissionId}`}>
                    {p.permissionId} <em>({p.effect})</em>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </section>
      )}

      {activeTab === "sessions" && (
        <section className="admin-hub-card">
          <h2>Active Admin Sessions</h2>
          <ul className="admin-iam-list">
            {sessions.map((s) => (
              <li key={s.id}>
                {s.user_id} — {s.started_at} — {s.ip_address || "no ip"}
              </li>
            ))}
          </ul>
        </section>
      )}

      {activeTab === "security" && (
        <section className="admin-hub-card">
          <h2>Security Events</h2>
          <ul className="admin-iam-list">
            {securityEvents.map((e) => (
              <li key={e.id}>
                [{e.severity}] {e.event_type} — {e.created_at}
              </li>
            ))}
          </ul>
        </section>
      )}

      {activeTab === "audit" && (
        <section className="admin-hub-card">
          <h2>Audit Logs</h2>
          <ul className="admin-iam-list">
            {auditLogs.map((log) => (
              <li key={log.id}>
                {log.action} — {log.actor_email || log.actor_id} — {log.created_at}
              </li>
            ))}
          </ul>
        </section>
      )}

      {activeTab === "overrides" && (
        <PermissionGate permission={IAM_PERMISSIONS.IAM_READ}>
          <section className="admin-hub-card admin-iam-overrides">
            <h2>الاستثناءات الفردية للصلاحيات</h2>
            <p className="admin-iam-overrides__warn" role="note">
              المنع الفردي يتغلب على السماح القادم من الأدوار.
            </p>

            <form onSubmit={resolveOverrideUser} className="admin-iam-form">
              <label>
                البحث عن مستخدم إداري (بريد)
                <input
                  type="email"
                  value={overrideLookup.email}
                  onChange={(e) => setOverrideLookup({ email: e.target.value, userId: "" })}
                  autoComplete="off"
                />
              </label>
              <button type="submit" className="admin-hub-card__cta">
                عرض الاستثناءات
              </button>
            </form>

            {userOverrides.length > 0 ? (
              <div className="admin-iam-table-wrap">
                <table className="admin-iam-table">
                  <thead>
                    <tr>
                      <th>الصلاحية</th>
                      <th>التأثير</th>
                      <th>السبب</th>
                      <th>منذ</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {userOverrides.map((row) => (
                      <tr key={row.id}>
                        <td>{row.permission_id}</td>
                        <td>
                          <span className={`admin-iam-effect admin-iam-effect--${row.effect}`}>
                            {row.effect === "deny" ? "منع" : "سماح"}
                          </span>
                        </td>
                        <td>{row.reason || "—"}</td>
                        <td>{row.granted_at}</td>
                        <td>
                          <PermissionGate permission={IAM_PERMISSIONS.IAM_MANAGE}>
                            <button type="button" onClick={() => handleOverrideRevoke(row)}>
                              إلغاء
                            </button>
                          </PermissionGate>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <PermissionGate permission={IAM_PERMISSIONS.IAM_MANAGE}>
              <form onSubmit={handleOverrideGrant} className="admin-iam-form">
                <h3>إضافة استثناء</h3>
                <label>
                  البريد
                  <input
                    type="email"
                    required
                    value={overrideForm.email}
                    onChange={(e) => setOverrideForm((c) => ({ ...c, email: e.target.value }))}
                    autoComplete="off"
                  />
                </label>
                <label>
                  الصلاحية
                  <select
                    value={overrideForm.permissionId}
                    onChange={(e) => setOverrideForm((c) => ({ ...c, permissionId: e.target.value }))}
                  >
                    {permissions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  التأثير
                  <select
                    value={overrideForm.effect}
                    onChange={(e) => setOverrideForm((c) => ({ ...c, effect: e.target.value }))}
                  >
                    <option value="deny">deny — منع</option>
                    <option value="allow">allow — سماح</option>
                  </select>
                </label>
                <label>
                  السبب (مطلوب)
                  <input
                    type="text"
                    required
                    value={overrideForm.reason}
                    onChange={(e) => setOverrideForm((c) => ({ ...c, reason: e.target.value }))}
                    autoComplete="off"
                  />
                </label>
                <button type="submit" className="admin-hub-card__cta">
                  حفظ الاستثناء
                </button>
              </form>
            </PermissionGate>
          </section>
        </PermissionGate>
      )}

      {activeTab === "roles" && permissions.length > 0 && (
        <section className="admin-hub-card">
          <h2>All Permissions ({permissions.length})</h2>
          <ul className="admin-iam-list">
            {permissions.map((p) => (
              <li key={p.id}>
                {p.id} — {p.label} ({p.category})
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
