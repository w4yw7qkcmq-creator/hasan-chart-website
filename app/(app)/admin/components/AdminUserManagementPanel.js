"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVisibilityRefresh } from "../../../hooks/useVisibilityRefresh";
import { createBackgroundRevalidationController } from "../../../../lib/admin-background-revalidation";
import { adminFetch } from "../../../../lib/admin-fetch";
import { fetchAdminUserList, fetchAllAdminUserList, postAdminUserAction } from "../../../../lib/admin-user-management-client";
import { sanitizeAdminUserFacingError } from "../../../../lib/admin-user-management-shared";
import { notify } from "../../../../lib/notification-center";
import AdminUserQuickPreviewDrawer from "./AdminUserQuickPreviewDrawer";
import AdminUserBulkActionModal from "./AdminUserBulkActionModal";
import AdminUserBulkActionsBar from "./AdminUserBulkActionsBar";
import AdminUsersHeader from "./admin-users/AdminUsersHeader.js";
import AdminUsersKpiPanel from "./admin-users/AdminUsersKpiPanel.js";
import AdminUsersRegistrationCohorts from "./admin-users/AdminUsersRegistrationCohorts.js";
import AdminUsersFilterPanel from "./admin-users/AdminUsersFilterPanel.js";
import AdminUsersResultsPanel from "./admin-users/AdminUsersResultsPanel.js";
import {
  BULK_ACTIONS,
  DEFAULT_CLIENT_FILTERS,
  EXPIRED_SUBSCRIPTION_FILTER,
  buildAdminUserListRequestParams,
  exportUsersToCsv,
  fetchDashboardStats,
  getDashboardCardFilterPreset,
  isExpiredSubscriptionFilterActive,
  resolveEffectiveAccountStatusFilter,
  resolveExpiredSubscriptionBadge,
  resolveUserSubscriptionStateLabel,
} from "./admin-user-management-ux-helpers";

const USERS_LIST_STATE_KEY = "hc:admin-users-list-state";
const USERS_PAGE_SIZE = 25;

