"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const NOTES_MAX_LENGTH = 500;

export default function SubscriptionRemoveModal({
  request,
  loading = false,
  apiError = "",
  onCancel,
  onConfirm,
}) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const [notes, setNotes] = useState("");
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    if (!request) return undefined;

    setNotes("");
    setValidationError("");

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape" && !loading) {
        event.preventDefault();
        onCancel?.();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => dialogRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [request, onCancel, loading]);

  if (!request || typeof document === "undefined") return null;

  const handleConfirm = () => {
    const trimmedNotes = notes.trim();

    if (trimmedNotes.length > NOTES_MAX_LENGTH) {
      setValidationError(`الملاحظات يجب ألا تتجاوز ${NOTES_MAX_LENGTH} حرفاً.`);
      return;
    }

    setValidationError("");
    onConfirm?.({ notes: trimmedNotes });
  };

  return createPortal(
    <div className="admin-crm-action-modal" role="presentation">
      <button
        type="button"
        className="admin-crm-action-modal__backdrop"
        aria-label="إغلاق"
        disabled={loading}
        onClick={onCancel}
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="admin-crm-action-modal__dialog admin-crm-action-modal__dialog--danger"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="admin-crm-action-modal__header">
          <div className="admin-crm-action-modal__header-main">
            <span className="admin-crm-action-modal__icon" aria-hidden="true">
              🔴
            </span>
            <div className="min-w-0">
              <p className="admin-crm-action-modal__eyebrow">إجراء الاشتراك</p>
              <h3 id={titleId} className="admin-crm-action-modal__title">
                إزالة الاشتراك
              </h3>
            </div>
          </div>
          <button
            type="button"
            className="admin-crm-action-modal__close"
            onClick={onCancel}
            disabled={loading}
            aria-label="إغلاق"
          >
            ×
          </button>
        </header>

        <div className="admin-crm-action-modal__body">
          <article className="admin-crm-action-modal__user-card">
            <div className="admin-crm-action-modal__user-row">
              <span className="admin-crm-action-modal__user-label">الاسم</span>
              <strong className="admin-crm-action-modal__user-value">
                {request.username || request.userEmail || "—"}
              </strong>
            </div>
            <div className="admin-crm-action-modal__user-row">
              <span className="admin-crm-action-modal__user-label">البريد</span>
              <strong className="admin-crm-action-modal__user-value">{request.userEmail || "—"}</strong>
            </div>
            <div className="admin-crm-action-modal__user-row">
              <span className="admin-crm-action-modal__user-label">نوع الاشتراك</span>
              <strong className="admin-crm-action-modal__user-value">{request.planName || "—"}</strong>
            </div>
            <div className="admin-crm-action-modal__user-row">
              <span className="admin-crm-action-modal__user-label">السعر</span>
              <strong className="admin-crm-action-modal__user-value">{request.price || "—"}</strong>
            </div>
          </article>

          <div className="admin-subscription-remove-modal__notice">
            <p className="admin-subscription-remove-modal__notice-title">ماذا سيحدث؟</p>
            <ul className="admin-subscription-remove-modal__notice-list">
              <li>سيتوقف الاشتراك ولن يتمكن المستخدم من الوصول إلى الخدمة.</li>
              <li>لن يُحذف السجل أو Timeline أو Audit Log أو إثبات الدفع.</li>
              <li>سيتم إنشاء إشعار داخلي وإيميل «تم إنهاء اشتراكك».</li>
            </ul>
          </div>

          <label className="admin-crm-action-modal__field">
            <span className="admin-crm-action-modal__field-label">ملاحظات الإدارة (اختياري)</span>
            <textarea
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                setValidationError("");
              }}
              className="admin-crm-action-modal__input admin-field min-h-[96px]"
              placeholder="سبب الإزالة أو ملاحظات للمستخدم..."
              maxLength={NOTES_MAX_LENGTH}
              disabled={loading}
            />
          </label>

          {validationError ? (
            <p className="admin-crm-action-modal__error" role="alert">
              {validationError}
            </p>
          ) : null}

          {apiError ? (
            <p className="admin-crm-action-modal__error" role="alert">
              {apiError}
            </p>
          ) : null}
        </div>

        <footer className="admin-crm-action-modal__footer">
          <button
            type="button"
            className="admin-crm-action-modal__btn admin-crm-action-modal__btn--ghost"
            onClick={onCancel}
            disabled={loading}
          >
            إلغاء
          </button>
          <button
            type="button"
            className="admin-crm-action-modal__btn admin-crm-action-modal__btn--danger"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? "جاري الإزالة..." : "🔴 إزالة الاشتراك"}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
