import {
  ADMIN_SECTION_LOAD_ERROR_MESSAGE,
  sanitizeAdminUserFacingError,
} from "./admin-user-management-shared.js";
import { isSuccessfulAdminActionResponse } from "./admin-user-action-flow.js";

export const ADMIN_USER_MANAGEMENT_TIMEOUT_MS = 12_000;

export async function fetchAdminUserList(
  adminFetch,
  {
    page = 1,
    pageSize = 25,
    listAll = false,
    search = "",
    sort = "created_at",
    order = "desc",
    accountStatus = "",
    activeService = "",
    registeredFrom = "",
    registeredTo = "",
    lastLoginFrom = "",
    lastLoginTo = "",
    plan = "",
    signal,
  } = {}
) {
  const params = new URLSearchParams({
    sort,
    order,
  });

  if (listAll) {
    params.set("listAll", "1");
  } else {
    params.set("page", String(page));
    if (pageSize) {
      params.set("pageSize", String(pageSize));
    }
  }

  const normalizedSearch = String(search || "").trim();
  if (normalizedSearch) {
    params.set("search", normalizedSearch);
  }

  const normalizedStatus = String(accountStatus || "").trim();
  if (normalizedStatus && normalizedStatus !== "all") {
    params.set("accountStatus", normalizedStatus);
  }

  const normalizedActiveService = String(activeService || "").trim();
  if (normalizedActiveService) {
    params.set("activeService", normalizedActiveService);
  }

  const normalizedRegisteredFrom = String(registeredFrom || "").trim();
  if (normalizedRegisteredFrom) {
    params.set("registeredFrom", normalizedRegisteredFrom);
  }

  const normalizedRegisteredTo = String(registeredTo || "").trim();
  if (normalizedRegisteredTo) {
    params.set("registeredTo", normalizedRegisteredTo);
  }

  const normalizedLastLoginFrom = String(lastLoginFrom || "").trim();
  if (normalizedLastLoginFrom) {
    params.set("lastLoginFrom", normalizedLastLoginFrom);
  }

  const normalizedLastLoginTo = String(lastLoginTo || "").trim();
  if (normalizedLastLoginTo) {
    params.set("lastLoginTo", normalizedLastLoginTo);
  }

  const normalizedPlan = String(plan || "").trim();
  if (normalizedPlan) {
    params.set("plan", normalizedPlan);
  }

  const response = await adminFetch(`/api/admin/user-management?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
    signal,
  });

  const result = await response.json().catch(() => ({}));

  if (response.status === 401 || response.status === 403) {
    throw new Error(result?.error || "تعذر التحقق من صلاحية الإدارة");
  }

  if (!response.ok || !result?.success) {
    const sanitized = sanitizeAdminUserFacingError(
      { message: result?.error },
      { fallback: "فشل تحميل قائمة المستخدمين" }
    );
    const error = new Error(sanitized.message);
    error.kind = sanitized.kind;
    throw error;
  }

  return result;
}

export async function fetchAllAdminUserList(
  adminFetch,
  filters = {},
  { signal, pageSize = 100, maxRows = 10000 } = {}
) {
  let page = 1;
  let total = Infinity;
  const users = [];

  while (users.length < total && users.length < maxRows) {
    const result = await fetchAdminUserList(adminFetch, {
      ...filters,
      page,
      pageSize,
      listAll: false,
      signal,
    });

    users.push(...(result.users || []));
    total = Number(result.pagination?.total || users.length);
    const totalPages = Number(result.pagination?.totalPages || 1);

    if (page >= totalPages) break;
    page += 1;
  }

  return {
    users,
    pagination: {
      page: 1,
      pageSize: users.length,
      total,
      totalPages: 1,
    },
    truncated: users.length < total,
  };
}

export async function fetchAdminUserSection(
  adminFetch,
  userId,
  section,
  { page = 1, signal, activityFilter } = {}
) {
  const params = new URLSearchParams({
    section,
    page: String(page),
  });

  if (section === "activity" && activityFilter && activityFilter !== "all") {
    params.set("activityFilter", activityFilter);
  }

  const response = await adminFetch(
    `/api/admin/user-management/${encodeURIComponent(userId)}?${params.toString()}`,
    {
      method: "GET",
      cache: "no-store",
      signal,
    }
  );

  const result = await response.json().catch(() => ({}));

  if (response.status === 401 || response.status === 403) {
    throw new Error(result?.error || "تعذر التحقق من صلاحية الإدارة");
  }

  if (!response.ok || !result?.success) {
    const sanitized = sanitizeAdminUserFacingError(
      { message: result?.error },
      { fallback: ADMIN_SECTION_LOAD_ERROR_MESSAGE }
    );
    const error = new Error(sanitized.message);
    error.kind = sanitized.kind;
    error.detail = sanitized.detail;
    throw error;
  }

  return result;
}

export function isAdminActionResponseSuccess(response, result = {}) {
  return isSuccessfulAdminActionResponse(response, result);
}

export async function postAdminUserAction(
  adminFetch,
  userId,
  {
    action,
    service,
    reason = "",
    durationDays,
    expiresAt,
    subscriptionId,
    confirmEmail = "",
    payload = {},
  } = {}
) {
  const presetDays = { "7d": 7, "1m": 30, "3m": 90, "1y": 365 };
  const resolvedDuration =
    durationDays ?? payload.days ?? presetDays[payload.preset] ?? undefined;

  const response = await adminFetch(
    `/api/admin/user-management/${encodeURIComponent(userId)}/actions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        service: service || payload.serviceKey || payload.service,
        reason: reason || payload.reason || "",
        durationDays: resolvedDuration,
        expiresAt: expiresAt || payload.expiresAt,
        subscriptionId: subscriptionId || payload.subscriptionId,
        confirmEmail,
      }),
      cache: "no-store",
    }
  );

  const result = await response.json().catch(() => ({}));

  if (response.status === 401 || response.status === 403) {
    throw new Error(result?.error || "غير مصرح");
  }

  if (response.status === 503) {
    throw new Error(result?.error || "يتطلب تطبيق Migration المرحلة 3A");
  }

  if (!isAdminActionResponseSuccess(response, result)) {
    const sanitized = sanitizeAdminUserFacingError(
      { message: result?.error || result?.message },
      { fallback: "فشل تنفيذ الإجراء" }
    );
    const error = new Error(sanitized.message);
    error.kind = sanitized.kind;
    throw error;
  }

  return result;
}

