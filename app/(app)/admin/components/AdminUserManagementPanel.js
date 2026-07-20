"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../../lib/admin-fetch";
import { fetchAdminUserList } from "../../../../lib/admin-user-management-client";
import AdminUserDrawer from "./AdminUserDrawer";

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ar");
}

function UserManagementSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <section className="admin-section p-4 md:p-5">
        <div className="flex flex-wrap gap-3">
          <div className="h-11 w-48 rounded-2xl bg-white/10" />
          <div className="h-11 w-40 rounded-2xl bg-white/10" />
        </div>
        <div className="mt-4 h-12 rounded-2xl bg-white/10" />
      </section>
      <div className="admin-section overflow-hidden p-0">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 border-b border-cyan-300/10 px-4 py-4">
            <div className="h-11 w-11 rounded-full bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 rounded bg-white/15" />
              <div className="h-3 w-56 rounded bg-white/10" />
            </div>
            <div className="h-8 w-20 rounded-full bg-white/10" />
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

export default function AdminUserManagementPanel() {
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

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");

  const [accountStatusFilter, setAccountStatusFilter] = useState("all");
  const [currentAdminUserId, setCurrentAdminUserId] = useState("");

  const listAbortRef = useRef(null);
  const searchDebounceRef = useRef(null);

  const loadUsers = useCallback(
    async ({ page = 1, background = false } = {}) => {
      listAbortRef.current?.abort();
      const controller = new AbortController();
      listAbortRef.current = controller;

      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");

      try {
        const result = await fetchAdminUserList(adminFetch, {
          page,
          search: searchQuery,
          sort,
          order,
          accountStatus: accountStatusFilter,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        setUsers(result.users || []);
        setPagination(
          result.pagination || {
            page: 1,
            pageSize: 20,
            total: 0,
            totalPages: 1,
          }
        );
        setLoaded(true);
      } catch (fetchError) {
        if (fetchError?.name === "AbortError") return;
        setError(fetchError?.message || "تعذر تحميل المستخدمين");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [accountStatusFilter, order, searchQuery, sort]
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
    void loadUsers({ page: pagination.page });
  }, [loadUsers, pagination.page]);

  useEffect(() => {
    return () => {
      listAbortRef.current?.abort();
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

  const openDrawer = (userId) => {
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

  if (!loaded && loading) {
    return <UserManagementSkeleton />;
  }

  return (
    <>
      <section className="space-y-5 scroll-mt-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <h2 className="admin-heading text-3xl">إدارة المستخدمين</h2>
            <p className="mt-2 text-slate-600">
              استعراض المستخدمين وإدارتهم مع تحميل تدريجي وبحث وترقيم صفحات.
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
              onClick={() => void loadUsers({ page: pagination.page, background: true })}
              className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20"
            >
              تحديث التبويب
            </button>
          </div>
        </div>

        <div className="admin-section p-4 md:p-5">
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

          <div className="mt-4 flex flex-wrap gap-2">
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

          <div className="mt-4">
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="بحث بالاسم أو البريد الإلكتروني..."
              className="admin-field font-bold"
            />
          </div>
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
                  <th>المستخدم</th>
                  <th>البريد</th>
                  <th>تاريخ التسجيل</th>
                  <th>آخر دخول</th>
                  <th>الحالة</th>
                  <th>اشتراكات نشطة</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
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
                    <td>{formatDateTime(user.createdAt)}</td>
                    <td>{formatDateTime(user.lastSignInAt)}</td>
                    <td>
                      <AccountStatusBadge status={user.accountStatus} label={user.accountStatusLabel} />
                    </td>
                    <td>{user.activeSubscriptionsCount}</td>
                    <td>
                      <button type="button" className="admin-user-manage-btn" onClick={() => openDrawer(user.id)}>
                        إدارة
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!error && pagination.totalPages > 1 ? (
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

      <AdminUserDrawer
        open={drawerOpen}
        userId={selectedUserId}
        currentAdminUserId={currentAdminUserId}
        onClose={closeDrawer}
        onUserUpdated={() => void loadUsers({ page: pagination.page, background: true })}
      />
    </>
  );
}
