"use client";

import { BULK_ACTIONS, SERVICE_OPTIONS } from "./admin-user-management-ux-helpers";

export default function AdminUserBulkActionsBar({
  selectedCount,
  bulkAction,
  bulkService,
  bulkReason,
  bulkProgress,
  actionLoading,
  onActionChange,
  onServiceChange,
  onReasonChange,
  onRun,
  onClear,
}) {
  if (selectedCount <= 0 && !bulkProgress?.active) return null;

  const selectedAction = BULK_ACTIONS.find((item) => item.id === bulkAction);

  return (
    <section className="admin-user-bulk-bar">
      <div className="admin-user-bulk-bar__head">
        <p className="font-black text-cyan-100">
          {selectedCount} مستخدم محدد
        </p>
        <button type="button" className="admin-btn-surface px-3 py-2 text-xs" onClick={onClear}>
          إلغاء التحديد
        </button>
      </div>

      <div className="admin-user-bulk-bar__controls">
        <select
          value={bulkAction}
          onChange={(event) => onActionChange(event.target.value)}
          className="admin-field text-sm"
          disabled={bulkProgress?.active}
        >
          <option value="">اختر إجراءً جماعياً...</option>
          {BULK_ACTIONS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>

        {selectedAction?.needsService ? (
          <select
            value={bulkService}
            onChange={(event) => onServiceChange(event.target.value)}
            className="admin-field text-sm"
            disabled={bulkProgress?.active}
          >
            <option value="">الخدمة...</option>
            {SERVICE_OPTIONS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        ) : null}

        {selectedAction?.needsReason ? (
          <input
            value={bulkReason}
            onChange={(event) => onReasonChange(event.target.value)}
            className="admin-field text-sm"
            placeholder="سبب التعليق..."
            disabled={bulkProgress?.active}
          />
        ) : null}

        <button
          type="button"
          className="admin-user-manage-btn"
          disabled={!bulkAction || bulkProgress?.active || actionLoading}
          onClick={onRun}
        >
          {bulkProgress?.active ? "جاري التنفيذ..." : "تنفيذ"}
        </button>
      </div>

      {bulkProgress?.active ? (
        <div className="admin-user-bulk-bar__progress">
          <div className="admin-user-bulk-bar__progress-track">
            <div
              className="admin-user-bulk-bar__progress-fill"
              style={{
                width: `${Math.round((bulkProgress.current / Math.max(bulkProgress.total, 1)) * 100)}%`,
              }}
            />
          </div>
          <p className="text-xs font-bold text-slate-400">
            {bulkProgress.current} / {bulkProgress.total} — {bulkProgress.label}
          </p>
          <p className="admin-user-bulk-bar__progress-stats">
            <span className="admin-user-bulk-bar__stat admin-user-bulk-bar__stat--success">
              نجح: {bulkProgress.succeeded ?? 0}
            </span>
            <span className="admin-user-bulk-bar__stat admin-user-bulk-bar__stat--failed">
              فشل: {bulkProgress.failed ?? 0}
            </span>
            <span className="admin-user-bulk-bar__stat admin-user-bulk-bar__stat--skipped">
              تخطي: {bulkProgress.skipped ?? 0}
            </span>
          </p>
        </div>
      ) : null}
    </section>
  );
}
