"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { getSmartLinkSourceDisplayLabel } from "../../../../lib/partner-center/smart-link-sources.js";
import { SMART_LINK_SOURCE_OPTIONS } from "./smart-link-form-options";

const PartnerQrCode = dynamic(
  () => import("../PartnerQrCode").then((m) => m.PartnerQrCode),
  { ssr: false }
);

const CONVERSION_STEPS = [
  { key: "clicks", label: "النقرات" },
  { key: "signups", label: "التسجيلات" },
  { key: "qualified", label: "المؤهلون" },
  { key: "customers", label: "العملاء" },
];

function formatSmartLinkDisplay(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function sourceIcon(source) {
  return SMART_LINK_SOURCE_OPTIONS.find((s) => s.value === source)?.icon || "🔗";
}

function ConversionPath({ funnel }) {
  if (!funnel) return null;

  const values = CONVERSION_STEPS.map((step) => Number(funnel[step.key] ?? 0));

  return (
    <div className="partner-smart-link-path">
      <p className="partner-smart-link-path__title">مسار التحويل</p>
      <div className="partner-smart-link-path__track" role="list" aria-label="مسار التحويل">
        {CONVERSION_STEPS.map((step, index) => (
          <div key={step.key} className="partner-smart-link-path__step" role="listitem">
            <span className="partner-smart-link-path__label">{step.label}</span>
            <span className="partner-smart-link-path__value" dir="ltr">
              {values[index]}
            </span>
            {index < CONVERSION_STEPS.length - 1 ? (
              <span className="partner-smart-link-path__arrow" aria-hidden="true">
                ←
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ArchiveConfirmDialog({ open, onCancel, onConfirm, busy, returnFocusRef }) {
  const panelRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousFocus = document.activeElement;
    cancelRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (returnFocusRef?.current) {
        returnFocusRef.current.focus();
      } else if (previousFocus instanceof HTMLElement) {
        previousFocus.focus();
      }
    };
  }, [open, onCancel, returnFocusRef]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="partner-smart-link-dialog" role="presentation">
      <button type="button" className="partner-smart-link-dialog__backdrop" aria-label="إغلاق" onClick={onCancel} />
      <div
        ref={panelRef}
        className="partner-smart-link-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-link-title"
      >
        <h3 id="archive-link-title" className="partner-smart-link-dialog__title">
          حذف الرابط؟
        </h3>
        <p className="partner-smart-link-dialog__text">
          سيتوقف هذا الرابط عن استقبال زيارات جديدة، وستبقى إحصائياته السابقة محفوظة.
        </p>
        <div className="partner-smart-link-dialog__actions">
          <button ref={cancelRef} type="button" className="partner-btn-ghost" onClick={onCancel} disabled={busy}>
            إلغاء
          </button>
          <button type="button" className="partner-btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? "جارٍ الحذف..." : "حذف الرابط"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function PartnerSmartLinkCard({ link, onCopy, onArchived, onCopyFeedback }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const deleteButtonRef = useRef(null);

  const sourceLabel = getSmartLinkSourceDisplayLabel(link.source);

  const archiveLink = async () => {
    if (archiving) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/partner/growth/smart-links/${encodeURIComponent(link.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        onCopyFeedback?.(json?.error || "تعذر حذف الرابط", "warning");
        return;
      }
      onCopyFeedback?.("تم حذف الرابط");
      setConfirmOpen(false);
      onArchived?.(link.id);
    } catch {
      onCopyFeedback?.("تعذر حذف الرابط الآن. حاول مرة أخرى.", "warning");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <>
      <div className="partner-smart-link-card partner-surface partner-surface--p4">
        <div className="partner-smart-link-card__main">
          <div className="partner-smart-link-card__header">
            <span className="partner-smart-link-card__icon" aria-hidden="true">
              {sourceIcon(link.source)}
            </span>
            <p className="partner-title-md">{sourceLabel}</p>
          </div>
          {link.campaignCode ? (
            <p className="partner-muted--sm">الحملة: {link.campaignName || link.campaignCode}</p>
          ) : null}
          <p className="partner-smart-link-display" dir="ltr">
            {formatSmartLinkDisplay(link.url)}
          </p>
          <ConversionPath funnel={link.funnel} />
        </div>
        <div className="partner-smart-link-card__actions">
          <button type="button" className="partner-btn-primary partner-smart-link-card__copy" onClick={() => onCopy?.(link.url)}>
            نسخ الرابط
          </button>
          <button
            ref={deleteButtonRef}
            type="button"
            className="partner-btn-danger partner-smart-link-card__delete"
            onClick={() => setConfirmOpen(true)}
          >
            حذف الرابط
          </button>
          <PartnerQrCode url={link.url} size={72} />
        </div>
      </div>
      <ArchiveConfirmDialog
        open={confirmOpen}
        busy={archiving}
        returnFocusRef={deleteButtonRef}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void archiveLink()}
      />
    </>
  );
}

export default PartnerSmartLinkCard;
