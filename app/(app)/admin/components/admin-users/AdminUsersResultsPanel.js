"use client";

import AdminUsersResultFooter from "./AdminUsersResultFooter.js";
import AdminUsersTable from "./AdminUsersTable.js";

export default function AdminUsersResultsPanel({
  summary,
  page,
  totalPages,
  onPageChange,
  users,
  selectedUserIds,
  onToggleSelectAll,
  onToggleSelectUser,
  onOpenUser,
  onOpenQuickPreview,
  allVisibleSelected,
  loading = false,
  AccountStatusBadge,
  SubscriptionStateBadge,
  ExpiredSubscriptionBadge,
  selectedServiceFilter,
}) {
  return (
    <section className="au-panel au-panel--results">
      <div className="au-panel__head au-panel__head--flat au-results-head">
        <div>
          <h2 className="au-panel__title">المستخدمون</h2>
          <p className="au-panel__subtitle">{summary}</p>
        </div>
      </div>

      <AdminUsersTable
        users={users}
        selectedUserIds={selectedUserIds}
        onToggleSelectAll={onToggleSelectAll}
        onToggleSelectUser={onToggleSelectUser}
        onOpenUser={onOpenUser}
        onOpenQuickPreview={onOpenQuickPreview}
        allVisibleSelected={allVisibleSelected}
        loading={loading}
        AccountStatusBadge={AccountStatusBadge}
        SubscriptionStateBadge={SubscriptionStateBadge}
        ExpiredSubscriptionBadge={ExpiredSubscriptionBadge}
        selectedServiceFilter={selectedServiceFilter}
      />

      <AdminUsersResultFooter
        summary={summary}
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
      />
    </section>
  );
}
