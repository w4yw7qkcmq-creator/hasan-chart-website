import {
  ADMIN_SERVICE_TYPES,
  isActiveAccountManagementRequest,
  isActivePriceAlertRow,
  isActiveSubscriptionForDashboardStats,
  isInactiveAccountManagementRequest,
  isInactivePriceAlertRow,
  isExpiredSubscriptionRequest,
  isVipServiceType,
  matchesAdminServiceFilter,
  normalizeAdminUserServiceType,
} from "./admin-user-service-classifier.js";

export const SERVICE_FILTER_EXPIRED_TYPES = {
  vip: [
    ADMIN_SERVICE_TYPES.VIP,
    ADMIN_SERVICE_TYPES.VIP_SPOT,
    ADMIN_SERVICE_TYPES.VIP_FUTURES,
    ADMIN_SERVICE_TYPES.VIP_SIGNALS,
  ],
  account_management: [ADMIN_SERVICE_TYPES.ACCOUNT_MANAGEMENT],
  alerts: [ADMIN_SERVICE_TYPES.PRICE_ALERT],
  academy: [ADMIN_SERVICE_TYPES.ACADEMY],
};

export function summarizeUserServiceStates({
  subscriptionRows = [],
  accountRows = [],
  alertRows = [],
} = {}) {
  const expiredServiceTypes = new Set();
  const activeServiceTypes = new Set();
  let expiredSubscriptionCount = 0;
  let activeSubscriptionCount = 0;
  let inactiveAccountManagementCount = 0;
  let inactiveAlertCount = 0;

  for (const row of subscriptionRows) {
    const serviceType = normalizeAdminUserServiceType(row, {
      sourceTable: "subscription_requests",
    });

    if (isExpiredSubscriptionRequest(row)) {
      expiredSubscriptionCount += 1;
      expiredServiceTypes.add(serviceType);
    }

    if (isActiveSubscriptionForDashboardStats(row)) {
      activeSubscriptionCount += 1;
      activeServiceTypes.add(serviceType);
    }
  }

  for (const row of accountRows) {
    if (isInactiveAccountManagementRequest(row)) {
      inactiveAccountManagementCount += 1;
      expiredServiceTypes.add(ADMIN_SERVICE_TYPES.ACCOUNT_MANAGEMENT);
    } else if (isActiveAccountManagementRequest(row)) {
      activeServiceTypes.add(ADMIN_SERVICE_TYPES.ACCOUNT_MANAGEMENT);
    }
  }

  for (const row of alertRows) {
    if (isInactivePriceAlertRow(row)) {
      inactiveAlertCount += 1;
      expiredServiceTypes.add(ADMIN_SERVICE_TYPES.PRICE_ALERT);
    } else if (isActivePriceAlertRow(row)) {
      activeServiceTypes.add(ADMIN_SERVICE_TYPES.PRICE_ALERT);
    }
  }

  const expiredTypes = [...expiredServiceTypes];
  const activeTypes = [...activeServiceTypes];

  return {
    expiredServiceTypes: expiredTypes,
    activeServiceTypes: activeTypes,
    expiredSubscriptionTypes: expiredTypes,
    expiredSubscriptionCount:
      expiredSubscriptionCount + inactiveAccountManagementCount + inactiveAlertCount,
    hasExpiredService: expiredTypes.length > 0,
    hasExpiredSubscription: expiredTypes.length > 0,
    activeSubscriptionCount,
    hasActiveSubscription: activeTypes.length > 0,
    inactiveAccountManagementCount,
    hasInactiveAccountManagement: inactiveAccountManagementCount > 0,
    inactiveAlertCount,
  };
}

export function summarizeUserSubscriptionRows(rows = []) {
  return summarizeUserServiceStates({ subscriptionRows: rows });
}

export function filterServiceTypesByFilter(types = [], serviceFilter = "all") {
  const list = Array.isArray(types) ? types : [];
  if (!serviceFilter || serviceFilter === "all") return list;
  return list.filter((serviceType) => matchesAdminServiceFilter(serviceType, serviceFilter));
}

export function userHasExpiredSubscription(user) {
  return user?.hasExpiredSubscription === true || user?.hasExpiredService === true;
}

