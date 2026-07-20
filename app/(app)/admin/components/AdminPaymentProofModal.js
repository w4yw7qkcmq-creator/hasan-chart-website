"use client";

import Image from "next/image";
import { createPortal } from "react-dom";

export default function AdminPaymentProofModal({ proof, onClose }) {
  if (!proof || typeof document === "undefined") return null;

  const proofValue = String(proof.proof || "").trim();
  const isInline = proof.isInline && proofValue.startsWith("data:image");

  return createPortal(
    <div className="admin-financial-proof-modal" role="presentation">
      <button type="button" className="admin-financial-proof-modal__backdrop" onClick={onClose} aria-label="إغلاق" />
      <div className="admin-financial-proof-modal__panel" role="dialog" aria-modal="true">
        <div className="admin-financial-proof-modal__head">
          <div>
            <p className="admin-user-hero__eyebrow">معاينة إثبات الدفع</p>
            <h3 className="admin-heading text-xl">{proof.planName || proof.plan || "طلب اشتراك"}</h3>
            <p className="text-sm font-bold text-amber-700/90">
              وجود إثبات دفع لا يعني أن العملية مؤكدة.
            </p>
          </div>
          <button type="button" className="admin-btn-surface px-4 py-2" onClick={onClose}>
            إغلاق
          </button>
        </div>
        <div className="admin-financial-proof-modal__body">
          {isInline ? (
            <Image
              src={proofValue}
              alt="إثبات الدفع"
              width={900}
              height={700}
              unoptimized
              className="max-h-[70vh] w-full rounded-2xl object-contain"
            />
          ) : proofValue ? (
            <a href={proofValue} target="_blank" rel="noopener noreferrer" className="admin-user-manage-btn">
              فتح رابط إثبات الدفع
            </a>
          ) : (
            <p className="text-sm font-bold text-slate-500">لا يوجد إثبات متاح للعرض.</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
