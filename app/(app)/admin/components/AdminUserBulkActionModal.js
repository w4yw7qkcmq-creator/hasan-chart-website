"use client";
export default function AdminUserBulkActionModal({
  mode,
  selectedCount = 0,
  actionLabel = "",
  actionTone = "neutral",
  summary = null,
  onConfirm,
  onCancel,
  onCloseSummary,
}) {
  if (!mode) return null;
  const isConfirm = mode === "confirm";
  const isSummary = mode === "summary";
  const toneClass =
    actionTone === "danger"
      ? "admin-user-bulk-modal__tone--danger"
      : actionTone === "warning"
        ? "admin-user-bulk-modal__tone--warning"
        : "admin-user-bulk-modal__tone--neutral";
  return (
    <div className="admin-user-bulk-modal" role="presentation">
      {" "}
      <button
        type="button"
        className="admin-user-bulk-modal__backdrop"
        onClick={isConfirm ? onCancel : onCloseSummary}
        aria-label="إغلاق"
      />{" "}
      <div
        className={`admin-user-bulk-modal__panel ${toneClass}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-bulk-modal-title"
      >
        {" "}
        {isConfirm ? (
          <>
            {" "}
            <p className="admin-user-hero__eyebrow">
              تأكيد الإجراء الجماعي
            </p>{" "}
            <h3 id="admin-bulk-modal-title" className="admin-heading text-xl">
              {" "}
              {actionLabel}{" "}
            </h3>{" "}
            <p className="admin-user-bulk-modal__lead">
              {" "}
              سيتم تنفيذ هذا الإجراء على{" "}
              <strong>{selectedCount.toLocaleString("ar")}</strong> مستخدم
              محدد.{" "}
            </p>{" "}
            {actionTone === "danger" ? (
              <p className="admin-user-bulk-modal__warning">
                {" "}
                هذا إجراء حساس وقد يؤثر على وصول المستخدمين. تأكد من اختيارك قبل
                المتابعة.{" "}
              </p>
            ) : null}{" "}
            <div className="admin-user-bulk-modal__actions">
              {" "}
              <button
                type="button"
                className="admin-btn-surface px-4 py-2.5"
                onClick={onCancel}
              >
                {" "}
                إلغاء{" "}
              </button>{" "}
              <button
                type="button"
                className="admin-user-manage-btn"
                onClick={onConfirm}
              >
                {" "}
                تأكيد التنفيذ{" "}
              </button>{" "}
            </div>{" "}
          </>
        ) : null}{" "}
        {isSummary && summary ? (
          <>
            {" "}
            <p className="admin-user-hero__eyebrow">ملخص التنفيذ</p>{" "}
            <h3 id="admin-bulk-modal-title" className="admin-heading text-xl">
              {" "}
              {summary.actionLabel}{" "}
            </h3>{" "}
            <p className="admin-user-bulk-modal__lead">
              {" "}
              اكتملت المعالجة لـ{" "}
              <strong>{summary.total.toLocaleString("ar")}</strong> مستخدم.{" "}
            </p>{" "}
            <div className="admin-user-bulk-modal__summary-grid">
              {" "}
              <article className="admin-user-bulk-modal__summary-card admin-user-bulk-modal__summary-card--success">
                {" "}
                <p className="admin-user-bulk-modal__summary-label">نجح</p>{" "}
                <p className="admin-user-bulk-modal__summary-value">
                  {summary.succeeded.toLocaleString("ar")}
                </p>{" "}
              </article>{" "}
              <article className="admin-user-bulk-modal__summary-card admin-user-bulk-modal__summary-card--failed">
                {" "}
                <p className="admin-user-bulk-modal__summary-label">فشل</p>{" "}
                <p className="admin-user-bulk-modal__summary-value">
                  {summary.failed.toLocaleString("ar")}
                </p>{" "}
              </article>{" "}
              <article className="admin-user-bulk-modal__summary-card admin-user-bulk-modal__summary-card--skipped">
                {" "}
                <p className="admin-user-bulk-modal__summary-label">
                  تم التخطي
                </p>{" "}
                <p className="admin-user-bulk-modal__summary-value">
                  {summary.skipped.toLocaleString("ar")}
                </p>{" "}
              </article>{" "}
            </div>{" "}
            <div className="admin-user-bulk-modal__actions">
              {" "}
              <button
                type="button"
                className="admin-user-manage-btn"
                onClick={onCloseSummary}
              >
                {" "}
                إغلاق{" "}
              </button>{" "}
            </div>{" "}
          </>
        ) : null}{" "}
      </div>{" "}
    </div>
  );
}
