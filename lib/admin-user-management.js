import { resolveAccountStatusFromProfile, getProfileAccountStatus, ACCOUNT_STATUSES } from "./account-lifecycle.js";
import { attachActiveServiceFlagsToUsers, resolveActiveServiceUserKeys, resolveExpiredServiceUserKeys } from "./admin-user-dashboard-stats.js";
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

export const ADMIN_USER_MANAGEMENT_PAGE_SIZE = 20;
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
  return String(value || "").trim();
}

function escapeIlike(value) {
  return value.replace(/[%_,]/g, "");
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
    lastSignInAt: authUser?.last_sign_in_at || null,
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
    search = "",
    sort = "created_at",
    order = "desc",
    accountStatus = "",
    activeService = "",
  } = {}
) {
  const startedAt = Date.now();
  const pageNumber = Math.max(Number(page) || 1, 1);
  const resolvedPageSize = Math.min(Math.max(Number(pageSize) || ADMIN_USER_MANAGEMENT_PAGE_SIZE, 1), 20);
  const from = (pageNumber - 1) * resolvedPageSize;
  const to = from + resolvedPageSize - 1;
  const normalizedSearch = normalizeSearch(search);
  const sortKey = sort === "last_sign_in" ? "last_sign_in" : "created_at";
  const ascending = order === "asc";

  const normalizedAccountStatus = String(accountStatus || "").trim().toLowerCase();
  const hasStatusFilter =
    normalizedAccountStatus && normalizedAccountStatus !== "all" && ACCOUNT_STATUSES.has(normalizedAccountStatus);
  const normalizedActiveService = String(activeService || "").trim().toLowerCase();

  let serviceEmails = null;
  let serviceUserIds = null;

  if (normalizedActiveService) {
    const keys =
      normalizedActiveService === "expired"
        ? await resolveExpiredServiceUserKeys(supabase)
        : await resolveActiveServiceUserKeys(supabase, normalizedActiveService);
    if (normalizedActiveService === "account_management") {
      serviceUserIds = [...keys.userIds];
      if (serviceUserIds.length === 0) {
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
    } else {
      serviceEmails = [...keys.emails];
      if (serviceEmails.length === 0) {
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
    }
  }

  logAdminUserManagement("ADMIN_USER_LIST_STARTED", {
    page: pageNumber,
    sort: sortKey,
    hasSearch: Boolean(normalizedSearch),
    accountStatus: normalizedAccountStatus || "all",
    activeService: normalizedActiveService || null,
  });

  let countQuery = supabase.from("profiles").select("id", { count: "exact", head: true });
  const profileSelectWithLifecycle =
    "id,email,username,role,created_at,account_status,status_reason,status_updated_at,status_updated_by,suspended_at,banned_at,deleted_at";
  const profileSelectBasic = "id,email,username,role,created_at,account_status,suspended_at,banned_at,deleted_at";

  if (normalizedSearch) {
    const escaped = escapeIlike(normalizedSearch);
    const looksLikeUuid = /^[0-9a-f-]{8,}$/i.test(normalizedSearch);
    const textFilter = `email.ilike.%${escaped}%,username.ilike.%${escaped}%,telegram.ilike.%${escaped}%`;
    countQuery = countQuery.or(
      looksLikeUuid ? `id.eq.${normalizedSearch},${textFilter}` : textFilter
    );
  }

  if (hasStatusFilter) {
    countQuery = countQuery.eq("account_status", normalizedAccountStatus);
  }

  if (serviceUserIds) {
    countQuery = countQuery.in("id", serviceUserIds);
  } else if (serviceEmails) {
    countQuery = countQuery.in("email", serviceEmails);
  }

  const buildListQuery = (selectColumns) => {
    let query = supabase.from("profiles").select(selectColumns).range(from, to);

    if (normalizedSearch) {
      const escaped = escapeIlike(normalizedSearch);
      const looksLikeUuid = /^[0-9a-f-]{8,}$/i.test(normalizedSearch);
      const textFilter = `email.ilike.%${escaped}%,username.ilike.%${escaped}%,telegram.ilike.%${escaped}%`;
      query = query.or(looksLikeUuid ? `id.eq.${normalizedSearch},${textFilter}` : textFilter);
    }

    if (hasStatusFilter) {
      query = query.eq("account_status", normalizedAccountStatus);
    }

    if (serviceUserIds) {
      query = query.in("id", serviceUserIds);
    } else if (serviceEmails) {
      query = query.in("email", serviceEmails);
    }

    if (sortKey === "created_at") {
      query = query.order("created_at", { ascending, nullsFirst: false });
    } else {
      query = query.order("created_at", { ascending: false, nullsFirst: false });
    }

    return query;
  };

  let listResult = await buildListQuery(profileSelectWithLifecycle);

  if (listResult.error && /column .* does not exist/i.test(listResult.error.message || "")) {
    listResult = await buildListQuery(profileSelectBasic);
  }

  const [{ count, error: countError }, { data: profiles, error: listError }] = [
    await countQuery,
    listResult,
  ];

  if (countError) throw countError;
  if (listError) throw listError;

  const authUsers = await Promise.all(
    (profiles || []).map((profile) => fetchAuthUserById(supabase, profile.id))
  );

  let rows = (profiles || []).map((profile, index) =>
    formatUserBase(profile, authUsers[index], 0)
  );

  if (sortKey === "last_sign_in") {
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

  logAdminUserManagement("ADMIN_USER_LIST_FINISHED", {
    page: pageNumber,
    returnedRows: rows.length,
    total,
    durationMs: Date.now() - startedAt,
  });

  return {
    success: true,
    users: rows,
    pagination: {
      page: pageNumber,
      pageSize: resolvedPageSize,
      total,
      totalPages: Math.max(Math.ceil(total / resolvedPageSize), 1),
    },
    sort: sortKey,
    order: ascending ? "asc" : "desc",
    durationMs: Date.now() - startedAt,
  };
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