export function userHasExpiredServiceForFilter(user, serviceFilter = "all") {
  const types = user?.expiredServiceTypes || user?.expiredSubscriptionTypes || [];
  if (types.length > 0) {
    return filterServiceTypesByFilter(types, serviceFilter).length > 0;
  }
  if (!userHasExpiredSubscription(user)) return false;
  return !serviceFilter || serviceFilter === "all";
}

export function userHasActiveServiceForFilter(user, serviceFilter = "all") {
  const types = user?.activeServiceTypes || [];
  if (types.length > 0) {
    return filterServiceTypesByFilter(types, serviceFilter).length > 0;
  }

  if (!serviceFilter || serviceFilter === "all") {
    return user?.hasActiveSubscription === true || Number(user?.activeSubscriptionCount || 0) > 0;
  }

  const flags = user?.activeServices || {};
  if (serviceFilter === "vip") return flags.vip === true;
  if (serviceFilter === "account_management") return flags.accountManagement === true;
  if (serviceFilter === "alerts") return flags.priceAlerts === true;
  if (serviceFilter === "academy") return flags.academy === true;
  return false;
}

export function userMatchesExpiredAndServiceFilter(user, serviceFilter = "all") {
  if (!userHasExpiredSubscription(user)) return false;
  return userHasExpiredServiceForFilter(user, serviceFilter);
}

export function userHasActiveVipSubscription(user) {
  if (user?.activeServices?.vip === true) return true;
  return (user?.activeServiceTypes || user?.activeSubscriptionTypes || []).some((type) =>
    isVipServiceType(type)
  );
}

export function userMatchesExpiredSubscriptionFilter(user, serviceFilter = "all") {
  return userMatchesExpiredAndServiceFilter(user, serviceFilter);
}

export function countDistinctUsersWithExpiredSubscriptions(users = [], serviceFilter = "all") {
  return users.filter((user) => userMatchesExpiredAndServiceFilter(user, serviceFilter)).length;
}

export function filterUsersWithExpiredSubscriptions(users = [], serviceFilter = "all") {
  return users.filter((user) => userMatchesExpiredAndServiceFilter(user, serviceFilter));
}

export function computeExpiredSubscriptionCardStats(users = [], serviceFilter = "all") {
  const filteredUsers = filterUsersWithExpiredSubscriptions(users, serviceFilter);
  return {
    cardCount: filteredUsers.length,
    filteredUsers,
    filteredUserIds: filteredUsers.map((user) => user.id),
  };
}

export function collectDistinctExpiredEmailsFromRows(subscriptionRows = [], serviceFilter = "all") {
  const emails = new Set();

  for (const row of subscriptionRows) {
    if (!isExpiredSubscriptionRequest(row)) continue;
    const serviceType = normalizeAdminUserServiceType(row, {
      sourceTable: "subscription_requests",
    });
    if (!matchesAdminServiceFilter(serviceType, serviceFilter)) continue;
    const email = String(row.user_email || "").trim().toLowerCase();
    if (email) emails.add(email);
  }

  return emails;
}

export function mapServiceTypeToActiveFlag(serviceType) {
  if (isVipServiceType(serviceType)) return "vip";
  if (serviceType === ADMIN_SERVICE_TYPES.ACADEMY) return "academy";
  if (serviceType === ADMIN_SERVICE_TYPES.ACCOUNT_MANAGEMENT) return "accountManagement";
  if (serviceType === ADMIN_SERVICE_TYPES.PRICE_ALERT) return "priceAlerts";
  return null;
}

export const ADMIN_SERVICE_TYPE_LABELS = {
  [ADMIN_SERVICE_TYPES.VIP]: "VIP",
  [ADMIN_SERVICE_TYPES.VIP_SPOT]: "VIP Spot",
  [ADMIN_SERVICE_TYPES.VIP_FUTURES]: "VIP Futures",
  [ADMIN_SERVICE_TYPES.VIP_SIGNALS]: "VIP Signals",
  [ADMIN_SERVICE_TYPES.ACADEMY]: "الأكاديمية",
  [ADMIN_SERVICE_TYPES.ACCOUNT_MANAGEMENT]: "إدارة الحسابات",
  [ADMIN_SERVICE_TYPES.PRICE_ALERT]: "التنبيهات",
  [ADMIN_SERVICE_TYPES.OTHER]: "أخرى",
};

