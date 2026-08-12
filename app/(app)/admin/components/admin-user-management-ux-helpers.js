import { fetchAdminUserList, fetchAdminUserDashboardStats } from "../../../../lib/admin-user-management-client.js";
import {
  buildAdminUserListRequestParams,
  resolveServerActiveServiceFilter,
} from "../../../../lib/admin-user-list-request.js";
import {
  getRegistrationCohortRange,
  resolveRegistrationDateBounds,
} from "../../../../lib/admin-user-registration-cohorts.js";
import {
  countDistinctUsersWithExpiredSubscriptions,
  EXPIRED_SUBSCRIPTION_FILTER,
  isExpiredSubscriptionFilterActive,
  resolveEffectiveAccountStatusFilter,
  resolveExpiredServerActiveServiceFilter,
  resolveExpiredSubscriptionBadge,
  resolveUserSubscriptionStateLabel,
  userHasExpiredSubscription,
  userMatchesExpiredAndServiceFilter,
} from "../../../../lib/admin-user-subscription-state.js";
import {
  isActiveAccountManagementRequest,
  isActivePriceAlertRow,
  isActiveSubscriptionRequest,
  isExpiredSubscriptionRequest,
  isVipServiceType,
  matchesAdminServiceFilter,
  normalizeAdminUserServiceType,
} from "../../../../lib/admin-user-service-classifier.js";
import { getUserClassificationLabel } from "../../../../lib/user-classification.js";

export const DASHBOARD_SCAN_MAX_PAGES = 10;

export const TIMELINE_FILTER_OPTIONS = [
  { id: "all", label: "الكل" },
  { id: "admin", label: "إدارة" },
  { id: "subscription", label: "اشتراك" },
  { id: "alert", label: "تنبيه" },
  { id: "email", label: "بريد" },
  { id: "analysis", label: "تحليل" },
  { id: "sign_in", label: "دخول" },
];

const TIMELINE_FILTER_TYPES = {
  admin: new Set(["admin_action", "account_management_request"]),
  subscription: new Set(["subscription_request"]),
  alert: new Set(["price_alert", "notification"]),
  email: new Set(["email_sent"]),
  analysis: new Set(["analysis_request"]),
  sign_in: new Set(["sign_in", "account_created"]),
};

export function filterActivityEvents(events, filterId) {
  if (!filterId || filterId === "all") return events || [];
  const allowed = TIMELINE_FILTER_TYPES[filterId];
  if (!allowed) return events || [];
  return (events || []).filter((event) => allowed.has(event.type));
}

