import { resolveAccountStatusFromProfile, getProfileAccountStatus, ACCOUNT_STATUSES } from "./account-lifecycle.js";
import { attachActiveServiceFlagsToUsers, resolveActiveServiceUserKeys, resolveExpiredServiceUserKeys } from "./admin-user-dashboard-stats.js";
import { parseExpiredServerActiveServiceFilter } from "./admin-user-subscription-state.js";
import {
  isActiveAccountManagementRequest,
  isActiveSubscriptionRequest,
  isVipServiceType,
  normalizeAdminUserServiceType,
} from "./admin-user-service-classifier.js";
import { resolveUserServices } from "./user-service-resolver.js";
import {
  loadAdminUserAuditSection,
  loadAdminUserEmailsSection,
  loadAdminUserManagementSection,
  loadAdminUserNotesSection,
  loadAdminUserNotificationsSection,
  loadAdminUserPaymentsSection,
  loadAdminUserSubscriptionsSection,
} from "./admin-user-management-sections.js";
import {
  filterActivityEventsByType,
  getAccountStatusIcon,
  getAccountStatusLabel,
  isMissingDatabaseResourceError,
} from "./admin-user-management-shared.js";

import {
  ADMIN_USER_LIST_ALL_CAP,
  ADMIN_USER_LIST_PROFILE_COLUMNS,
  ADMIN_USER_LIST_PROFILE_COLUMNS_BASIC,
  ADMIN_USER_LIST_SUBSCRIPTION_FLAG_COLUMNS,
  assertAdminUserListRowIsLightweight,
  buildAdminUserListTruncationMeta,
  estimateAdminUserListResponseBytes,
} from "./admin-user-list-response-helpers.js";

export const ADMIN_USER_MANAGEMENT_PAGE_SIZE = 25;
export {
  ADMIN_USER_LIST_ALL_CAP,
  ADMIN_USER_LIST_PROFILE_COLUMNS,
  ADMIN_USER_LIST_PROFILE_COLUMNS_BASIC,
  ADMIN_USER_LIST_SUBSCRIPTION_FLAG_COLUMNS,
  ADMIN_USER_LIST_HEAVY_FIELD_DENYLIST,
  assertAdminUserListRowIsLightweight,
  buildAdminUserListTruncationMeta,
  estimateAdminUserListResponseBytes,
} from "./admin-user-list-response-helpers.js";
export const ADMIN_USER_ACTIVITY_PAGE_SIZE = 20;
export const ADMIN_USER_ACTIVITY_SOURCE_LIMIT = 15;

export const ADMIN_USER_SECTIONS = new Set([
  "overview",
  "services",
  "subscriptions",
  "payments",
  "notifications",
  "emails",
  "activity",
  "notes",
  "audit",
  "management",
]);

export const SYSTEM_SERVICES = [
  { key: "vip", label: "توصيات VIP", icon: "⭐" },
  { key: "account_management", label: "إدارة الحسابات", icon: "📂" },
  { key: "alerts", label: "التنبيهات", icon: "🔔" },
  { key: "academy", label: "الأكاديمية", icon: "🎓" },
];

const ACTIVE_SUBSCRIPTION_STATUSES = ["مفعل", "نشط", "active"];

const ACTIVITY_META = {
  account_created: { icon: "👤", label: "إنشاء الحساب" },
  sign_in: { icon: "🔐", label: "تسجيل دخول" },
  analysis_request: { icon: "🧠", label: "طلب تحليل" },
  account_management_request: { icon: "📂", label: "طلب إدارة حساب" },
  subscription_request: { icon: "💳", label: "طلب اشتراك" },
  price_alert: { icon: "🔔", label: "تنبيه سعر" },
  notification: { icon: "📣", label: "إشعار" },
  admin_action: { icon: "🛡️", label: "إجراء إداري" },
};

const ADMIN_ACTION_LABELS = {
  suspend_user: "تم تعليق الحساب",
  unsuspend_user: "تم رفع التعليق",
  ban_user: "تم حظر الحساب",
  unban_user: "تم إلغاء الحظر",
  soft_delete_user: "تم حذف الحساب منطقيًا",
  restore_user: "تمت استعادة الحساب",
  force_logout: "تم تسجيل الخروج من جميع الأجهزة",
  password_reset_requested: "تم طلب إعادة تعيين كلمة المرور",
  activate_service: "تم تفعيل خدمة",
  deactivate_service: "تم إيقاف خدمة",
  extend_subscription: "تم تمديد الاشتراك",
};

function logAdminUserManagement(event, payload = {}) {
  console.info(event, payload);
}

function normalizeSearch(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^[0-9a-f-]{8,}$/i.test(trimmed)) return trimmed;
  return trimmed.length >= 2 ? trimmed : "";
}

