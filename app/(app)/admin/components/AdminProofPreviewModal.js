"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function shouldUseNativeProofImage(imageUrl) {
  const src = String(imageUrl || "").trim();
  return src.startsWith("blob:") || src.startsWith("data:");
}

export default function AdminProofPreviewModal({
  open = false,
  imageUrl = null,
  loading = false,
  error = "",
  onRetry = null,
  onClose,
}) {
  const dialogRef = useRef(null);
  const [visible, setVisible] = useState(open);
  const [imageError, setImageError] = useState("");

  useEffect(() => {
    setImageError("");
  }, [imageUrl]);

  useEffect(() => {
    if (!open) {
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
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

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
        aria-busy={loading ? "true" : "false"}
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

          {loading ? (
            <div className="admin-proof-preview__state">
              <span className="admin-proof-preview__spinner" aria-hidden="true" />
              <p className="admin-proof-preview__state-title">جاري تحميل إثبات الدفع...</p>
            </div>
          ) : error ? (
            <div className="admin-proof-preview__state admin-proof-preview__state--error">
              <p className="admin-proof-preview__state-title">تعذر تحميل إثبات الدفع</p>
              <p className="admin-proof-preview__state-message">{error}</p>
              {typeof onRetry === "function" ? (
                <button
                  type="button"
                  className="admin-proof-preview__retry"
                  onClick={onRetry}
                >
                  إعادة المحاولة
                </button>
              ) : null}
            </div>
          ) : imageUrl && !imageError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="معاينة إثبات الدفع"
              className="admin-proof-preview__image"
              referrerPolicy={shouldUseNativeProofImage(imageUrl) ? undefined : "no-referrer"}
              onError={() => setImageError("تعذر عرض الصورة. قد يكون الرابط منتهيًا أو غير متاح.")}
            />
          ) : imageUrl && imageError ? (
            <div className="admin-proof-preview__state admin-proof-preview__state--error">
              <p className="admin-proof-preview__state-title">{imageError}</p>
              <div className="admin-proof-preview__fallback-actions">
                {typeof onRetry === "function" ? (
                  <button type="button" className="admin-proof-preview__retry" onClick={onRetry}>
                    إعادة المحاولة
                  </button>
                ) : null}
                <a
                  href={imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="admin-proof-preview__retry"
                >
                  فتح في تبويب جديد
                </a>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
