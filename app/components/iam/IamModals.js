"use client";

import { useEffect, useRef, useState } from "react";
import { labelRole, labelPermission, groupPermissionsByCategory, IAM_ROLE_DESCRIPTIONS, IAM_ROLE_RISK } from "../../../lib/iam/ui-labels";
import { IamRoleBadge } from "./IamShared";

const GRANT_REASON_SUGGESTIONS = [
  "توظيف موظف دعم",
  "إدارة الأخبار",
  "تغطية مؤقتة",
  "ترقية وظيفية",
];

export function IamGrantModal({ open, onClose, roles, onSubmit, submitting }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ email: "", roleId: "support", reason: "" });
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setForm({ email: "", roleId: roles[0]?.id || "support", reason: "" });
    }
  }, [open, roles]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const selectedRole = roles.find((r) => r.id === form.roleId);
  const risk = IAM_ROLE_RISK[form.roleId];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    onSubmit(form);
  };

  return (
    <div className="iam-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="iam-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="iam-grant-title"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="iam-modal__header">
          <h2 id="iam-grant-title">إسناد دور لمستخدم</h2>
          <button type="button" className="iam-modal__close" onClick={onClose} aria-label="إغلاق">
            ×
          </button>
        </header>

        <div className="iam-modal__steps" aria-label="خطوات الإسناد">
          {["المستخدم", "الدور", "المراجعة"].map((label, i) => (
            <span key={label} className={`iam-step ${step > i ? "is-done" : ""} ${step === i + 1 ? "is-active" : ""}`}>
              {i + 1}. {label}
            </span>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="iam-modal__body">
          {step === 1 && (
            <>
              <label className="iam-field">
                <span>البريد الإلكتروني للمستخدم</span>
                <input
                  type="email"
                  required
                  autoComplete="off"
                  placeholder="name@example.com"
                  value={form.email}
                  onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
                />
              </label>
              <p className="iam-field-hint">ابحث بالبريد — لا حاجة لمعرف المستخدم.</p>
            </>
          )}

          {step === 2 && (
            <>
              <label className="iam-field">
                <span>الدور</span>
                <select
                  value={form.roleId}
                  onChange={(e) => setForm((c) => ({ ...c, roleId: e.target.value }))}
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {labelRole(r.id)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="iam-role-preview">
                <IamRoleBadge roleId={form.roleId} />
                <p>{IAM_ROLE_DESCRIPTIONS[form.roleId] || selectedRole?.description || "—"}</p>
                {risk === "critical" || risk === "high" ? (
                  <p className="iam-warning">⚠ دور عالي الخطورة — تأكد من الحاجة قبل الإسناد.</p>
                ) : null}
              </div>
              <label className="iam-field">
                <span>سبب التعيين (مطلوب)</span>
                <input
                  type="text"
                  required
                  list="grant-reasons"
                  value={form.reason}
                  onChange={(e) => setForm((c) => ({ ...c, reason: e.target.value }))}
                />
                <datalist id="grant-reasons">
                  {GRANT_REASON_SUGGESTIONS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </label>
            </>
          )}

          {step === 3 && (
            <div className="iam-review">
              <dl>
                <div>
                  <dt>المستخدم</dt>
                  <dd>{form.email}</dd>
                </div>
                <div>
                  <dt>الدور</dt>
                  <dd>
                    <IamRoleBadge roleId={form.roleId} />
                  </dd>
                </div>
                <div>
                  <dt>النطاق</dt>
                  <dd>عام — المؤسسة الافتراضية</dd>
                </div>
                <div>
                  <dt>المدة</dt>
                  <dd>دائم</dd>
                </div>
                <div>
                  <dt>السبب</dt>
                  <dd>{form.reason}</dd>
                </div>
              </dl>
            </div>
          )}

          <footer className="iam-modal__footer">
            {step > 1 ? (
              <button type="button" className="iam-btn iam-btn--ghost" onClick={() => setStep(step - 1)}>
                رجوع
              </button>
            ) : (
              <button type="button" className="iam-btn iam-btn--ghost" onClick={onClose}>
                إلغاء
              </button>
            )}
            <button type="submit" className="iam-btn iam-btn--primary" disabled={submitting}>
              {step < 3 ? "التالي" : submitting ? "جاري الإسناد…" : "تأكيد إسناد الدور"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

export function IamRevokeModal({ open, assignment, onClose, onConfirm, submitting }) {
  const dialogRef = useRef(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !assignment) return null;

  return (
    <div className="iam-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="iam-modal iam-modal--danger"
        role="dialog"
        aria-modal="true"
        aria-labelledby="iam-revoke-title"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="iam-modal__header">
          <h2 id="iam-revoke-title">إلغاء صلاحيات المستخدم؟</h2>
          <button type="button" className="iam-modal__close" onClick={onClose} aria-label="إغلاق">
            ×
          </button>
        </header>
        <div className="iam-modal__body">
          <p className="iam-warning">
            سيفقد المستخدم صلاحيات الدور <strong>{labelRole(assignment.role_id)}</strong> فورًا.
          </p>
          <dl className="iam-review">
            <div>
              <dt>المستخدم</dt>
              <dd>{assignment.user_email || assignment.user_display_name || "—"}</dd>
            </div>
            <div>
              <dt>الدور</dt>
              <dd>{labelRole(assignment.role_id)}</dd>
            </div>
          </dl>
          <label className="iam-field">
            <span>سبب الإلغاء (مطلوب)</span>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: انتهاء مهمة مؤقتة"
            />
          </label>
        </div>
        <footer className="iam-modal__footer">
          <button type="button" className="iam-btn iam-btn--ghost" onClick={onClose}>
            تراجع
          </button>
          <button
            type="button"
            className="iam-btn iam-btn--danger"
            disabled={submitting || !reason.trim()}
            onClick={() => onConfirm({ ...assignment, reason: reason.trim() })}
          >
            {submitting ? "جاري الإلغاء…" : "إلغاء التعيين"}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function IamOverrideRevokeModal({ open, override, onClose, onConfirm, submitting }) {
  const dialogRef = useRef(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !override) return null;

  return (
    <div className="iam-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="iam-modal iam-modal--danger"
        role="dialog"
        aria-modal="true"
        aria-labelledby="iam-override-revoke-title"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="iam-modal__header">
          <h2 id="iam-override-revoke-title">إلغاء الاستثناء؟</h2>
          <button type="button" className="iam-modal__close" onClick={onClose} aria-label="إغلاق">
            ×
          </button>
        </header>
        <div className="iam-modal__body">
          <p>سيتم إزالة الاستثناء الفردي للصلاحية المحددة.</p>
          <label className="iam-field">
            <span>سبب الإلغاء (مطلوب)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: انتهى سبب الاستثناء"
              rows={3}
            />
          </label>
        </div>
        <footer className="iam-modal__footer">
          <button type="button" className="iam-btn iam-btn--ghost" onClick={onClose}>
            تراجع
          </button>
          <button
            type="button"
            className="iam-btn iam-btn--danger"
            disabled={submitting || !reason.trim()}
            onClick={() => onConfirm({ ...override, reason: reason.trim() })}
          >
            {submitting ? "جاري الإلغاء…" : "إلغاء الاستثناء"}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function IamUserDrawer({ user, assignments, permissions, onClose, showTechnical }) {
  const drawerRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    drawerRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!user) return null;

  return (
    <div className="iam-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="iam-drawer"
        role="dialog"
        aria-label="تفاصيل المستخدم"
        tabIndex={-1}
        ref={drawerRef}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="iam-drawer__header">
          <h2>{user.user_email || user.user_display_name || "مستخدم"}</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق">
            ×
          </button>
        </header>
        <div className="iam-drawer__body">
          <section>
            <h3>الأدوار</h3>
            <ul>
              {(user.roles || []).map((r) => (
                <li key={r}>
                  <IamRoleBadge roleId={r} />
                </li>
              ))}
            </ul>
          </section>
          {showTechnical ? (
            <section className="iam-tech-details">
              <h3>تفاصيل تقنية</h3>
              <code>{user.user_id}</code>
            </section>
          ) : null}
          {permissions?.length ? (
            <section>
              <h3>الصلاحيات الفعلية</h3>
              {groupPermissionsByCategory(
                permissions.map((id) => ({ id: typeof id === "string" ? id : id?.id }))
              ).map((group) => (
                <div key={group.category} className="iam-perm-group">
                  <h4>{group.label}</h4>
                  <ul className="iam-perm-list">
                    {group.permissions.map((p) => (
                      <li key={p.id}>
                        <span>{labelPermission(p.id)}</span>
                        {showTechnical ? <code className="iam-tech-id">{p.id}</code> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ) : null}
          <section>
            <h3>التعيينات</h3>
            <ul>
              {(assignments || []).map((a) => (
                <li key={a.id}>
                  {labelRole(a.role_id)} — {a.granted_at}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </aside>
    </div>
  );
}