export function matchUserSmart(user, query) {
  const term = String(query || "").trim().toLowerCase();
  if (!term) return true;

  const haystack = [
    user?.username,
    user?.email,
    user?.telegram,
    user?.uid,
    user?.id,
    user?.subscriptionPlan,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  return haystack.some((value) => value.includes(term));
}

export const DEFAULT_CLIENT_FILTERS = {
  service: "all",
  plan: "",
  status: "all",
  registeredFrom: "",
  registeredTo: "",
  lastLoginFrom: "",
  lastLoginTo: "",
  subscriptionState: "all",
  userClassification: "all",
};

function readActiveServices(user) {
  return user?.activeServices || {};
}

function isVipActiveUser(user) {
  const flags = readActiveServices(user);
  if (flags.vip === true) return true;
  const text = `${user.subscriptionPlan || ""} ${user.subscriptionStatus || ""}`.toLowerCase();
  return /vip|spot|future|فيوتشر|سبوت|signal|إشارات|قناة/.test(text) && /active|نشط|مفعل/.test(text);
}

function isAccountManagementActiveUser(user) {
  const flags = readActiveServices(user);
  if (flags.accountManagement === true) return true;
  const text = `${user.subscriptionPlan || ""} ${user.subscriptionStatus || ""}`.toLowerCase();
  return /account|إدارة|management/.test(text) && /active|نشط|مفعل|approved|تمت/.test(text);
}

function isPriceAlertsActiveUser(user) {
  const flags = readActiveServices(user);
  if (flags.priceAlerts === true) return true;
  const text = `${user.subscriptionPlan || ""} ${user.subscriptionStatus || ""}`.toLowerCase();
  return /alert|تنبيه/.test(text);
}

function isExpiredSubscriptionUser(user) {
  return userHasExpiredSubscription(user);
}

function matchesSubscriptionState(user, subscriptionState, service = "all") {
  if (!subscriptionState || subscriptionState === "all") return true;
  if (subscriptionState === "expired") return userMatchesExpiredAndServiceFilter(user, service);
  if (subscriptionState === "active_vip") return isVipActiveUser(user);
  if (subscriptionState === "active_am") return isAccountManagementActiveUser(user);
  if (subscriptionState === "active_alerts") return isPriceAlertsActiveUser(user);
  return true;
}

export function getDashboardCardFilterPreset(cardKey) {
  const todayRange = getRegistrationCohortRange("today");
  const weekRange = getRegistrationCohortRange("week");
  const monthRange = getRegistrationCohortRange("month");

  const presets = {
    total: {
      accountStatus: "all",
      clientFilters: { ...DEFAULT_CLIENT_FILTERS },
      registrationCohort: "",
    },
    active: {
      accountStatus: "active",
      clientFilters: { ...DEFAULT_CLIENT_FILTERS, status: "active" },
      registrationCohort: "",
    },
    suspended: {
      accountStatus: "suspended",
      clientFilters: { ...DEFAULT_CLIENT_FILTERS, status: "suspended" },
      registrationCohort: "",
    },
    banned: {
      accountStatus: "banned",
      clientFilters: { ...DEFAULT_CLIENT_FILTERS, status: "banned" },
      registrationCohort: "",
    },
    deleted: {
      accountStatus: "deleted",
      clientFilters: { ...DEFAULT_CLIENT_FILTERS, status: "deleted" },
      registrationCohort: "",
    },
    vipActive: {
      accountStatus: "all",
      clientFilters: { ...DEFAULT_CLIENT_FILTERS, service: "vip", subscriptionState: "active_vip" },
      registrationCohort: "",
    },
    accountManagementActive: {
      accountStatus: "all",
      clientFilters: {
        ...DEFAULT_CLIENT_FILTERS,
        service: "account_management",
        subscriptionState: "active_am",
      },
      registrationCohort: "",
    },
    priceAlertsActive: {
      accountStatus: "all",
      clientFilters: { ...DEFAULT_CLIENT_FILTERS, service: "alerts", subscriptionState: "active_alerts" },
      registrationCohort: "",
    },
    expiredSubscriptions: {
      accountStatus: "all",
      clientFilters: { ...DEFAULT_CLIENT_FILTERS, subscriptionState: EXPIRED_SUBSCRIPTION_FILTER },
      registrationCohort: "",
    },
    newToday: {
      accountStatus: "all",
      clientFilters: {
        ...DEFAULT_CLIENT_FILTERS,
        registeredFrom: todayRange?.dateFrom || "",
        registeredTo: todayRange?.dateTo || "",
      },
      registrationCohort: "today",
    },
    newThisWeek: {
      accountStatus: "all",
      clientFilters: {
        ...DEFAULT_CLIENT_FILTERS,
        registeredFrom: weekRange?.dateFrom || "",
        registeredTo: weekRange?.dateTo || "",
      },
      registrationCohort: "week",
    },
    newThisMonth: {
      accountStatus: "all",
      clientFilters: {
        ...DEFAULT_CLIENT_FILTERS,
        registeredFrom: monthRange?.dateFrom || "",
        registeredTo: monthRange?.dateTo || "",
      },
      registrationCohort: "month",
    },
  };

  return presets[cardKey] || null;
}

export function applyClientUserFilters(users, filters) {
  const {
    service = "all",
    plan = "",
    status = "all",
    registeredFrom = "",
    registeredTo = "",
    lastLoginFrom = "",
    lastLoginTo = "",
    subscriptionState = "all",
  } = filters;

  return (users || []).filter((user) => {
    if (
      !isExpiredSubscriptionFilterActive({ subscriptionState }) &&
      status !== "all" &&
      user.accountStatus !== status
    ) {
      return false;
    }

    if (!matchesSubscriptionState(user, subscriptionState, service)) return false;

    if (plan.trim()) {
      const planText = String(user.subscriptionPlan || "").toLowerCase();
      if (!planText.includes(plan.trim().toLowerCase())) return false;
    }

    if (service !== "all" && subscriptionState !== "expired") {
      const flags = readActiveServices(user);
      if (service === "vip" && flags.vip) {
        // matched via server flags
      } else if (service === "account_management" && flags.accountManagement) {
        // matched via server flags
      } else if (service === "alerts" && flags.priceAlerts) {
        // matched via server flags
      } else if (service === "academy" && flags.academy) {
        // matched via server flags
      } else {
        const planText = `${user.subscriptionPlan || ""} ${user.subscriptionStatus || ""}`.toLowerCase();
        if (
          service === "vip" &&
          !/vip|spot|future|فيوتشر|سبوت|signal|signals|إشارات|private\s*channel/.test(planText)
        ) {
          return false;
        }
        if (service === "account_management" && !/account|إدارة|management/.test(planText)) return false;
        if (service === "alerts" && !/alert|تنبيه/.test(planText)) return false;
        if (service === "academy" && !/academy|أكاديم/.test(planText)) return false;
      }
    }

    const createdAt = user.createdAt ? new Date(user.createdAt).getTime() : null;
    if (registeredFrom && createdAt && createdAt < new Date(registeredFrom).getTime()) return false;
    if (registeredTo && createdAt && createdAt > new Date(`${registeredTo}T23:59:59`).getTime()) return false;

    const lastSignIn = user.lastSignInAt ? new Date(user.lastSignInAt).getTime() : null;
    if (lastLoginFrom && lastSignIn && lastSignIn < new Date(lastLoginFrom).getTime()) return false;
    if (lastLoginTo && lastSignIn && lastSignIn > new Date(`${lastLoginTo}T23:59:59`).getTime()) return false;

    return true;
  });
}

function isNewWithinDays(dateValue, days) {
  if (!dateValue) return false;
  const time = new Date(dateValue).getTime();
  if (!Number.isFinite(time)) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return time >= cutoff;
}

export function computeStatsFromUsers(users) {
  const list = users || [];
  return {
    vipActive: list.filter(isVipActiveUser).length,
    accountManagementActive: list.filter(isAccountManagementActiveUser).length,
    priceAlertsActive: list.filter(isPriceAlertsActiveUser).length,
    expiredSubscriptions: countDistinctUsersWithExpiredSubscriptions(list),
    newToday: list.filter((user) => {
      if (!user.createdAt) return false;
      const created = new Date(user.createdAt);
      const today = new Date();
      return (
        created.getFullYear() === today.getFullYear() &&
        created.getMonth() === today.getMonth() &&
        created.getDate() === today.getDate()
      );
    }).length,
    newThisWeek: list.filter((user) => isNewWithinDays(user.createdAt, 7)).length,
  };
}

export async function fetchDashboardStats(adminFetch, { signal } = {}) {
  const statusKeys = [
    { key: "total", status: "all" },
    { key: "active", status: "active" },
    { key: "suspended", status: "suspended" },
    { key: "banned", status: "banned" },
    { key: "deleted", status: "deleted" },
  ];

  const statusTotals = {};

  async function countCohort(cohort) {
    const bounds = resolveRegistrationDateBounds({ cohort });
    const result = await fetchAdminUserList(adminFetch, {
      page: 1,
      pageSize: 1,
      registeredFrom: bounds.registeredFromIso,
      registeredTo: bounds.registeredToIso,
      signal,
    });
    return Number(result.pagination?.total || 0);
  }

  const [serviceStats, cohortToday, cohortWeek, cohortMonth, ...statusResults] = await Promise.all([
    fetchAdminUserDashboardStats(adminFetch, { signal }),
    countCohort("today"),
    countCohort("week"),
    countCohort("month"),
    ...statusKeys.map(async ({ key, status }) => {
      const result = await fetchAdminUserList(adminFetch, {
        page: 1,
        pageSize: 1,
        accountStatus: status === "all" ? "" : status,
        signal,
      });
      statusTotals[key] = Number(result.pagination?.total || 0);
      return result;
    }),
  ]);

  void statusResults;

  const classificationKeys = ["test", "e2e", "internal", "suspected", "unknown"];
  const classificationCounts = {};
  const effectiveCounts = serviceStats.effectiveClassificationCounts;

  if (effectiveCounts) {
    for (const key of classificationKeys) {
      classificationCounts[key] = Number(effectiveCounts[key] || 0);
    }
  } else {
    await Promise.all(
      classificationKeys.map(async (key) => {
        const result = await fetchAdminUserList(adminFetch, {
          page: 1,
          pageSize: 1,
          userClassification: key,
          signal,
        });
        classificationCounts[key] = Number(result.pagination?.total || 0);
      })
    );
  }

  let realUsers = Number(effectiveCounts?.real || 0);
  if (!effectiveCounts) {
    const realUsersResult = await fetchAdminUserList(adminFetch, {
      page: 1,
      pageSize: 1,
      userClassification: "real",
      signal,
    });
    realUsers = Number(realUsersResult.pagination?.total || 0);
  }

  return {
    ...statusTotals,
    totalUsers: statusTotals.total,
    realUsers,
    testUsers: classificationCounts.test || 0,
    e2eUsers: classificationCounts.e2e || 0,
    internalUsers: classificationCounts.internal || 0,
    suspectedUsers: classificationCounts.suspected || 0,
    unknownUsers: classificationCounts.unknown || 0,
    vipActive: Number(serviceStats.vipActive || 0),
    accountManagementActive: Number(serviceStats.accountManagementActive || 0),
    priceAlertsActive: Number(serviceStats.priceAlertsActive || 0),
    expiredSubscriptions: Number(serviceStats.expiredSubscriptions || 0),
    newToday: cohortToday,
    newThisWeek: cohortWeek,
    newThisMonth: cohortMonth,
    registrationCohorts: {
      today: cohortToday,
      week: cohortWeek,
      month: cohortMonth,
    },
    scanComplete: true,
    serviceStatsSources: serviceStats.sources || null,
  };
}

export { buildAdminUserListRequestParams, resolveServerActiveServiceFilter } from "../../../../lib/admin-user-list-request.js";

export async function fetchUsersForClientView(
  adminFetch,
  {
    search = "",
    sort = "created_at",
    order = "desc",
    accountStatus = "all",
    clientFilters = {},
    registrationCohort = "",
    page = 1,
    pageSize = 25,
    maxPages = DASHBOARD_SCAN_MAX_PAGES,
    signal,
  } = {}
) {
  const effectiveAccountStatus = resolveEffectiveAccountStatusFilter(accountStatus, clientFilters);
  const serverActiveService = resolveServerActiveServiceFilter(clientFilters);
  const bounds = resolveRegistrationDateBounds({
    cohort: registrationCohort,
    registeredFrom: clientFilters.registeredFrom,
    registeredTo: clientFilters.registeredTo,
  });

  const needsClientPass =
    Boolean(clientFilters.plan?.trim()) ||
    Boolean(clientFilters.lastLoginFrom) ||
    Boolean(clientFilters.lastLoginTo) ||
    (clientFilters.subscriptionState &&
      clientFilters.subscriptionState !== "all" &&
      !serverActiveService) ||
    (clientFilters.status !== "all" && clientFilters.status !== accountStatus);

  const result = await fetchAdminUserList(adminFetch, {
    listAll: true,
    search,
    sort,
    order,
    accountStatus: effectiveAccountStatus,
    activeService: serverActiveService,
    registeredFrom: bounds.registeredFromIso,
    registeredTo: bounds.registeredToIso,
    signal,
  });

  const deduped = [];
  const seen = new Set();

  for (const user of result.users || []) {
    if (!user?.id || seen.has(user.id)) continue;
    seen.add(user.id);
    if (!matchUserSmart(user, search)) continue;
    deduped.push(user);
  }

  const filtered = applyClientUserFilters(deduped, clientFilters);
  const total = filtered.length;
  const pageNumber = Math.max(Number(page) || 1, 1);
  const resolvedPageSize = Math.min(Math.max(Number(pageSize) || 25, 1), 100);
  const from = (pageNumber - 1) * resolvedPageSize;
  const pageRows = filtered.slice(from, from + resolvedPageSize);

  return {
    users: pageRows,
    pagination: {
      page: pageNumber,
      pageSize: resolvedPageSize,
      total,
      totalPages: Math.max(Math.ceil(total / resolvedPageSize), 1),
    },
    mode: needsClientPass ? "client" : "client-server-bounds",
    scannedPages: 1,
  };
}

export function exportUsersToCsv(users, filename = "users-export.csv") {
  const headers = [
    "id",
    "username",
    "email",
    "telegram",
    "accountStatus",
    "نوع الحساب",
    "subscriptionPlan",
    "subscriptionStatus",
    "activeSubscriptionsCount",
    "createdAt",
    "lastSignInAt",
  ];

  const escapeCell = (value) => {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };

  const rows = (users || []).map((user) =>
    [
      user.id,
      user.username,
      user.email,
      user.telegram,
      user.accountStatusLabel || user.accountStatus,
      user.userClassificationLabel ||
        getUserClassificationLabel(user.userClassification || "unknown", { short: false }),
      user.subscriptionPlan,
      user.subscriptionStatus,
      user.activeSubscriptionsCount,
      user.createdAt,
      user.lastSignInAt,
    ]
      .map(escapeCell)
      .join(",")
  );

  const csv = `\uFEFF${headers.join(",")}\n${rows.join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const BULK_ACTIONS = [
  { id: "suspend_user", label: "تعليق جماعي", tone: "warning", needsReason: true },
  { id: "unsuspend_user", label: "رفع التعليق", tone: "neutral" },
  { id: "ban_user", label: "حظر", tone: "danger", dangerous: true },
  { id: "unban_user", label: "إلغاء الحظر", tone: "neutral" },
  { id: "soft_delete_user", label: "حذف منطقي", tone: "danger", dangerous: true },
  { id: "restore_user", label: "استعادة", tone: "success" },
  { id: "activate_service", label: "تفعيل خدمة", tone: "success", needsService: true },
  { id: "deactivate_service", label: "إيقاف خدمة", tone: "warning", needsService: true },
];

export const SERVICE_OPTIONS = [
  { key: "vip", label: "VIP" },
  { key: "account_management", label: "إدارة الحسابات" },
  { key: "alerts", label: "التنبيهات" },
  { key: "academy", label: "الأكاديمية" },
];

export {
  EXPIRED_SUBSCRIPTION_FILTER,
  isExpiredSubscriptionFilterActive,
  resolveEffectiveAccountStatusFilter,
  resolveExpiredServerActiveServiceFilter,
  resolveExpiredSubscriptionBadge,
  resolveUserSubscriptionStateLabel,
  userMatchesExpiredAndServiceFilter,
  isVipActiveUser,
  isAccountManagementActiveUser,
  isPriceAlertsActiveUser,
  isExpiredSubscriptionUser,
  isActiveSubscriptionRequest,
  isActiveAccountManagementRequest,
  isActivePriceAlertRow,
  isExpiredSubscriptionRequest,
  isVipServiceType,
  matchesAdminServiceFilter,
  normalizeAdminUserServiceType,
};
