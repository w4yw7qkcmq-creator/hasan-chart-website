"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../../lib/admin-fetch";
import { fetchAdminUserList, postAdminUserAction } from "../../../../lib/admin-user-management-client";
import { sanitizeAdminUserFacingError } from "../../../../lib/admin-user-management-shared";
import { notify } from "../../../../lib/notification-center";
import AdminUserDrawer from "./AdminUserDrawer";
import AdminUserBulkActionModal from "./AdminUserBulkActionModal";
import AdminUserBulkActionsBar from "./AdminUserBulkActionsBar";
import AdminUserManagementDashboard from "./AdminUserManagementDashboard";
import AdminUserQuickActions from "./AdminUserQuickActions";
import {
  BULK_ACTIONS,
  DEFAULT_CLIENT_FILTERS,
  exportUsersToCsv,
  fetchDashboardStats,
  fetchUsersForClientView,
  getDashboardCardFilterPreset,
} from "./admin-user-management-ux-helpers";

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ar");
}

function UserManagementSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="admin-user-dashboard admin-user-dashboard--skeleton h-40" />
      <section className="admin-section p-4 md:p-5">
        <div className="h-12 rounded-2xl bg-white/10" />
      </section>
      <div className="admin-section overflow-hidden p-0">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 border-b border-cyan-300/10 px-4 py-4">
            <div className="h-11 w-11 rounded-full bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 rounded bg-white/15" />
              <div className="h-3 w-56 rounded bg-white/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountStatusBadge({ status, label }) {
  const tone =
    status === "banned"
      ? "admin-user-status--banned"
      : status === "suspended"
      ? "admin-user-status--suspended"
      : status === "deleted"
      ? "admin-user-status--deleted"
      : "admin-user-status--active";

  return <span className={`admin-user-status ${tone}`}>{label}</span>;
}

function UserAvatar({ name, avatarUrl }) {
  const initials = String(name || "؟")
    .trim()
    .slice(0, 2)
    .toUpperCase();

  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name || "المستخدم"}
        width={44}
        height={44}
        className="admin-user-avatar__image"
        unoptimized
      />
    );
  }

  return <span className="admin-user-avatar__initials">{initials}</span>;
}

