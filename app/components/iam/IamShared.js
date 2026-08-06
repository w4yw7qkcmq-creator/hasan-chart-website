"use client";

import { labelRole, labelPermission, labelAssignmentReason, labelAssignmentStatus, labelSeverity, labelEventType, labelAuditAction, IAM_ROLE_RISK, IAM_EVENT_ICONS } from "../../../lib/iam/ui-labels";
import { formatDateTime, userDisplayName, userInitials } from "../../../lib/iam/ui-utils";

export function IamToast({ message, type = "ok", onClose }) {
  if (!message) return null;
  return (
    <div className={`iam-toast iam-toast--${type}`} role="status">
      <span>{message}</span>
      {onClose ? (
        <button type="button" className="iam-toast__close" onClick={onClose} aria-label="إغلاق">
          ×
        </button>
      ) : null}
    </div>
  );
}

export function IamEmptyState({ icon = "📭", title, description, action = null }) {
  return (
    <div className="iam-empty">
      <div className="iam-empty__icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function IamLoadingSkeleton({ rows = 4, variant = "rows" }) {
  if (variant === "cards") {
    return (
      <div className="iam-skeleton iam-skeleton--cards" aria-busy="true" aria-label="جاري التحميل">
        {Array.from({ length: Math.min(rows, 6) }).map((_, i) => (
          <div key={i} className="iam-skeleton__card" />
        ))}
      </div>
    );
  }
  if (variant === "table") {
    return (
      <div className="iam-skeleton iam-skeleton--table" aria-busy="true" aria-label="جاري التحميل">
        <div className="iam-skeleton__row iam-skeleton__row--head" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="iam-skeleton__row" />
        ))}
      </div>
    );
  }
  return (
    <div className="iam-skeleton" aria-busy="true" aria-label="جاري التحميل">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="iam-skeleton__row" />
      ))}
    </div>
  );
}

export function IamBadge({ tone = "neutral", children }) {
  return <span className={`iam-badge iam-badge--${tone}`}>{children}</span>;
}

export function IamStatCard({ title, value, hint, icon, href, onNavigate }) {
  const inner = (
    <>
      <div className="iam-stat__icon" aria-hidden="true">
        {icon}
      </div>
      <div className="iam-stat__body">
        <span className="iam-stat__title">{title}</span>
        <strong className="iam-stat__value">{value}</strong>
        {hint ? <span className="iam-stat__hint">{hint}</span> : null}
      </div>
    </>
  );
  if (href && onNavigate) {
    return (
      <button type="button" className="iam-stat iam-stat--link" onClick={() => onNavigate(href)}>
        {inner}
      </button>
    );
  }
  return <div className="iam-stat">{inner}</div>;
}

export function IamAvatar({ record, size = "md" }) {
  const initials = userInitials(record);
  return (
    <span className={`iam-avatar iam-avatar--${size}`} aria-hidden="true">
      {initials}
    </span>
  );
}

export function IamUserCell({ record, showTechnical = false }) {
  const name = userDisplayName(record);
  return (
    <div className="iam-user-cell">
      <IamAvatar record={record} />
      <div className="iam-user-cell__text">
        <strong>{name || "مستخدم"}</strong>
        {showTechnical && record?.user_id ? (
          <code className="iam-tech-id">{String(record.user_id).slice(0, 8)}…</code>
        ) : null}
      </div>
    </div>
  );
}

export function IamRoleBadge({ roleId }) {
  const risk = IAM_ROLE_RISK[roleId];
  const tone = risk === "critical" ? "danger" : risk === "high" ? "warning" : "primary";
  return <IamBadge tone={tone}>{labelRole(roleId)}</IamBadge>;
}

export function IamStatusBadge({ assignment }) {
  const status = labelAssignmentStatus(assignment);
  const tone = assignment?.revoked_at ? "muted" : "success";
  return <IamBadge tone={tone}>{status}</IamBadge>;
}

export function IamReasonText({ reason }) {
  return <span className="iam-reason">{labelAssignmentReason(reason)}</span>;
}

export function IamSeverityBadge({ severity }) {
  const s = String(severity || "info").toLowerCase();
  const tone = s === "critical" ? "danger" : s === "high" ? "warning" : s === "medium" ? "warning" : "muted";
  return <IamBadge tone={tone}>{labelSeverity(severity)}</IamBadge>;
}

export function IamEventIcon({ eventType }) {
  return <span aria-hidden="true">{IAM_EVENT_ICONS[eventType] || "•"}</span>;
}

export function IamTableWrap({ children }) {
  return (
    <div className="iam-table-wrap" role="region" aria-label="جدول البيانات">
      {children}
    </div>
  );
}

export function formatTableDate(value) {
  return formatDateTime(value);
}

export { labelRole, labelPermission, labelSeverity, labelEventType, labelAuditAction };