function readSavedUsersListState() {
  if (typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(USERS_LIST_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function UserManagementSkeleton() {
  return (
    <div className="au-shell animate-pulse">
      <div className="au-panel" style={{ minHeight: "7rem" }} />
      <div className="au-panel" style={{ minHeight: "12rem" }} />
      <div className="au-panel" style={{ minHeight: "10rem" }} />
      <div className="au-panel" style={{ minHeight: "24rem" }} />
    </div>
  );
}

function AccountStatusBadge({ status, label }) {
  const tone =
    status === "banned"
      ? "au-status-badge--banned"
      : status === "suspended"
      ? "au-status-badge--suspended"
      : status === "deleted"
      ? "au-status-badge--deleted"
      : "au-status-badge--active";

  return <span className={`au-status-badge ${tone}`}>{label}</span>;
}

function SubscriptionStateBadge({ user, serviceFilter = "all" }) {
  const label = resolveUserSubscriptionStateLabel(user, { serviceFilter });

  if (label === "نشط + منتهي") {
    return <span className="au-subscription-badge au-subscription-badge--active">نشط + منتهي</span>;
  }

  const tone =
    label === "منتهي"
      ? "au-subscription-badge--expired"
      : label === "نشط"
      ? "au-subscription-badge--active"
      : label === "خدمة غير نشطة"
      ? "au-subscription-badge--none"
      : "au-subscription-badge--none";

  return <span className={`au-subscription-badge ${tone}`}>{label}</span>;
}

function ExpiredSubscriptionBadge({ user, serviceFilter = "all" }) {
  const badge = resolveExpiredSubscriptionBadge(user, { serviceFilter });
  if (!badge) return null;

  return (
    <div className="au-user-cell__meta">
      <span className="au-badge">{badge.countLabel}</span>
      {badge.typesLabel ? <span className="au-user-cell__meta">{badge.typesLabel}</span> : null}
    </div>
  );
}

export default function AdminUserManagementPanel({
  openUserId = "",
  onOpenUserHandled,
  standalone = false,
  currentAdminUserId: currentAdminUserIdProp = "",
}) {
  const router = useRouter();
  const savedListStateRef = useRef(readSavedUsersListState());
  const filterSignatureRef = useRef("");
  const [users, setUsers] = useState([]);
  const [listTotal, setListTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [tableLoading, setTableLoading] = useState(false);
  const [searchInput, setSearchInput] = useState(() => String(savedListStateRef.current?.searchInput || ""));
  const [searchQuery, setSearchQuery] = useState(() => String(savedListStateRef.current?.searchQuery || ""));
  const [sort, setSort] = useState(() => savedListStateRef.current?.sort || "created_at");
  const [order, setOrder] = useState(() => savedListStateRef.current?.order || "desc");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [viewMode, setViewMode] = useState("server");

  const [dashboardStats, setDashboardStats] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUserId, setPreviewUserId] = useState("");

  const [accountStatusFilter, setAccountStatusFilter] = useState(
    () => savedListStateRef.current?.accountStatusFilter || "all"
  );
  const [clientFilters, setClientFilters] = useState(
    () => savedListStateRef.current?.clientFilters || DEFAULT_CLIENT_FILTERS
  );
  const [activeDashboardKey, setActiveDashboardKey] = useState(
    () => savedListStateRef.current?.activeDashboardKey || ""
  );
  const [registrationCohort, setRegistrationCohort] = useState(
    () => savedListStateRef.current?.registrationCohort || ""
  );
  const [currentAdminUserId, setCurrentAdminUserId] = useState("");

  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [bulkAction, setBulkAction] = useState("");
  const [bulkService, setBulkService] = useState("");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkProgress, setBulkProgress] = useState({
    active: false,
    current: 0,
    total: 0,
    label: "",
    succeeded: 0,
    failed: 0,
    skipped: 0,
  });
  const [bulkModalMode, setBulkModalMode] = useState(null);
  const [bulkSummary, setBulkSummary] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [uxNotice, setUxNotice] = useState("");
  const [lastLoginFilterAvailable, setLastLoginFilterAvailable] = useState(true);
  const [exporting, setExporting] = useState(false);

  const listAbortRef = useRef(null);
  const dashboardAbortRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const listRequestRef = useRef(0);
  const backgroundRevalidationRef = useRef(createBackgroundRevalidationController());

  useEffect(() => {
    if (!openUserId) return;
    router.push(`/admin/users/${encodeURIComponent(openUserId)}`);
    onOpenUserHandled?.();
  }, [openUserId, onOpenUserHandled, router]);

  const expiredFilterActive = isExpiredSubscriptionFilterActive(clientFilters);
  const selectedServiceFilter = clientFilters.service || "all";
  const effectiveAccountStatusFilter = resolveEffectiveAccountStatusFilter(
    accountStatusFilter,
    clientFilters
  );

  const listRequestParams = useMemo(
    () =>
      buildAdminUserListRequestParams({
        page,
        pageSize: USERS_PAGE_SIZE,
        searchQuery,
        sort,
        order,
        accountStatusFilter,
        clientFilters,
        registrationCohort,
        effectiveAccountStatusFilter,
      }),
    [
      accountStatusFilter,
      clientFilters,
      effectiveAccountStatusFilter,
      order,
      page,
      registrationCohort,
      searchQuery,
      sort,
    ]
  );

  const loadDashboard = useCallback(async ({ background = false } = {}) => {
    dashboardAbortRef.current?.abort();
    const controller = new AbortController();
    dashboardAbortRef.current = controller;

    if (!background) setDashboardLoading(true);

    try {
      const stats = await fetchDashboardStats(adminFetch, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setDashboardStats(stats);
    } catch {
      if (!controller.signal.aborted && !background) {
        setDashboardStats(null);
      }
    } finally {
      if (!controller.signal.aborted) setDashboardLoading(false);
    }
  }, []);

  const loadUsers = useCallback(
    async ({ background = false } = {}) => {
      listAbortRef.current?.abort();
      const controller = new AbortController();
      listAbortRef.current = controller;
      const requestId = ++listRequestRef.current;

      if (background) setRefreshing(true);
      else if (loaded) setTableLoading(true);
      else setLoading(true);
      setError("");

      try {
        const result = await fetchAdminUserList(adminFetch, {
          ...listRequestParams,
          signal: controller.signal,
        });

        if (requestId !== listRequestRef.current) return;

        setUsers(result.users || []);
        setListTotal(Number(result.pagination?.total || 0));
        setTotalPages(Number(result.pagination?.totalPages || 1));
        setViewMode("server");
        setLastLoginFilterAvailable(result.capabilities?.lastSignInFilterAvailable !== false);
        setUxNotice(result.truncation?.truncated ? result.truncation.warning || "" : "");
        setLoaded(true);
      } catch (fetchError) {
        if (fetchError?.name === "AbortError" || requestId !== listRequestRef.current) return;
        if (background) {
          setUxNotice("تعذر تحديث البيانات في الخلفية — ما زالت آخر نسخة معروضة.");
          return;
        }
        const sanitized = sanitizeAdminUserFacingError(fetchError, {
          fallback: "تعذر تحميل المستخدمين",
        });
        setError(sanitized.message);
      } finally {
        if (requestId === listRequestRef.current) {
          setLoading(false);
          setRefreshing(false);
          setTableLoading(false);
        }
      }
    },
    [
      listRequestParams,
      loaded,
    ]
  );

  const refreshAll = useCallback(
    ({ background = false } = {}) => {
      void loadDashboard({ background });
      void loadUsers({ background });
    },
    [loadDashboard, loadUsers]
  );

  const refreshAllRef = useRef(refreshAll);
  refreshAllRef.current = refreshAll;

  const runBackgroundRevalidation = useCallback(async () => {
    return backgroundRevalidationRef.current.revalidate(async () => {
      await Promise.all([
        loadDashboard({ background: true }),
        loadUsers({ background: true }),
      ]);
    });
  }, [loadDashboard, loadUsers]);

  useVisibilityRefresh(
    () => {
      void runBackgroundRevalidation();
    },
    {
      enabled: loaded,
      throttleMs: 60_000,
      singleFlight: true,
      refreshOnVisible: true,
      refreshOnFocus: true,
    }
  );

  useEffect(() => {
    if (!loaded) return undefined;

    const handleBackgroundRefresh = () => {
      void runBackgroundRevalidation();
    };

    window.addEventListener("hc:admin-background-refresh", handleBackgroundRefresh);
    return () => {
      window.removeEventListener("hc:admin-background-refresh", handleBackgroundRefresh);
    };
  }, [loaded, runBackgroundRevalidation]);

  useEffect(() => {
    void adminFetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => {
        const id = result?.user?.id || result?.session?.user?.id || "";
        if (id) setCurrentAdminUserId(String(id));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    void loadDashboard();
    return () => dashboardAbortRef.current?.abort();
  }, [loadDashboard]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (!loaded) return undefined;

    const signature = JSON.stringify({
      searchQuery,
      accountStatusFilter,
      clientFilters,
      registrationCohort,
      sort,
      order,
    });

    if (filterSignatureRef.current && filterSignatureRef.current !== signature) {
      setPage(1);
    }

    filterSignatureRef.current = signature;
  }, [accountStatusFilter, clientFilters, loaded, order, registrationCohort, searchQuery, sort]);

  useEffect(() => {
    return () => {
      listRequestRef.current += 1;
      listAbortRef.current?.abort();
      dashboardAbortRef.current?.abort();
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 350);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchInput]);

  const allVisibleSelected =
    users.length > 0 && users.every((user) => selectedUserIds.includes(user.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedUserIds((current) => current.filter((id) => !users.some((user) => user.id === id)));
      return;
    }
    setSelectedUserIds((current) => [...new Set([...current, ...users.map((user) => user.id)])]);
  };

  const toggleSelectUser = (userId) => {
    setSelectedUserIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
    );
  };

  const openUser = (userId) => {
    try {
      sessionStorage.setItem(
        USERS_LIST_STATE_KEY,
        JSON.stringify({
          searchInput,
          searchQuery,
          sort,
          order,
          accountStatusFilter,
          clientFilters,
          activeDashboardKey,
          registrationCohort,
        })
      );
    } catch {
      // ignore
    }

    router.push(`/admin/users/${encodeURIComponent(userId)}`);
  };

  const openQuickPreview = (userId, event) => {
    event?.stopPropagation?.();
    setPreviewUserId(userId);
    setPreviewOpen(true);
  };

  const closeQuickPreview = () => {
    setPreviewOpen(false);
    setPreviewUserId("");
  };


  const buildResultSummary = useCallback(() => {
    const total = Number(listTotal || 0);
    if (searchQuery.trim()) {
      return `${total.toLocaleString("ar")} نتائج مطابقة`;
    }
    if (registrationCohort === "today") {
      return `${total.toLocaleString("ar")} مستخدمًا سجلوا اليوم`;
    }
    if (registrationCohort === "week") {
      return `${total.toLocaleString("ar")} مستخدمًا سجلوا هذا الأسبوع`;
    }
    if (registrationCohort === "month") {
      return `${total.toLocaleString("ar")} مستخدمًا سجلوا هذا الشهر`;
    }
    return `${total.toLocaleString("ar")} مستخدمًا مطابقًا`;
  }, [listTotal, registrationCohort, searchQuery]);

  const handleClearFilters = () => {
    setSearchInput("");
    setSearchQuery("");
    setAccountStatusFilter("all");
    setClientFilters(DEFAULT_CLIENT_FILTERS);
    setRegistrationCohort("");
    setActiveDashboardKey("");
    setPage(1);
    setUxNotice("");
  };

  const handleClientFiltersChange = (nextFilters) => {
    if (
      nextFilters.registeredFrom !== clientFilters.registeredFrom ||
      nextFilters.registeredTo !== clientFilters.registeredTo
    ) {
      setRegistrationCohort("");
      setActiveDashboardKey("");
    }
    setClientFilters(nextFilters);
    setPage(1);
  };

  const handleRegistrationCohortChange = (cohortId) => {
    setRegistrationCohort(cohortId);
    setPage(1);

    if (!cohortId) {
      setClientFilters((current) => ({
        ...current,
        registeredFrom: "",
        registeredTo: "",
      }));
      setActiveDashboardKey("");
      return;
    }

    const cardKey =
      cohortId === "today" ? "newToday" : cohortId === "week" ? "newThisWeek" : "newThisMonth";
    const preset = getDashboardCardFilterPreset(cardKey);
    if (!preset) return;

    setActiveDashboardKey(cardKey);
    setAccountStatusFilter(preset.accountStatus);
    setClientFilters(preset.clientFilters);
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const result = await fetchAllAdminUserList(adminFetch, listRequestParams, {
        pageSize: 100,
      });
      const exportRows = result.users || [];

      exportUsersToCsv(exportRows, `users-export-${Date.now()}.csv`);
      void notify({
        key: "admin_user_export",
        title: "تم التصدير",
        body: result.truncated
          ? `تم تصدير ${exportRows.length} مستخدم (جزء من ${Number(result.pagination?.total || exportRows.length).toLocaleString("ar")} نتيجة)`
          : `تم تصدير ${exportRows.length} مستخدم من النتائج الحالية إلى CSV`,
        persist: false,
        skipSound: true,
        source: "admin-user-management",
      });
    } catch {
      void notify({
        key: "admin_user_export_failed",
        title: "تعذر التصدير",
        body: "لم نتمكن من جلب النتائج المفلترة للتصدير",
        persist: false,
        skipSound: true,
        source: "admin-user-management",
        metadata: { type: "error" },
      });
    } finally {
      setExporting(false);
    }
  };

  const toggleSort = (nextSort) => {
    if (sort === nextSort) {
      setOrder((current) => (current === "desc" ? "asc" : "desc"));
    } else {
      setSort(nextSort);
      setOrder("desc");
    }
  };

  const handleDashboardCardClick = (cardKey) => {
    const preset = getDashboardCardFilterPreset(cardKey);
    if (!preset) return;

    setActiveDashboardKey(cardKey);
    setAccountStatusFilter(preset.accountStatus);
    setClientFilters(preset.clientFilters);
    setRegistrationCohort(preset.registrationCohort || "");
    setPage(1);
    setUxNotice("");
  };

  const handleAccountStatusFilterClick = (statusId) => {
    setAccountStatusFilter(statusId);
    setActiveDashboardKey("");
    setClientFilters((current) => ({ ...current, subscriptionState: "all", status: "all" }));
  };

  const handleExpiredSubscriptionFilterClick = () => {
    setAccountStatusFilter("all");
    setActiveDashboardKey("expiredSubscriptions");
    setClientFilters((current) => ({
      ...current,
      subscriptionState: EXPIRED_SUBSCRIPTION_FILTER,
      status: "all",
    }));
    setUxNotice("تم تطبيق فلتر: الاشتراكات المنتهية");
  };

  const requestBulkRun = () => {
    const config = BULK_ACTIONS.find((item) => item.id === bulkAction);
    if (!config || selectedUserIds.length === 0) return;

    if (config.needsReason && !bulkReason.trim()) {
      void notify({
        key: "admin_bulk_reason",
        title: "سبب مطلوب",
        body: "يجب كتابة سبب التعليق للإجراء الجماعي",
        persist: false,
        skipSound: true,
        source: "admin-user-management",
        metadata: { type: "error" },
      });
      return;
    }

    if (config.needsService && !bulkService) {
      void notify({
        key: "admin_bulk_service",
        title: "خدمة مطلوبة",
        body: "اختر الخدمة المراد تفعيلها/إيقافها",
        persist: false,
        skipSound: true,
        source: "admin-user-management",
        metadata: { type: "error" },
      });
      return;
    }

    setBulkModalMode("confirm");
  };

  const runBulkAction = async () => {
    const config = BULK_ACTIONS.find((item) => item.id === bulkAction);
    if (!config || selectedUserIds.length === 0) return;

    const totalSelected = selectedUserIds.length;

    setActionLoading(true);
    setBulkProgress({
      active: true,
      current: 0,
      total: totalSelected,
      label: config.label,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    });

    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    for (let index = 0; index < selectedUserIds.length; index += 1) {
      const userId = selectedUserIds[index];
      const user = users.find((row) => row.id === userId);

      if (String(currentAdminUserIdProp || currentAdminUserId) === String(userId)) {
        skipped += 1;
        setBulkProgress((current) => ({
          ...current,
          current: index + 1,
          succeeded,
          failed,
          skipped,
        }));
        continue;
      }

      try {
        await postAdminUserAction(adminFetch, userId, {
          action: config.id,
          service: bulkService,
          reason: bulkReason,
          confirmEmail: config.dangerous ? user?.email || "" : "",
        });
        succeeded += 1;
      } catch {
        failed += 1;
      }

      setBulkProgress((current) => ({
        ...current,
        current: index + 1,
        succeeded,
        failed,
        skipped,
      }));
    }

    setBulkProgress({
      active: false,
      current: 0,
      total: 0,
      label: "",
      succeeded: 0,
      failed: 0,
      skipped: 0,
    });
    setActionLoading(false);
    setSelectedUserIds([]);
    setBulkAction("");
    setBulkService("");
    setBulkReason("");

    setBulkSummary({
      actionLabel: config.label,
      total: totalSelected,
      succeeded,
      failed,
      skipped,
    });
    setBulkModalMode("summary");

    refreshAll({ background: true });
  };

  const selectedBulkAction = BULK_ACTIONS.find((item) => item.id === bulkAction);

  if (!loaded && loading) {
    return <UserManagementSkeleton />;
  }

  return (
    <>
      <section className="au-shell scroll-mt-6">
        <AdminUsersHeader
          onRefresh={() => refreshAll({ background: true })}
          onExportCsv={handleExportCsv}
          refreshing={refreshing}
          exporting={exporting}
          exportDisabled={loading || tableLoading || users.length === 0}
        />

        <AdminUsersKpiPanel
          stats={dashboardStats}
          loading={dashboardLoading}
          activeCardKey={activeDashboardKey}
          onCardClick={handleDashboardCardClick}
        />

        <AdminUsersRegistrationCohorts
          stats={dashboardStats}
          activeCohort={registrationCohort}
          onChange={handleRegistrationCohortChange}
          loading={dashboardLoading}
        />

        <AdminUsersFilterPanel
          searchInput={searchInput}
          onSearchInputChange={(value) => {
            setSearchInput(value);
            setPage(1);
          }}
          onClearSearch={() => {
            setSearchInput("");
            setSearchQuery("");
            setPage(1);
          }}
          searching={tableLoading && Boolean(searchInput.trim())}
          clientFilters={clientFilters}
          onClientFiltersChange={handleClientFiltersChange}
          accountStatusFilter={accountStatusFilter}
          onAccountStatusFilterClick={(statusId) => {
            handleAccountStatusFilterClick(statusId);
            setPage(1);
          }}
          expiredFilterActive={expiredFilterActive}
          onExpiredSubscriptionFilterClick={() => {
            handleExpiredSubscriptionFilterClick();
            setPage(1);
          }}
          sort={sort}
          order={order}
          onToggleSort={toggleSort}
          onClearFilters={handleClearFilters}
          lastLoginFilterAvailable={lastLoginFilterAvailable}
        />

        <AdminUserBulkActionsBar
          selectedCount={selectedUserIds.length}
          bulkAction={bulkAction}
          bulkService={bulkService}
          bulkReason={bulkReason}
          bulkProgress={bulkProgress}
          actionLoading={actionLoading}
          onActionChange={setBulkAction}
          onServiceChange={setBulkService}
          onReasonChange={setBulkReason}
          onRun={requestBulkRun}
          onClear={() => setSelectedUserIds([])}
        />

        {uxNotice ? <p className="au-notice">{uxNotice}</p> : null}

        {error ? (
          <div className="au-panel au-empty">
            <p className="font-black text-red-200">{error}</p>
            <button type="button" className="au-btn au-btn--primary mt-4" onClick={() => void loadUsers()}>
              إعادة المحاولة
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="au-panel au-empty">
            <div className="au-panel__icon" aria-hidden="true">
              👥
            </div>
            <h3 className="au-panel__title">لا يوجد مستخدمون مطابقون</h3>
          </div>
        ) : (
          <AdminUsersResultsPanel
            summary={buildResultSummary()}
            page={page}
            totalPages={totalPages}
            onPageChange={(nextPage) => setPage(Math.max(nextPage, 1))}
            users={users}
            selectedUserIds={selectedUserIds}
            onToggleSelectAll={toggleSelectAll}
            onToggleSelectUser={toggleSelectUser}
            onOpenUser={openUser}
            onOpenQuickPreview={openQuickPreview}
            allVisibleSelected={allVisibleSelected}
            loading={tableLoading}
            AccountStatusBadge={AccountStatusBadge}
            SubscriptionStateBadge={SubscriptionStateBadge}
            ExpiredSubscriptionBadge={ExpiredSubscriptionBadge}
            selectedServiceFilter={selectedServiceFilter}
          />
        )}
      </section>

      <AdminUserBulkActionModal
        mode={bulkModalMode}
        selectedCount={selectedUserIds.length}
        actionLabel={selectedBulkAction?.label || ""}
        actionTone={selectedBulkAction?.tone || "neutral"}
        summary={bulkSummary}
        onConfirm={() => {
          setBulkModalMode(null);
          void runBulkAction();
        }}
        onCancel={() => setBulkModalMode(null)}
        onCloseSummary={() => {
          setBulkModalMode(null);
          setBulkSummary(null);
        }}
      />

      <AdminUserQuickPreviewDrawer
        open={previewOpen}
        userId={previewUserId}
        onClose={closeQuickPreview}
      />
    </>
  );
}