export default function AdminUserManagementPanel({
  openUserId = "",
  onOpenUserHandled,
  standalone = false,
  currentAdminUserId: currentAdminUserIdProp = "",
}) {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState("created_at");
  const [order, setOrder] = useState("desc");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [viewMode, setViewMode] = useState("server");

  const [dashboardStats, setDashboardStats] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");

  const [accountStatusFilter, setAccountStatusFilter] = useState("all");
  const [clientFilters, setClientFilters] = useState(DEFAULT_CLIENT_FILTERS);
  const [activeDashboardKey, setActiveDashboardKey] = useState("");
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

  const listAbortRef = useRef(null);
  const dashboardAbortRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const listRequestRef = useRef(0);

  useEffect(() => {
    if (!openUserId) return;
    if (standalone) {
      router.push(`/admin/users/${encodeURIComponent(openUserId)}`);
      onOpenUserHandled?.();
      return;
    }
    setSelectedUserId(openUserId);
    setDrawerOpen(true);
    onOpenUserHandled?.();
  }, [openUserId, onOpenUserHandled, router, standalone]);

  const hasClientFilters = useMemo(() => {
    return (
      Boolean(searchQuery.trim()) ||
      clientFilters.service !== "all" ||
      Boolean(clientFilters.plan.trim()) ||
      clientFilters.status !== "all" ||
      clientFilters.subscriptionState !== "all" ||
      Boolean(clientFilters.registeredFrom) ||
      Boolean(clientFilters.registeredTo) ||
      Boolean(clientFilters.lastLoginFrom) ||
      Boolean(clientFilters.lastLoginTo)
    );
  }, [clientFilters, searchQuery]);

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
      if (!controller.signal.aborted) {
        setDashboardStats(null);
      }
    } finally {
      if (!controller.signal.aborted) setDashboardLoading(false);
    }
  }, []);

  const loadUsers = useCallback(
    async ({ page = 1, background = false } = {}) => {
      listAbortRef.current?.abort();
      const controller = new AbortController();
      listAbortRef.current = controller;
      const requestId = ++listRequestRef.current;

      if (background) setRefreshing(true);
      else setLoading(true);
      setError("");

      try {
        if (hasClientFilters) {
          const result = await fetchUsersForClientView(adminFetch, {
            search: searchQuery,
            sort,
            order,
            accountStatus: accountStatusFilter,
            clientFilters,
            signal: controller.signal,
          });

          if (requestId !== listRequestRef.current) return;

          setUsers(result.users || []);
          setPagination(
            result.pagination || {
              page: 1,
              pageSize: 20,
              total: 0,
              totalPages: 1,
            }
          );
          setViewMode(result.mode || "client");
          setUxNotice(
            result.mode === "client"
              ? `عرض ${result.users.length} نتيجة بعد البحث/الفلاتر (تم فحص ${result.scannedPages} صفحة)`
              : ""
          );
        } else {
          const result = await fetchAdminUserList(adminFetch, {
            page,
            search: searchQuery,
            sort,
            order,
            accountStatus: accountStatusFilter,
            signal: controller.signal,
          });

          if (requestId !== listRequestRef.current) return;

          setUsers(result.users || []);
          setPagination(
            result.pagination || {
              page: 1,
              pageSize: 20,
              total: 0,
              totalPages: 1,
            }
          );
          setViewMode("server");
          setUxNotice("");
        }

        setLoaded(true);
      } catch (fetchError) {
        if (fetchError?.name === "AbortError" || requestId !== listRequestRef.current) return;
        const sanitized = sanitizeAdminUserFacingError(fetchError, {
          fallback: "تعذر تحميل المستخدمين",
        });
        setError(sanitized.message);
      } finally {
        if (requestId === listRequestRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [accountStatusFilter, clientFilters, hasClientFilters, order, searchQuery, sort]
  );

  const refreshAll = useCallback(
    ({ background = false } = {}) => {
      void loadDashboard({ background });
      void loadUsers({ page: pagination.page, background });
    },
    [loadDashboard, loadUsers, pagination.page]
  );

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
    void loadUsers({ page: hasClientFilters ? 1 : pagination.page });
  }, [hasClientFilters, loadUsers, pagination.page]);

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
      setPagination((current) => ({ ...current, page: 1 }));
    }, 350);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchInput]);

  const sortLabel = useMemo(() => {
    if (sort === "last_sign_in") {
      return order === "asc" ? "آخر دخول: الأقدم" : "آخر دخول: الأحدث";
    }
    return order === "asc" ? "التسجيل: الأقدم" : "التسجيل: الأحدث";
  }, [order, sort]);

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
    if (standalone) {
      router.push(`/admin/users/${encodeURIComponent(userId)}`);
      return;
    }
    setSelectedUserId(userId);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedUserId("");
  };

  const toggleSort = (nextSort) => {
    if (sort === nextSort) {
      setOrder((current) => (current === "desc" ? "asc" : "desc"));
    } else {
      setSort(nextSort);
      setOrder("desc");
    }
    setPagination((current) => ({ ...current, page: 1 }));
  };

  const handleDashboardCardClick = (cardKey) => {
    const preset = getDashboardCardFilterPreset(cardKey);
    if (!preset) return;

    setActiveDashboardKey(cardKey);
    setAccountStatusFilter(preset.accountStatus);
    setClientFilters(preset.clientFilters);
    setPagination((current) => ({ ...current, page: 1 }));
    setUxNotice(`تم تطبيق فلتر: ${cardKey === "total" ? "الكل" : cardKey}`);
  };

  const handleQuickAction = (actionId) => {
    if (actionId === "refresh") {
      refreshAll({ background: true });
      return;
    }
    if (actionId === "export-csv") {
      exportUsersToCsv(users, `users-export-${Date.now()}.csv`);
      void notify({
        key: "admin_user_export",
        title: "تم التصدير",
        body: `تم تصدير ${users.length} مستخدم إلى CSV`,
        persist: false,
        skipSound: true,
        source: "admin-user-management",
      });
      return;
    }
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
      <section className="space-y-5 scroll-mt-6">
        {standalone ? (
          <div className="admin-standalone-page__toolbar">
            <Link href="/admin" className="admin-standalone-back-link">
              ← العودة إلى لوحة الإدارة
            </Link>
          </div>
        ) : null}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <h2 className="admin-heading text-3xl">إدارة المستخدمين</h2>
            <p className="mt-2 text-slate-600">
              مركز CRM لإدارة المستخدمين — مؤشرات، فلاتر، إجراءات جماعية، وتفاصيل موسّعة.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {refreshing ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-black text-cyan-100">
                ⟳ تحديث
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => refreshAll({ background: true })}
              className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20"
            >
              تحديث البيانات
            </button>
          </div>
        </div>

        <AdminUserManagementDashboard
          stats={dashboardStats}
          loading={dashboardLoading}
          activeCardKey={activeDashboardKey}
          onCardClick={handleDashboardCardClick}
        />
        <AdminUserQuickActions onAction={handleQuickAction} disabled={loading || refreshing} />

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

        <div className="admin-section p-4 md:p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-400">بحث ذكي</label>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="الاسم، البريد، Telegram، UID..."
              className="admin-field mt-2 font-bold"
            />
          </div>

          <div className="admin-user-filters-grid">
            <div>
              <label className="text-xs font-bold text-slate-400">الخدمة</label>
              <select
                className="admin-field mt-2 text-sm"
                value={clientFilters.service}
                onChange={(event) =>
                  setClientFilters((current) => ({ ...current, service: event.target.value }))
                }
              >
                <option value="all">الكل</option>
                <option value="vip">VIP</option>
                <option value="account_management">إدارة الحسابات</option>
                <option value="alerts">التنبيهات</option>
                <option value="academy">الأكاديمية</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400">الخطة</label>
              <input
                className="admin-field mt-2 text-sm"
                value={clientFilters.plan}
                onChange={(event) =>
                  setClientFilters((current) => ({ ...current, plan: event.target.value }))
                }
                placeholder="VIP Spot..."
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400">الحالة</label>
              <select
                className="admin-field mt-2 text-sm"
                value={clientFilters.status}
                onChange={(event) =>
                  setClientFilters((current) => ({ ...current, status: event.target.value }))
                }
              >
                <option value="all">الكل</option>
                <option value="active">نشط</option>
                <option value="suspended">معلق</option>
                <option value="banned">محظور</option>
                <option value="deleted">محذوف</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400">تاريخ التسجيل من</label>
              <input
                type="date"
                className="admin-field mt-2 text-sm"
                value={clientFilters.registeredFrom}
                onChange={(event) =>
                  setClientFilters((current) => ({ ...current, registeredFrom: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400">تاريخ التسجيل إلى</label>
              <input
                type="date"
                className="admin-field mt-2 text-sm"
                value={clientFilters.registeredTo}
                onChange={(event) =>
                  setClientFilters((current) => ({ ...current, registeredTo: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400">آخر دخول من</label>
              <input
                type="date"
                className="admin-field mt-2 text-sm"
                value={clientFilters.lastLoginFrom}
                onChange={(event) =>
                  setClientFilters((current) => ({ ...current, lastLoginFrom: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400">آخر دخول إلى</label>
              <input
                type="date"
                className="admin-field mt-2 text-sm"
                value={clientFilters.lastLoginTo}
                onChange={(event) =>
                  setClientFilters((current) => ({ ...current, lastLoginTo: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => toggleSort("created_at")}
              className={`rounded-2xl border px-4 py-2.5 text-sm font-black transition ${
                sort === "created_at"
                  ? "admin-filter-btn admin-filter-btn--active"
                  : "admin-filter-btn admin-filter-btn--idle"
              }`}
            >
              ترتيب حسب تاريخ التسجيل {sort === "created_at" ? (order === "desc" ? "↓" : "↑") : ""}
            </button>
            <button
              type="button"
              onClick={() => toggleSort("last_sign_in")}
              className={`rounded-2xl border px-4 py-2.5 text-sm font-black transition ${
                sort === "last_sign_in"
                  ? "admin-filter-btn admin-filter-btn--active"
                  : "admin-filter-btn admin-filter-btn--idle"
              }`}
            >
              ترتيب حسب آخر دخول {sort === "last_sign_in" ? (order === "desc" ? "↓" : "↑") : ""}
            </button>
            <span className="self-center text-xs font-bold text-slate-500">{sortLabel}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { id: "all", label: "الكل" },
              { id: "active", label: "نشط" },
              { id: "suspended", label: "معلق" },
              { id: "banned", label: "محظور" },
              { id: "deleted", label: "محذوف" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setAccountStatusFilter(item.id);
                  setActiveDashboardKey("");
                  setPagination((current) => ({ ...current, page: 1 }));
                }}
                className={`rounded-2xl border px-4 py-2 text-sm font-black transition ${
                  accountStatusFilter === item.id
                    ? "admin-filter-btn admin-filter-btn--active"
                    : "admin-filter-btn admin-filter-btn--idle"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {uxNotice ? <p className="text-xs font-bold text-cyan-200/80">{uxNotice}</p> : null}
        </div>

        {error ? (
          <div className="admin-section p-6 text-center">
            <p className="font-black text-red-200">{error}</p>
            <button
              type="button"
              className="admin-btn-surface mt-4 px-5 py-3"
              onClick={() => void loadUsers({ page: pagination.page })}
            >
              إعادة المحاولة
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="admin-section admin-card--dashed p-10 text-center">
            <div className="admin-empty-icon">👥</div>
            <h3 className="admin-heading text-2xl">لا يوجد مستخدمون مطابقون</h3>
          </div>
        ) : (
          <div className="admin-section admin-table-wrap p-0">
            <table className="admin-user-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      aria-label="تحديد الكل"
                    />
                  </th>
                  <th>المستخدم</th>
                  <th>البريد</th>
                  <th>Telegram / UID</th>
                  <th>تاريخ التسجيل</th>
                  <th>آخر دخول</th>
                  <th>الحالة</th>
                  <th>اشتراكات نشطة</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className={selectedUserIds.includes(user.id) ? "is-selected" : ""}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(user.id)}
                        onChange={() => toggleSelectUser(user.id)}
                        aria-label={`تحديد ${user.username || user.email}`}
                      />
                    </td>
                    <td>
                      <div className="admin-user-table__identity">
                        <div className="admin-user-avatar">
                          <UserAvatar name={user.username || user.email} avatarUrl={user.avatarUrl} />
                        </div>
                        <div>
                          <p className="font-black">{user.username || "—"}</p>
                          {user.role === "admin" ? (
                            <span className="text-xs font-bold text-cyan-300">مدير</span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td>{user.email || "—"}</td>
                    <td className="text-xs">
                      <p>{user.telegram || "—"}</p>
                      <p className="text-slate-500">{user.uid || user.id}</p>
                    </td>
                    <td>{formatDateTime(user.createdAt)}</td>
                    <td>{formatDateTime(user.lastSignInAt)}</td>
                    <td>
                      <AccountStatusBadge status={user.accountStatus} label={user.accountStatusLabel} />
                    </td>
                    <td>{user.activeSubscriptionsCount}</td>
                    <td>
                      <button type="button" className="admin-user-manage-btn" onClick={() => openUser(user.id)}>
                        إدارة
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!error && viewMode === "server" && pagination.totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-slate-500">
              عرض {users.length} من {pagination.total} مستخدم — الصفحة {pagination.page} / {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pagination.page <= 1 || loading}
                onClick={() => setPagination((current) => ({ ...current, page: Math.max(current.page - 1, 1) }))}
                className="admin-btn-surface px-4 py-2 disabled:opacity-50"
              >
                السابق
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() =>
                  setPagination((current) => ({
                    ...current,
                    page: Math.min(current.page + 1, current.totalPages),
                  }))
                }
                className="admin-btn-surface px-4 py-2 disabled:opacity-50"
              >
                التالي
              </button>
            </div>
          </div>
        ) : null}
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

      {!standalone ? (
        <AdminUserDrawer
          open={drawerOpen}
          userId={selectedUserId}
          onClose={closeDrawer}
        />
      ) : null}
    </>
  );
}