export async function createAdminUserNote(adminFetch, userId, note) {
  const response = await adminFetch(
    `/api/admin/user-management/${encodeURIComponent(userId)}/notes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
      cache: "no-store",
    }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.success) {
    const sanitized = sanitizeAdminUserFacingError(
      { message: result?.error },
      { fallback: "تعذر إضافة الملاحظة" }
    );
    const error = new Error(sanitized.message);
    error.kind = sanitized.kind;
    throw error;
  }
  return result;
}

export async function updateAdminUserNote(adminFetch, userId, { noteId, note, isPinned }) {
  const body = { noteId };
  if (typeof note === "string") body.note = note;
  if (typeof isPinned === "boolean") body.isPinned = isPinned;

  const response = await adminFetch(
    `/api/admin/user-management/${encodeURIComponent(userId)}/notes`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.success) {
    const sanitized = sanitizeAdminUserFacingError(
      { message: result?.error },
      { fallback: "تعذر تحديث الملاحظة" }
    );
    const error = new Error(sanitized.message);
    error.kind = sanitized.kind;
    throw error;
  }
  return result;
}

export async function deleteAdminUserNote(adminFetch, userId, noteId) {
  const response = await adminFetch(
    `/api/admin/user-management/${encodeURIComponent(userId)}/notes?noteId=${encodeURIComponent(noteId)}`,
    {
      method: "DELETE",
      cache: "no-store",
    }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.success) {
    const sanitized = sanitizeAdminUserFacingError(
      { message: result?.error },
      { fallback: "تعذر حذف الملاحظة" }
    );
    const error = new Error(sanitized.message);
    error.kind = sanitized.kind;
    throw error;
  }
  return result;
}

export async function fetchAdminUserDashboardStats(adminFetch, { signal } = {}) {
  const response = await adminFetch("/api/admin/user-management/stats", {
    method: "GET",
    cache: "no-store",
    signal,
  });

  const result = await response.json().catch(() => ({}));

  if (response.status === 401 || response.status === 403) {
    throw new Error(result?.error || "تعذر التحقق من صلاحية الإدارة");
  }

  if (!response.ok || !result?.success) {
    const sanitized = sanitizeAdminUserFacingError(
      { message: result?.error },
      { fallback: "فشل تحميل إحصائيات المستخدمين" }
    );
    const error = new Error(sanitized.message);
    error.kind = sanitized.kind;
    throw error;
  }

  return result.stats || {};
}

/** @deprecated Use fetchAdminUserSection(adminFetch, userId, "overview") */
export async function fetchAdminUserDetail(adminFetch, userId, options = {}) {
  return fetchAdminUserSection(adminFetch, userId, "overview", options);
}