function escapeIlike(value) {
  return value.replace(/[%_,]/g, "");
}

function intersectEmailSets(current, next) {
  if (!next || next.size === 0) return new Set();
  if (!current) return new Set(next);
  const intersection = new Set();
  for (const email of current) {
    if (next.has(email)) intersection.add(email);
  }
  return intersection;
}

const ADMIN_USER_FILTER_SCAN_PAGE_SIZE = 1000;

async function fetchPaginatedRows(supabase, table, select, applyFilters) {
  const rows = [];
  let page = 0;

  while (true) {
    const from = page * ADMIN_USER_FILTER_SCAN_PAGE_SIZE;
    const to = from + ADMIN_USER_FILTER_SCAN_PAGE_SIZE - 1;
    let query = supabase.from(table).select(select).range(from, to);
    query = applyFilters(query);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < ADMIN_USER_FILTER_SCAN_PAGE_SIZE) break;
    page += 1;
  }

  return rows;
}

async function resolvePlanFilterEmails(supabase, planTerm) {
  const term = String(planTerm || "").trim();
  if (!term) return null;

  const escaped = escapeIlike(term);
  const emails = new Set();

  const subscriptionRows = await fetchPaginatedRows(
    supabase,
    "subscription_requests",
    "user_email,plan_name",
    (query) => query.ilike("plan_name", `%${escaped}%`)
  );

  for (const row of subscriptionRows) {
    const email = normalizeEmail(row.user_email);
    if (email) emails.add(email);
  }

  const profileRows = await fetchPaginatedRows(
    supabase,
    "profiles",
    "email,subscription_plan",
    (query) => query.ilike("subscription_plan", `%${escaped}%`)
  );

  for (const row of profileRows) {
    const email = normalizeEmail(row.email);
    if (email) emails.add(email);
  }

  return emails;
}

function buildEmptyAdminUserListResponse({
  pageNumber,
  resolvedPageSize,
  sortKey,
  ascending,
  startedAt,
}) {
  return {
    success: true,
    users: [],
    pagination: {
      page: pageNumber,
      pageSize: resolvedPageSize,
      total: 0,
      totalPages: 1,
    },
    sort: sortKey,
    order: ascending ? "asc" : "desc",
    durationMs: Date.now() - startedAt,
  };
}

function applySharedProfileFilters(query, {
  normalizedSearch,
  hasStatusFilter,
  normalizedAccountStatus,
  serviceUserIds,
  emailFilter,
  registeredFromIso,
  registeredToIso,
  lastLoginFromIso,
  lastLoginToIso,
}) {
  if (normalizedSearch) {
    const escaped = escapeIlike(normalizedSearch);
    const looksLikeUuid = /^[0-9a-f-]{8,}$/i.test(normalizedSearch);
    const textFilter = `email.ilike.%${escaped}%,username.ilike.%${escaped}%,telegram.ilike.%${escaped}%`;
    query = query.or(looksLikeUuid ? `id.eq.${normalizedSearch},${textFilter}` : textFilter);
  }

  if (hasStatusFilter) {
    query = query.eq("account_status", normalizedAccountStatus);
  }

  if (serviceUserIds?.length) {
    query = query.in("id", serviceUserIds);
  }

  if (emailFilter?.length) {
    query = query.in("email", emailFilter);
  }

  if (registeredFromIso) {
    query = query.gte("created_at", registeredFromIso);
  }

  if (registeredToIso) {
    query = query.lte("created_at", registeredToIso);
  }

  if (lastLoginFromIso) {
    query = query.gte("last_sign_in_at", lastLoginFromIso);
  }

  if (lastLoginToIso) {
    query = query.lte("last_sign_in_at", lastLoginToIso);
  }

  return query;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isActiveSubscription(row) {
  return isActiveSubscriptionRequest(row);
}

function isVipSubscription(row) {
  const serviceType = normalizeAdminUserServiceType(row, { sourceTable: "subscription_requests" });
  return isVipServiceType(serviceType);
}

function isAcademySubscription(row) {
  return normalizeAdminUserServiceType(row, { sourceTable: "subscription_requests" }) === "academy";
}

export { getAccountStatusLabel, getAccountStatusIcon, resolveAccountStatus } from "./admin-user-management-shared.js";

function resolveAvatarUrl(authUser) {
  const metadata = authUser?.user_metadata || {};
  return metadata.avatar_url || metadata.picture || metadata.photo_url || "";
}

async function fetchAuthUserById(supabase, userId) {
  if (!userId) return null;

  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error) {
      logAdminUserManagement("ADMIN_USER_AUTH_LOOKUP_FAILED", {
        userId,
        message: error.message,
      });
      return null;
    }
    return data?.user || null;
  } catch (error) {
    logAdminUserManagement("ADMIN_USER_AUTH_LOOKUP_FAILED", {
      userId,
      message: error?.message || "unknown",
    });
    return null;
  }
}