export const EXPIRED_SUBSCRIPTION_FILTER = "expired";

export function formatAdminServiceTypeLabel(serviceType) {
  return ADMIN_SERVICE_TYPE_LABELS[serviceType] || serviceType || "—";
}

export function resolveScopedExpiredServiceTypes(user, serviceFilter = "all") {
  const types = user?.expiredServiceTypes || user?.expiredSubscriptionTypes || [];
  return filterServiceTypesByFilter(types, serviceFilter);
}

export function resolveScopedActiveServiceTypes(user, serviceFilter = "all") {
  const types = user?.activeServiceTypes || [];
  const scoped = filterServiceTypesByFilter(types, serviceFilter);
  if (scoped.length > 0) return scoped;
  if (userHasActiveServiceForFilter(user, serviceFilter) && serviceFilter !== "all") {
    return SERVICE_FILTER_EXPIRED_TYPES[serviceFilter] || [];
  }
  return scoped;
}

function scopedStateUsesInactiveServiceLabel(expiredTypes = [], serviceFilter = "all") {
  if (serviceFilter === "account_management") return true;
  return (
    expiredTypes.length > 0 &&
    expiredTypes.every((type) => type === ADMIN_SERVICE_TYPES.ACCOUNT_MANAGEMENT)
  );
}

export function resolveUserSubscriptionStateLabel(user, { serviceFilter = "all" } = {}) {
  const activeTypes = resolveScopedActiveServiceTypes(user, serviceFilter);
  const expiredTypes = resolveScopedExpiredServiceTypes(user, serviceFilter);
  const hasActive = activeTypes.length > 0 || userHasActiveServiceForFilter(user, serviceFilter);
  const hasExpired = expiredTypes.length > 0;
  const inactiveServiceLabel = scopedStateUsesInactiveServiceLabel(expiredTypes, serviceFilter);

  if (hasActive && hasExpired) return "نشط + منتهي";
  if (hasActive) return "نشط";
  if (hasExpired) return inactiveServiceLabel ? "خدمة غير نشطة" : "منتهي";
  return "لا يوجد";
}

export function resolveExpiredSubscriptionBadge(user, { serviceFilter = "all" } = {}) {
  const scopedTypes = resolveScopedExpiredServiceTypes(user, serviceFilter);
  if (scopedTypes.length === 0) return null;

  const labels = scopedTypes.map(formatAdminServiceTypeLabel).filter(Boolean);
  const onlyAccountManagement = scopedTypes.every(
    (type) => type === ADMIN_SERVICE_TYPES.ACCOUNT_MANAGEMENT
  );
  const countLabel =
    scopedTypes.length > 1
      ? onlyAccountManagement
        ? `${scopedTypes.length} خدمات غير نشطة`
        : `${scopedTypes.length} اشتراكات منتهية`
      : onlyAccountManagement
      ? "خدمة غير نشطة"
      : "اشتراك منتهي";

  return {
    countLabel,
    typesLabel: labels.join(" · "),
    count: scopedTypes.length,
    types: labels,
    serviceTypes: scopedTypes,
  };
}

export function isExpiredSubscriptionFilterActive(filters = {}) {
  return filters?.subscriptionState === EXPIRED_SUBSCRIPTION_FILTER;
}

export function resolveEffectiveAccountStatusFilter(accountStatusFilter = "all", clientFilters = {}) {
  if (isExpiredSubscriptionFilterActive(clientFilters)) return "all";
  return accountStatusFilter || "all";
}

export function resolveExpiredServerActiveServiceFilter(serviceFilter = "all") {
  if (!serviceFilter || serviceFilter === "all") return EXPIRED_SUBSCRIPTION_FILTER;
  return `${EXPIRED_SUBSCRIPTION_FILTER}_${serviceFilter}`;
}

export function parseExpiredServerActiveServiceFilter(activeService = "") {
  const normalized = String(activeService || "").trim().toLowerCase();
  if (normalized === EXPIRED_SUBSCRIPTION_FILTER) {
    return { expired: true, serviceFilter: "all" };
  }
  const match = normalized.match(/^expired_(.+)$/);
  if (match) {
    return { expired: true, serviceFilter: match[1] };
  }
  return { expired: false, serviceFilter: "all" };
}
