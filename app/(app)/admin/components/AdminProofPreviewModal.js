"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function AdminProofPreviewModal({ imageUrl, onClose }) {
  const dialogRef = useRef(null);
  const [visible, setVisible] = useState(Boolean(imageUrl));

  useEffect(() => {
    if (!imageUrl) {
      setVisible(false);
      return undefined;
    }

    setVisible(true);
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
  }, [imageUrl, onClose]);

  if (!imageUrl || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`admin-proof-preview ${visible ? "is-open" : "is-closing"}`}
      role="presentation"
      onClick={onClose}
    >
      <div className="admin-proof-preview__overlay" aria-hidden="true" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="admin-proof-preview__stage"
        role="dialog"
        aria-modal="true"
        aria-label="معاينة الصورة"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-proof-preview__frame">
          <button
            type="button"
            className="admin-proof-preview__close"
            onClick={onClose}
            aria-label="إغلاق معاينة الصورة"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <Image
            src={imageUrl}
            alt="معاينة إثبات الدفع"
            width={1400}
            height={1000}
            sizes="100vw"
            className="admin-proof-preview__image"
            priority
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