async function fetchUserContext(supabase, userId) {
  const normalizedUserId = String(userId || "").trim();

  const profileSelect =
    "id,email,username,telegram,role,subscription_plan,subscription_status,created_at,account_status,status_reason,status_updated_at,status_updated_by,suspended_at,banned_at,deleted_at,account_status_reason,account_status_changed_at,account_status_changed_by";

  let profileResult = await supabase
    .from("profiles")
    .select(profileSelect)
    .eq("id", normalizedUserId)
    .maybeSingle();

  if (profileResult.error && /column .* does not exist/i.test(profileResult.error.message || "")) {
    profileResult = await supabase
      .from("profiles")
      .select("id,email,username,telegram,role,subscription_plan,subscription_status,created_at")
      .eq("id", normalizedUserId)
      .maybeSingle();
  }

  const profile = profileResult.data;
  const profileError = profileResult.error;
  const authUser = await fetchAuthUserById(supabase, normalizedUserId);

  if (profileError) throw profileError;

  if (!profile && !authUser) {
    const error = new Error("المستخدم غير موجود");
    error.status = 404;
    throw error;
  }

  const email = normalizeEmail(profile?.email || authUser?.email || "");

  return { profile, authUser, email, normalizedUserId };
}

async function countActiveSubscriptionsByEmail(supabase, emails) {
  const normalizedEmails = [...new Set(emails.map(normalizeEmail).filter(Boolean))];
  if (normalizedEmails.length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from("subscription_requests")
    .select("user_email,status,expires_at")
    .in("user_email", normalizedEmails)
    .in("status", ACTIVE_SUBSCRIPTION_STATUSES);

  if (error) throw error;

  const counts = {};
  for (const row of data || []) {
    if (!isActiveSubscription(row)) continue;
    const email = normalizeEmail(row.user_email);
    counts[email] = (counts[email] || 0) + 1;
  }

  return counts;
}

function formatUserBase(profile, authUser, activeSubscriptionsCount = 0) {
  const accountStatus = profile?.account_status
    ? getProfileAccountStatus(profile)
    : resolveAccountStatusFromProfile(profile, authUser);

  return {
    id: profile?.id || authUser?.id,
    uid: profile?.id || authUser?.id,
    email: profile?.email || authUser?.email || "",
    username: profile?.username || authUser?.user_metadata?.username || "",
    avatarUrl: resolveAvatarUrl(authUser),
    createdAt: profile?.created_at || authUser?.created_at || null,
    lastSignInAt: profile?.last_sign_in_at || authUser?.last_sign_in_at || null,
    accountStatus,
    accountStatusLabel: getAccountStatusLabel(accountStatus),
    accountStatusIcon: getAccountStatusIcon(accountStatus),
    statusReason: profile?.status_reason || profile?.account_status_reason || null,
    statusUpdatedAt: profile?.status_updated_at || profile?.account_status_changed_at || null,
    statusUpdatedBy: profile?.status_updated_by || profile?.account_status_changed_by || null,
    activeSubscriptionsCount,
    role: profile?.role || "user",
    telegram: profile?.telegram || authUser?.user_metadata?.telegram || "",
    subscriptionPlan: profile?.subscription_plan || "",
    subscriptionStatus: profile?.subscription_status || "",
  };
}

async function countRowsForUser(supabase, table, { email, userId, emailColumn = "user_email" }) {
  let query = supabase.from(table).select("id", { count: "exact", head: true });

  if (table === "account_management_requests" && userId) {
    query = query.eq("user_id", userId);
  } else if (email) {
    query = query.eq(emailColumn, email);
  } else {
    return 0;
  }

  const { count, error } = await query;
  if (error) throw error;
  return Number(count || 0);
}

function buildActivityEvent(type, occurredAt, meta = {}) {
  const config = ACTIVITY_META[type] || { icon: "📌", label: "نشاط" };
  const date = occurredAt ? new Date(occurredAt) : null;

  return {
    id: `${type}:${meta.id || occurredAt || Math.random()}`,
    type,
    icon: config.icon,
    label: config.label,
    title: meta.title || config.label,
    occurredAt: occurredAt || null,
    dateLabel: date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("ar") : "—",
    timeLabel: date && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString("ar") : "—",
    meta,
  };
}

function buildServiceRecord(serviceDef, { isActive, status, startedAt, endsAt, source }) {
  return {
    key: serviceDef.key,
    serviceKey: serviceDef.key,
    serviceLabel: serviceDef.label,
    icon: serviceDef.icon,
    isActive: Boolean(isActive),
    status: status || (isActive ? "نشط" : "غير مفعل"),
    statusIcon: isActive ? "✅" : "❌",
    startedAt: startedAt || null,
    endsAt: endsAt || null,
    source: source || null,
  };
}

function pickLatest(rows, predicate) {
  const filtered = (rows || []).filter(predicate);
  if (!filtered.length) return null;
  return filtered.sort(
    (left, right) =>
      new Date(right.created_at || right.started_at || 0).getTime() -
      new Date(left.created_at || left.started_at || 0).getTime()
  )[0];
}

export async function loadAdminUserList(
  supabase,
  {
    page = 1,
    pageSize = ADMIN_USER_MANAGEMENT_PAGE_SIZE,
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
  } = {}
) {
  const startedAt = Date.now();
  const pageNumber = Math.max(Number(page) || 1, 1);
  const resolvedListAll = listAll === true || Number(pageSize) === 0;
  const resolvedPageSize = resolvedListAll
    ? ADMIN_USER_LIST_ALL_CAP
    : Math.min(Math.max(Number(pageSize) || ADMIN_USER_MANAGEMENT_PAGE_SIZE, 1), 100);
  const from = resolvedListAll ? 0 : (pageNumber - 1) * resolvedPageSize;
  const to = resolvedListAll ? resolvedPageSize - 1 : from + resolvedPageSize - 1;
  const normalizedSearch = normalizeSearch(search);
  const sortKey = sort === "last_sign_in" ? "last_sign_in" : "created_at";
  const ascending = order === "asc";

  const normalizedAccountStatus = String(accountStatus || "").trim().toLowerCase();
  const hasStatusFilter =
    normalizedAccountStatus && normalizedAccountStatus !== "all" && ACCOUNT_STATUSES.has(normalizedAccountStatus);
  const normalizedActiveService = String(activeService || "").trim().toLowerCase();
  const registeredFromIso = String(registeredFrom || "").trim();
  const registeredToIso = String(registeredTo || "").trim();
  const lastLoginFromIso = String(lastLoginFrom || "").trim();
  const lastLoginToIso = String(lastLoginTo || "").trim();
  const normalizedPlan = String(plan || "").trim();

  let serviceEmails = null;
  let serviceUserIds = null;

  if (normalizedActiveService) {
    const expiredFilter = parseExpiredServerActiveServiceFilter(normalizedActiveService);
    const keys = expiredFilter.expired
      ? await resolveExpiredServiceUserKeys(supabase, expiredFilter.serviceFilter)
      : await resolveActiveServiceUserKeys(supabase, normalizedActiveService);

    const usesUserIds =
      expiredFilter.expired && expiredFilter.serviceFilter === "account_management"
        ? true
        : !expiredFilter.expired && normalizedActiveService === "account_management";

    if (usesUserIds) {
      serviceUserIds = [...keys.userIds];
      if (serviceUserIds.length === 0) {
        return buildEmptyAdminUserListResponse({
          pageNumber,
          resolvedPageSize,
          sortKey,
          ascending,
          startedAt,
        });
      }
    } else {
      serviceEmails = keys.emails;
      if (serviceEmails.size === 0) {
        return buildEmptyAdminUserListResponse({
          pageNumber,
          resolvedPageSize,
          sortKey,
          ascending,
          startedAt,
        });
      }
    }
  }

  let emailFilter = serviceEmails ? [...serviceEmails] : null;

  if (normalizedPlan) {
    const planEmails = await resolvePlanFilterEmails(supabase, normalizedPlan);
    if (!planEmails || planEmails.size === 0) {
      return buildEmptyAdminUserListResponse({
        pageNumber,
        resolvedPageSize,
        sortKey,
        ascending,
        startedAt,
      });
    }
    const intersected = intersectEmailSets(serviceEmails, planEmails);
    if (intersected.size === 0) {
      return buildEmptyAdminUserListResponse({
        pageNumber,
        resolvedPageSize,
        sortKey,
        ascending,
        startedAt,
      });
    }
    emailFilter = [...intersected];
  }

  logAdminUserManagement("ADMIN_USER_LIST_STARTED", {
    page: pageNumber,
    sort: sortKey,
    hasSearch: Boolean(normalizedSearch),
    accountStatus: normalizedAccountStatus || "all",
    activeService: normalizedActiveService || null,
    hasPlanFilter: Boolean(normalizedPlan),
    hasLastLoginFilter: Boolean(lastLoginFromIso || lastLoginToIso),
  });

  const sharedFilters = {
    normalizedSearch,
    hasStatusFilter,
    normalizedAccountStatus,
    serviceUserIds,
    emailFilter,
    registeredFromIso,
    registeredToIso,
    lastLoginFromIso,
    lastLoginToIso,
  };

  let countQuery = supabase.from("profiles").select("id", { count: "exact", head: true });
  countQuery = applySharedProfileFilters(countQuery, sharedFilters);

  const profileSelectWithLifecycle = ADMIN_USER_LIST_PROFILE_COLUMNS;
  const profileSelectBasic = ADMIN_USER_LIST_PROFILE_COLUMNS_BASIC;

  const buildListQuery = (selectColumns, includeLastLoginSort) => {
    let query = supabase.from("profiles").select(selectColumns).range(from, to);
    query = applySharedProfileFilters(query, sharedFilters);

    if (sortKey === "last_sign_in" && includeLastLoginSort) {
      query = query.order("last_sign_in_at", { ascending, nullsFirst: false });
    } else if (sortKey === "created_at") {
      query = query.order("created_at", { ascending, nullsFirst: false });
    } else {
      query = query.order("created_at", { ascending: false, nullsFirst: false });
    }

    return query;
  };

  let includeLastLoginSort = Boolean(lastLoginFromIso || lastLoginToIso || sortKey === "last_sign_in");
  let listResult = await buildListQuery(profileSelectWithLifecycle, includeLastLoginSort);

  if (listResult.error && /column .* does not exist/i.test(listResult.error.message || "")) {
    includeLastLoginSort = false;
    listResult = await buildListQuery(profileSelectBasic, false);
    if (listResult.error && /column .* does not exist/i.test(listResult.error.message || "")) {
      listResult = await buildListQuery(profileSelectBasic, false);
    }
  }

  let countResult = await countQuery;
  if (countResult.error && /column .* does not exist/i.test(countResult.error.message || "")) {
    const fallbackFilters = { ...sharedFilters, lastLoginFromIso: "", lastLoginToIso: "" };
    countQuery = supabase.from("profiles").select("id", { count: "exact", head: true });
    countQuery = applySharedProfileFilters(countQuery, fallbackFilters);
    countResult = await countQuery;
    if (listResult.error && /last_sign_in_at/i.test(listResult.error.message || "")) {
      listResult = await buildListQuery(profileSelectBasic, false);
    }
  }

  const { count, error: countError } = countResult;
  const { data: profiles, error: listError } = listResult;

  if (countError) throw countError;
  if (listError) throw listError;

  let rows = (profiles || []).map((profile) => formatUserBase(profile, null, 0));

  if (sortKey === "last_sign_in" && !includeLastLoginSort) {
    rows.sort((left, right) => {
      const leftTime = left.lastSignInAt ? new Date(left.lastSignInAt).getTime() : 0;
      const rightTime = right.lastSignInAt ? new Date(right.lastSignInAt).getTime() : 0;
      return ascending ? leftTime - rightTime : rightTime - leftTime;
    });
  }

  const subscriptionCounts = await countActiveSubscriptionsByEmail(
    supabase,
    rows.map((row) => row.email)
  );

  rows = rows.map((row) => ({
    ...row,
    activeSubscriptionsCount: subscriptionCounts[normalizeEmail(row.email)] || 0,
  }));

  rows = await attachActiveServiceFlagsToUsers(supabase, rows);

  const total = Number(count || 0);
  const truncation = buildAdminUserListTruncationMeta({
    total,
    returned: rows.length,
    cap: ADMIN_USER_LIST_ALL_CAP,
    listAll: resolvedListAll,
  });

  const responsePayload = {
    success: true,
    users: rows,
    listAll: resolvedListAll,
    pagination: {
      page: resolvedListAll ? 1 : pageNumber,
      pageSize: resolvedListAll ? rows.length : resolvedPageSize,
      total,
      totalPages: resolvedListAll ? 1 : Math.max(Math.ceil(total / resolvedPageSize), 1),
    },
    truncation,
    sort: sortKey,
    order: ascending ? "asc" : "desc",
    durationMs: Date.now() - startedAt,
    responseBytes: estimateAdminUserListResponseBytes({
      users: rows,
      pagination: { total, pageSize: rows.length },
      truncation,
    }),
    listQueryFields: {
      profiles: profileSelectWithLifecycle,
      subscriptionFlags: ADMIN_USER_LIST_SUBSCRIPTION_FLAG_COLUMNS,
      accountFlags: "user_id,status",
      alertFlags: "user_email,status",
      lastSignInSource: includeLastLoginSort ? "profiles.last_sign_in_at" : "unavailable",
    },
    capabilities: {
      lastSignInFilterAvailable: includeLastLoginSort,
    },
  };

  logAdminUserManagement("ADMIN_USER_LIST_FINISHED", {
    page: pageNumber,
    returnedRows: rows.length,
    total,
    truncated: truncation.truncated,
    durationMs: Date.now() - startedAt,
    responseBytes: responsePayload.responseBytes,
  });

  return responsePayload;
}

async function fetchServiceSourceData(supabase, { email, normalizedUserId }) {
  const [subscriptionsResult, accountManagementResult, alertsResult] = await Promise.all([
    email
      ? supabase
          .from("subscription_requests")
          .select("id,plan_name,category,status,started_at,expires_at,created_at")
          .eq("user_email", email)
          .order("created_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("account_management_requests")
      .select("id,status,created_at")
      .eq("user_id", normalizedUserId)
      .order("created_at", { ascending: false })
      .limit(20),
    email
      ? supabase
          .from("price_alerts")
          .select("id,status,created_at,triggered_at")
          .eq("user_email", email)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (subscriptionsResult.error) throw subscriptionsResult.error;
  if (accountManagementResult.error) throw accountManagementResult.error;
  if (alertsResult.error) throw alertsResult.error;

  return {
    subscriptions: subscriptionsResult.data || [],
    accountRows: accountManagementResult.data || [],
    alerts: alertsResult.data || [],
  };
}

function buildServicesCatalog({ subscriptions, accountRows, alerts }) {
  const vipRow = pickLatest(subscriptions, (row) => isVipSubscription(row) && isActiveSubscription(row));
  const academyRow = pickLatest(subscriptions, (row) => isAcademySubscription(row) && isActiveSubscription(row));
  const accountRow = pickLatest(accountRows, (row) => isActiveAccountManagementRequest(row));
  const activeAlerts = alerts.filter((row) => String(row.status || "").toLowerCase() === "active");
  const latestAlert = alerts[0] || null;

  const catalog = SYSTEM_SERVICES.map((serviceDef) => {
    if (serviceDef.key === "vip") {
      return buildServiceRecord(serviceDef, {
        isActive: Boolean(vipRow),
        status: vipRow?.status || "غير مفعل",
        startedAt: vipRow?.started_at || vipRow?.created_at || null,
        endsAt: vipRow?.expires_at || null,
        source: "subscription_requests",
      });
    }

    if (serviceDef.key === "academy") {
      return buildServiceRecord(serviceDef, {
        isActive: Boolean(academyRow),
        status: academyRow?.status || "غير مفعل",
        startedAt: academyRow?.started_at || academyRow?.created_at || null,
        endsAt: academyRow?.expires_at || null,
        source: "subscription_requests",
      });
    }

    if (serviceDef.key === "account_management") {
      return buildServiceRecord(serviceDef, {
        isActive: Boolean(accountRow),
        status: accountRow?.status || "غير مفعل",
        startedAt: accountRow?.created_at || null,
        endsAt: null,
        source: "account_management_requests",
      });
    }

    return buildServiceRecord(serviceDef, {
      isActive: activeAlerts.length > 0,
      status: activeAlerts.length > 0 ? "نشط" : alerts.length ? "غير نشط" : "غير مفعل",
      startedAt: latestAlert?.created_at || null,
      endsAt: null,
      source: "price_alerts",
    });
  });

  return {
    services: catalog,
    activeServicesCount: catalog.filter((item) => item.isActive).length,
  };
}

export async function loadAdminUserOverview(supabase, userId) {
  const startedAt = Date.now();
  const { profile, authUser, email, normalizedUserId } = await fetchUserContext(supabase, userId);

  const [
    subscriptionCounts,
    analysisCount,
    accountCount,
    subscriptionCount,
    alertsCount,
    notificationsCount,
    emailsCount,
  ] = await Promise.all([
    countActiveSubscriptionsByEmail(supabase, email ? [email] : []),
    countRowsForUser(supabase, "analysis_requests", { email }),
    countRowsForUser(supabase, "account_management_requests", { userId: normalizedUserId }),
    countRowsForUser(supabase, "subscription_requests", { email }),
    countRowsForUser(supabase, "price_alerts", { email }),
    countRowsForUser(supabase, "notifications", { email }),
    countRowsForUser(supabase, "email_messages", { email, emailColumn: "recipient_email" }),
  ]);

  const user = formatUserBase(
    profile || { id: normalizedUserId, email, username: authUser?.user_metadata?.username || "" },
    authUser,
    subscriptionCounts[email] || 0
  );

  const requestsCount = analysisCount + accountCount + subscriptionCount;

  let activeServicesCount = 0;
  try {
    const resolved = await resolveUserServices(supabase, normalizedUserId);
    activeServicesCount = [
      resolved.vip,
      resolved.academy,
      resolved.accountManagement,
      resolved.priceAlerts,
    ].filter((item) => item?.active).length;
  } catch (error) {
    logAdminUserManagement("ADMIN_USER_OVERVIEW_SERVICES_COUNT_FAILED", {
      userId: normalizedUserId,
      message: error?.message || "unknown",
    });
  }

  const stats = {
    activeServicesCount,
    activeSubscriptionsCount: user.activeSubscriptionsCount,
    requestsCount,
    alertsCount,
    analysisCount,
    accountCount,
    subscriptionCount,
    notificationsCount,
    emailsCount,
  };

  logAdminUserManagement("ADMIN_USER_OVERVIEW_FINISHED", {
    userId: normalizedUserId,
    durationMs: Date.now() - startedAt,
  });

  return {
    success: true,
    section: "overview",
    user,
    stats,
    durationMs: Date.now() - startedAt,
  };
}

export async function loadAdminUserServices(supabase, userId) {
  const startedAt = Date.now();
  const { normalizedUserId } = await fetchUserContext(supabase, userId);
  const resolved = await resolveUserServices(supabase, normalizedUserId);

  const serviceDefs = [
    { key: "vip", apiKey: "vip", label: "توصيات VIP", icon: "⭐", data: resolved.vip },
    { key: "academy", apiKey: "academy", label: "الأكاديمية", icon: "🎓", data: resolved.academy },
    {
      key: "account_management",
      apiKey: "account_management",
      label: "إدارة الحسابات",
      icon: "📂",
      data: resolved.accountManagement,
    },
    {
      key: "alerts",
      apiKey: "price_alerts",
      label: "التنبيهات",
      icon: "🔔",
      data: resolved.priceAlerts,
    },
  ];

  const services = serviceDefs.map((def) => ({
    key: def.key,
    serviceKey: def.apiKey,
    serviceLabel: def.label,
    icon: def.icon,
    isActive: Boolean(def.data?.active),
    status: def.data?.active ? "نشط" : "غير مفعل",
    statusIcon: def.data?.active ? "✅" : "❌",
    startedAt: def.data?.startedAt || null,
    endsAt: def.data?.expiresAt || null,
    source: def.data?.source || null,
    manageable: def.data?.manageable !== false,
    recordId: def.data?.recordId || null,
    unmanageableReason: def.data?.manageable === false ? "غير مهيأة للإدارة بعد" : null,
  }));

  const activeServicesCount = services.filter((item) => item.isActive).length;

  logAdminUserManagement("ADMIN_USER_SERVICES_FINISHED", {
    userId: normalizedUserId,
    activeServicesCount,
    durationMs: Date.now() - startedAt,
  });

  return {
    success: true,
    section: "services",
    services,
    stats: {
      activeServicesCount,
      totalServices: services.length,
    },
    durationMs: Date.now() - startedAt,
  };
}

export async function loadAdminUserActivity(supabase, userId, { page = 1, activityFilter = "all" } = {}) {
  const startedAt = Date.now();
  const pageNumber = Math.max(Number(page) || 1, 1);
  const pageSize = ADMIN_USER_ACTIVITY_PAGE_SIZE;
  const sourceLimit = ADMIN_USER_ACTIVITY_SOURCE_LIMIT;

  const { profile, authUser, email, normalizedUserId } = await fetchUserContext(supabase, userId);

  const [
    analysisResult,
    accountResult,
    subscriptionResult,
    alertsResult,
    notificationsResult,
    emailsResult,
    adminLogsResult,
  ] = await Promise.all([
    email
      ? supabase
          .from("analysis_requests")
          .select("id,coin,status,created_at")
          .eq("user_email", email)
          .order("created_at", { ascending: false })
          .limit(sourceLimit)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("account_management_requests")
      .select("id,platform,status,created_at")
      .eq("user_id", normalizedUserId)
      .order("created_at", { ascending: false })
      .limit(sourceLimit),
    email
      ? supabase
          .from("subscription_requests")
          .select("id,plan_name,status,created_at")
          .eq("user_email", email)
          .order("created_at", { ascending: false })
          .limit(sourceLimit)
      : Promise.resolve({ data: [], error: null }),
    email
      ? supabase
          .from("price_alerts")
          .select("id,status,created_at,triggered_at")
          .eq("user_email", email)
          .order("created_at", { ascending: false })
          .limit(sourceLimit)
      : Promise.resolve({ data: [], error: null }),
    email
      ? supabase
          .from("notifications")
          .select("id,title,type,created_at")
          .eq("user_email", email)
          .order("created_at", { ascending: false })
          .limit(sourceLimit)
      : Promise.resolve({ data: [], error: null }),
    email
      ? supabase
          .from("email_messages")
          .select("id,subject,message_type,status,sent_at,created_at")
          .eq("recipient_email", email)
          .order("created_at", { ascending: false })
          .limit(sourceLimit)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("admin_logs")
      .select("id,action,admin_email,details,created_at")
      .or(`target_id.eq.${normalizedUserId},details->>target_user_id.eq.${normalizedUserId}`)
      .order("created_at", { ascending: false })
      .limit(sourceLimit),
  ]);

  for (const result of [
    analysisResult,
    accountResult,
    subscriptionResult,
    alertsResult,
    notificationsResult,
    emailsResult,
    adminLogsResult,
  ]) {
    if (result.error && !isMissingDatabaseResourceError(result.error)) {
      throw result.error;
    }
  }

  const events = [];

  const createdAt = profile?.created_at || authUser?.created_at;
  if (createdAt) {
    events.push(buildActivityEvent("account_created", createdAt, { id: normalizedUserId }));
  }

  if (authUser?.last_sign_in_at) {
    events.push(
      buildActivityEvent("sign_in", authUser.last_sign_in_at, { id: `${normalizedUserId}:sign-in` })
    );
  }

  for (const row of analysisResult.data || []) {
    events.push(
      buildActivityEvent("analysis_request", row.created_at, {
        id: row.id,
        title: `طلب تحليل ${row.coin || ""}`.trim(),
        status: row.status,
      })
    );
  }

  for (const row of accountResult.data || []) {
    events.push(
      buildActivityEvent("account_management_request", row.created_at, {
        id: row.id,
        title: `طلب إدارة حساب ${row.platform || ""}`.trim(),
        status: row.status,
      })
    );
  }

  for (const row of subscriptionResult.data || []) {
    events.push(
      buildActivityEvent("subscription_request", row.created_at, {
        id: row.id,
        title: `طلب اشتراك ${row.plan_name || ""}`.trim(),
        status: row.status,
      })
    );
  }

  for (const row of alertsResult.data || []) {
    events.push(
      buildActivityEvent("price_alert", row.created_at, {
        id: row.id,
        title: "إنشاء تنبيه سعر",
        status: row.status,
        triggeredAt: row.triggered_at,
      })
    );
  }

  for (const row of notificationsResult.data || []) {
    events.push(
      buildActivityEvent("notification", row.created_at, {
        id: row.id,
        title: row.title || "إشعار للمستخدم",
        status: row.type,
      })
    );
  }

  for (const row of adminLogsResult.data || []) {
    const action = String(row.action || "").trim();
    const summary = ADMIN_ACTION_LABELS[action] || action;
    const details = row.details || {};
    const serviceLabel = details.service ? ` (${details.service})` : "";
    const reasonText = details.reason ? ` — ${details.reason}` : "";
    events.push(
      buildActivityEvent("admin_action", row.created_at, {
        id: row.id,
        title: `${summary}${serviceLabel}${reasonText}`.trim(),
        adminEmail: row.admin_email || "مدير",
        action,
      })
    );
  }

  for (const row of emailsResult.data || []) {
    events.push(
      buildActivityEvent("email_sent", row.sent_at || row.created_at, {
        id: row.id,
        title: row.subject || "رسالة بريد",
        status: row.status,
        messageType: row.message_type,
      })
    );
  }

  events.sort(
    (left, right) =>
      new Date(right.occurredAt || 0).getTime() - new Date(left.occurredAt || 0).getTime()
  );

  const filteredEvents = filterActivityEventsByType(events, activityFilter);
  const total = filteredEvents.length;
  const from = (pageNumber - 1) * pageSize;
  const paginatedEvents = filteredEvents.slice(from, from + pageSize);

  logAdminUserManagement("ADMIN_USER_ACTIVITY_FINISHED", {
    userId: normalizedUserId,
    total,
    returnedRows: paginatedEvents.length,
    durationMs: Date.now() - startedAt,
  });

  return {
    success: true,
    section: "activity",
    events: paginatedEvents,
    pagination: {
      page: pageNumber,
      pageSize,
      total,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    },
    durationMs: Date.now() - startedAt,
  };
}

export async function loadAdminUserSection(supabase, userId, section, options = {}) {
  if (section === "services") {
    return loadAdminUserServices(supabase, userId);
  }

  if (section === "activity") {
    return loadAdminUserActivity(supabase, userId, options);
  }

  if (section === "subscriptions") {
    return loadAdminUserSubscriptionsSection(supabase, userId, options);
  }

  if (section === "payments") {
    return loadAdminUserPaymentsSection(supabase, userId, options);
  }

  if (section === "notifications") {
    return loadAdminUserNotificationsSection(supabase, userId, options);
  }

  if (section === "emails") {
    return loadAdminUserEmailsSection(supabase, userId, options);
  }

  if (section === "notes") {
    return loadAdminUserNotesSection(supabase, userId, options);
  }

  if (section === "audit") {
    return loadAdminUserAuditSection(supabase, userId, options);
  }

  if (section === "management") {
    return loadAdminUserManagementSection(supabase, userId);
  }

  return loadAdminUserOverview(supabase, userId);
}

/** @deprecated Use loadAdminUserSection(supabase, userId, "overview") */
export async function loadAdminUserDetail(supabase, userId) {
  return loadAdminUserOverview(supabase, userId);
}
