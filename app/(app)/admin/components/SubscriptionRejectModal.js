"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const SUBSCRIPTION_REJECTION_REASONS = [
  { value: "unclear_proof", label: "صورة الدفع غير واضحة" },
  { value: "invalid_proof", label: "إثبات الدفع غير صحيح" },
  { value: "amount_mismatch", label: "المبلغ غير مطابق" },
  { value: "account_missing", label: "الحساب غير موجود" },
  { value: "proof_reused", label: "تم استخدام الإثبات سابقاً" },
  { value: "incomplete_data", label: "بيانات غير مكتملة" },
  { value: "contact_support", label: "يرجى التواصل مع الدعم" },
  { value: "other", label: "سبب آخر" },
];

const OTHER_REASON_VALUE = "other";
const NOTES_MAX_LENGTH = 500;

export function buildSubscriptionRejectionMessage(reasonLabel, notes) {
  const parts = [];

  if (reasonLabel) {
    parts.push(`سبب الرفض: ${reasonLabel}`);
  }

  const trimmedNotes = String(notes || "").trim();
  if (trimmedNotes) {
    parts.push(`ملاحظات إضافية: ${trimmedNotes}`);
  }

  return parts.join("\n\n");
}

export default function SubscriptionRejectModal({
  request,
  loading = false,
  apiError = "",
  onCancel,
  onConfirm,
}) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const [reasonValue, setReasonValue] = useState("");
  const [notes, setNotes] = useState("");
  const [validationError, setValidationError] = useState("");

  const selectedReason = useMemo(
    () => SUBSCRIPTION_REJECTION_REASONS.find((item) => item.value === reasonValue) || null,
    [reasonValue]
  );

  const notesRequired = reasonValue === OTHER_REASON_VALUE;

  useEffect(() => {
    if (!request) return undefined;

    setReasonValue("");
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
    if (!reasonValue) {
      setValidationError("اختر سبب الرفض.");
      return;
    }

    const trimmedNotes = notes.trim();

    if (notesRequired && !trimmedNotes) {
      setValidationError("عند اختيار «سبب آخر» يجب كتابة الملاحظات.");
      return;
    }

    if (trimmedNotes.length > NOTES_MAX_LENGTH) {
      setValidationError(`الملاحظات يجب ألا تتجاوز ${NOTES_MAX_LENGTH} حرفاً.`);
      return;
    }

    setValidationError("");
    onConfirm?.({
      reasonValue,
      reasonLabel: selectedReason?.label || "",
      notes: trimmedNotes,
      message: buildSubscriptionRejectionMessage(selectedReason?.label || "", trimmedNotes),
    });
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
              ❌
            </span>
            <div className="min-w-0">
              <p className="admin-crm-action-modal__eyebrow">إجراء الاشتراك</p>
              <h3 id={titleId} className="admin-crm-action-modal__title">
                رفض طلب الاشتراك
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

          <label className="admin-crm-action-modal__field">
            <span className="admin-crm-action-modal__field-label">سبب الرفض</span>
            <select
              value={reasonValue}
              onChange={(event) => {
                setReasonValue(event.target.value);
                setValidationError("");
              }}
              className="admin-crm-action-modal__input admin-field"
              disabled={loading}
            >
              <option value="">اختر سبب الرفض...</option>
              {SUBSCRIPTION_REJECTION_REASONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-crm-action-modal__field">
            <span className="admin-crm-action-modal__field-label">
              ملاحظات إضافية{notesRequired ? " (إلزامي)" : ""}
            </span>
            <textarea
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value.slice(0, NOTES_MAX_LENGTH));
                setValidationError("");
              }}
              className="admin-crm-action-modal__textarea admin-field"
              rows={4}
              maxLength={NOTES_MAX_LENGTH}
              placeholder="اكتب أي تفاصيل إضافية للمستخدم..."
              disabled={loading}
            />
            <span className="admin-crm-action-modal__field-hint">
              {notes.length.toLocaleString("ar")} / {NOTES_MAX_LENGTH.toLocaleString("ar")}
            </span>
          </label>

          {validationError ? (
            <p className="admin-crm-action-modal__validation-error" role="alert">
              {validationError}
            </p>
          ) : null}

          {apiError ? (
            <p className="admin-crm-action-modal__validation-error" role="alert">
              {apiError}
            </p>
          ) : null}
        </div>

        <footer className="admin-crm-action-modal__footer">
          <button
            type="button"
            className="admin-crm-action-modal__btn admin-crm-action-modal__btn--cancel"
            onClick={onCancel}
            disabled={loading}
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={loading}
            className="admin-crm-action-modal__btn admin-crm-action-modal__btn--confirm admin-crm-action-modal__btn--danger"
            onClick={handleConfirm}
          >
            {loading ? "جاري الرفض..." : "تأكيد الرفض"}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
