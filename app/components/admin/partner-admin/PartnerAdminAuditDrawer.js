"use client";

import {
  auditActionLabel,
  auditEntityLabel,
  formatAuditDate,
  formatAuditStateSummary,
  formatShortUuid,
} from "./partner-admin-labels.js";

function StateBlock({ title, state }) {
  return (
    <div className="pa-audit-drawer__state">
      <p className="pa-audit-drawer__state-title">{title}</p>
      <p className="pa-audit-drawer__state-summary">{formatAuditStateSummary(state)}</p>
      {state ? (
        <details className="pa-audit-drawer__technical">
          <summary>تفاصيل تقنية</summary>
          <pre className="pa-audit-drawer__json">{JSON.stringify(state, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

export default function PartnerAdminAuditDrawer({ row, onClose }) {
  if (!row) return null;

  return (
    <div className="pa-drawer-overlay" role="presentation" onClick={onClose}>
      <aside
        className="pa-drawer"
        role="dialog"
        aria-labelledby="pa-audit-drawer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="pa-drawer__head">
          <div>
            <p className="pa-hero__badge">🧾 سجل التدقيق</p>
            <h3 id="pa-audit-drawer-title" className="pa-section__title">
              تفاصيل التغيير
            </h3>
          </div>
          <button type="button" className="pa-btn pa-btn--ghost pa-btn--sm" onClick={onClose}>
            إغلاق
          </button>
        </header>

        <dl className="pa-audit-drawer__meta">
          <div>
            <dt>الإجراء</dt>
            <dd>{auditActionLabel(row.action)}</dd>
          </div>
          <div>
            <dt>الكيان</dt>
            <dd>{auditEntityLabel(row.entity_type)}</dd>
          </div>
          <div>
            <dt>المعرف</dt>
            <dd>
              <span className="pa-code">{formatShortUuid(row.entity_id)}</span>
            </dd>
          </div>
          <div>
            <dt>المسؤول</dt>
            <dd>
              <span className="pa-code">{formatShortUuid(row.actor_user_id)}</span>
            </dd>
          </div>
          <div>
            <dt>التاريخ</dt>
            <dd>{formatAuditDate(row.created_at)}</dd>
          </div>
          <div>
            <dt>السبب</dt>
            <dd>{row.reason || "—"}</dd>
          </div>
        </dl>

        <div className="pa-audit-drawer__states">
          <StateBlock title="قبل" state={row.before_state} />
          <StateBlock title="بعد" state={row.after_state} />
        </div>
      </aside>
    </div>
  );
}
