"use client";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { formatSubscriptionRejectionDetailsForAdmin } from "../../../../lib/admin-subscription-rejection-details.js";
export default function SubscriptionRejectionDetailsModal({
  request,
  onClose,
}) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const details = formatSubscriptionRejectionDetailsForAdmin(
    request?.rejectionDetails,
  );
  useEffect(() => {
    if (!request) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [request, onClose]);
  if (!request || !details || typeof document === "undefined") return null;
  return createPortal(
    <div className="admin-crm-action-modal" role="presentation">
      {" "}
      <button
        type="button"
        className="admin-crm-action-modal__backdrop"
        aria-label="إغلاق"
        onClick={onClose}
      />{" "}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="admin-crm-action-modal__dialog admin-crm-action-modal__dialog--danger"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {" "}
        <header className="admin-crm-action-modal__header">
          {" "}
          <div className="admin-crm-action-modal__header-main">
            {" "}
            <span className="admin-crm-action-modal__icon" aria-hidden="true">
              {" "}
              📋{" "}
            </span>{" "}
            <div className="min-w-0">
              {" "}
              <p className="admin-crm-action-modal__eyebrow">طلب مرفوض</p>{" "}
              <h3 id={titleId} className="admin-crm-action-modal__title">
                {" "}
                تفاصيل الرفض{" "}
              </h3>{" "}
            </div>{" "}
          </div>{" "}
          <button
            type="button"
            className="admin-crm-action-modal__close"
            onClick={onClose}
            aria-label="إغلاق"
          >
            {" "}
            ×{" "}
          </button>{" "}
        </header>{" "}
        <div className="admin-crm-action-modal__body">
          {" "}
          <article className="admin-crm-action-modal__user-card">
            {" "}
            <div className="admin-crm-action-modal__user-row">
              {" "}
              <span className="admin-crm-action-modal__user-label">
                المستخدم
              </span>{" "}
              <strong className="admin-crm-action-modal__user-value">
                {" "}
                {request.username || request.userEmail || "—"}{" "}
              </strong>{" "}
            </div>{" "}
            <div className="admin-crm-action-modal__user-row">
              {" "}
              <span className="admin-crm-action-modal__user-label">
                الباقة
              </span>{" "}
              <strong className="admin-crm-action-modal__user-value">
                {" "}
                {request.planName || "—"}{" "}
              </strong>{" "}
            </div>{" "}
          </article>{" "}
          <article className="admin-subscription-rejection-details">
            {" "}
            <div className="admin-subscription-rejection-details__row">
              {" "}
              <span className="admin-subscription-rejection-details__label">
                سبب الرفض
              </span>{" "}
              <p className="admin-subscription-rejection-details__value">
                {" "}
                {details.rejectionReason}{" "}
              </p>{" "}
            </div>{" "}
            <div className="admin-subscription-rejection-details__row">
              {" "}
              <span className="admin-subscription-rejection-details__label">
                ملاحظات الإدارة
              </span>{" "}
              <p className="admin-subscription-rejection-details__value">
                {" "}
                {details.adminNotes}{" "}
              </p>{" "}
            </div>{" "}
            <div className="admin-subscription-rejection-details__row">
              {" "}
              <span className="admin-subscription-rejection-details__label">
                تاريخ الرفض
              </span>{" "}
              <p className="admin-subscription-rejection-details__value">
                {details.rejectedAt}
              </p>{" "}
            </div>{" "}
            <div className="admin-subscription-rejection-details__row">
              {" "}
              <span className="admin-subscription-rejection-details__label">
                نُفّذ بواسطة
              </span>{" "}
              <p className="admin-subscription-rejection-details__value">
                {" "}
                {details.rejectedByEmail}{" "}
              </p>{" "}
            </div>{" "}
            <div className="admin-subscription-rejection-details__row">
              {" "}
              <span className="admin-subscription-rejection-details__label">
                الإشعار الداخلي
              </span>{" "}
              <p className="admin-subscription-rejection-details__value">
                {" "}
                {details.notificationStatus}{" "}
              </p>{" "}
            </div>{" "}
            <div className="admin-subscription-rejection-details__row">
              {" "}
              <span className="admin-subscription-rejection-details__label">
                إيميل الرفض
              </span>{" "}
              <p className="admin-subscription-rejection-details__value">
                {details.emailStatus}
              </p>{" "}
            </div>{" "}
          </article>{" "}
        </div>{" "}
        <footer className="admin-crm-action-modal__footer">
          {" "}
          <button
            type="button"
            className="admin-crm-action-modal__btn admin-crm-action-modal__btn--confirm admin-crm-action-modal__btn--neutral"
            onClick={onClose}
          >
            {" "}
            إغلاق{" "}
          </button>{" "}
        </footer>{" "}
      </div>{" "}
    </div>,
    document.body,
  );
}
