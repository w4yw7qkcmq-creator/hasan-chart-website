"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { useEffect } from "react";

export default function AdminPaymentProofModal({ proof, onClose }) {
  useEffect(() => {
    if (!proof) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, proof]);

  if (!proof || typeof document === "undefined") return null;

  const proofValue = String(proof.proof || "").trim();
  const isInline = proof.isInline && proofValue.startsWith("data:image");
  const canOpenFull = Boolean(proofValue) && !isInline;

  return createPortal(
    <div className="admin-financial-proof-modal" role="presentation">
      <button type="button" className="admin-financial-proof-modal__backdrop" onClick={onClose} aria-label="إغلاق" />
      <div className="admin-financial-proof-modal__panel" role="dialog" aria-modal="true" aria-labelledby="admin-proof-title">
        <button
          type="button"
          className="admin-financial-proof-modal__close"
          onClick={onClose}
          aria-label="إغلاق النافذة"
        >
          ×
        </button>

        <header className="admin-financial-proof-modal__head">
          <h3 id="admin-proof-title" className="admin-financial-proof-modal__title">
            إثبات الدفع
          </h3>
          <div className="admin-financial-proof-modal__meta-grid">
            <div className="admin-financial-proof-modal__meta-item">
              <span className="admin-financial-proof-modal__meta-label">المستخدم</span>
              <span className="admin-financial-proof-modal__meta-value">{proof.username || "—"}</span>
            </div>
            <div className="admin-financial-proof-modal__meta-item">
              <span className="admin-financial-proof-modal__meta-label">البريد</span>
              <span className="admin-financial-proof-modal__meta-value">{proof.userEmail || "—"}</span>
            </div>
            <div className="admin-financial-proof-modal__meta-item">
              <span className="admin-financial-proof-modal__meta-label">الخطة</span>
              <span className="admin-financial-proof-modal__meta-value">{proof.planName || proof.plan || "—"}</span>
            </div>
            <div className="admin-financial-proof-modal__meta-item">
              <span className="admin-financial-proof-modal__meta-label">المبلغ</span>
              <span className="admin-financial-proof-modal__meta-value">{proof.priceRaw || proof.amount || "—"}</span>
            </div>
            <div className="admin-financial-proof-modal__meta-item">
              <span className="admin-financial-proof-modal__meta-label">الحالة</span>
              <span className="admin-financial-proof-modal__meta-value">{proof.status || proof.reviewStatus || "—"}</span>
            </div>
          </div>
          <p className="admin-financial-proof-modal__notice">
            وجود إثبات دفع لا يعني أن العملية مؤكدة.
          </p>
        </header>

        <div className="admin-financial-proof-modal__body">
          {isInline ? (
            <div className="admin-financial-proof-modal__image-wrap">
              <Image
                src={proofValue}
                alt="إثبات الدفع"
                width={900}
                height={700}
                unoptimized
                className="max-h-[70vh] w-full rounded-2xl object-contain"
              />
            </div>
          ) : proofValue ? (
            <a
              href={proofValue}
              target="_blank"
              rel="noopener noreferrer"
              className="admin-financial-action-button admin-financial-action-button--primary"
            >
              فتح رابط إثبات الدفع
            </a>
          ) : (
            <p className="text-sm font-bold text-slate-300">لا يوجد إثبات متاح للعرض.</p>
          )}
        </div>

        <footer className="admin-financial-proof-modal__footer">
          <button type="button" className="admin-financial-action-button admin-financial-action-button--secondary" onClick={onClose}>
            إغلاق
          </button>
          {canOpenFull ? (
            <a
              href={proofValue}
              target="_blank"
              rel="noopener noreferrer"
              className="admin-financial-action-button admin-financial-action-button--primary"
            >
              فتح بحجم كامل
            </a>
          ) : null}
        </footer>
      </div>
    </div>,
    document.body
  );
}
