import {
  ADMIN_SERVICE_TYPES,
  isActiveSubscriptionForDashboardStats,
  isActiveSubscriptionRequest,
  isExpiredSubscriptionRequest,
  isVipServiceType,
  normalizeAdminUserServiceType,
} from "./admin-user-service-classifier.js";

export function summarizeUserSubscriptionRows(rows = []) {
  let expiredSubscriptionCount = 0;
  let activeSubscriptionCount = 0;
  const expiredSubscriptionTypes = new Set();
  const activeSubscriptionTypes = new Set();

  for (const row of rows) {
    const serviceType = normalizeAdminUserServiceType(row, {
      sourceTable: "subscription_requests",
    });

    if (isExpiredSubscriptionRequest(row)) {
      expiredSubscriptionCount += 1;
      expiredSubscriptionTypes.add(serviceType);
    }

    if (isActiveSubscriptionForDashboardStats(row)) {
      activeSubscriptionCount += 1;
      activeSubscriptionTypes.add(serviceType);
    }
  }

  return {
    expiredSubscriptionCount,
    hasExpiredSubscription: expiredSubscriptionCount > 0,
    expiredSubscriptionTypes: [...expiredSubscriptionTypes],
    activeSubscriptionCount,
    hasActiveSubscription: activeSubscriptionCount > 0,
  };
}

export function userHasExpiredSubscription(user) {
  return user?.hasExpiredSubscription === true;
}

export function userHasActiveVipSubscription(user) {
  if (user?.activeServices?.vip === true) return true;
  return (user?.activeSubscriptionTypes || []).some((type) => isVipServiceType(type));
}

export function userMatchesExpiredSubscriptionFilter(user) {
  return userHasExpiredSubscription(user);
}

export function countDistinctUsersWithExpiredSubscriptions(users = []) {
  return users.filter(userHasExpiredSubscription).length;
}

export function filterUsersWithExpiredSubscriptions(users = []) {
  return users.filter(userHasExpiredSubscription);
}

export function computeExpiredSubscriptionCardStats(users = []) {
  const filteredUsers = filterUsersWithExpiredSubscriptions(users);
  return {
    cardCount: filteredUsers.length,
    filteredUsers,
    filteredUserIds: filteredUsers.map((user) => user.id),
  };
}

export function collectDistinctExpiredEmailsFromRows(subscriptionRows = []) {
  const emails = new Set();

  for (const row of subscriptionRows) {
    if (!isExpiredSubscriptionRequest(row)) continue;
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

export function userHasActiveSubscriptionState(user) {
  if (user?.hasActiveSubscription === true) return true;
  return Number(user?.activeSubscriptionCount || 0) > 0;
}

export function resolveUserSubscriptionStateLabel(user) {
  const hasActive = userHasActiveSubscriptionState(user);
  const hasExpired = userHasExpiredSubscription(user);

  if (hasActive && hasExpired) return "نشط + منتهي";
  if (hasActive) return "نشط";
  if (hasExpired) return "منتهي";
  return "لا يوجد اشتراك";
}

export function resolveExpiredSubscriptionBadge(user) {
  if (!userHasExpiredSubscription(user)) return null;

  const count = Number(user?.expiredSubscriptionCount || 0);
  const types = (user?.expiredSubscriptionTypes || []).map(formatAdminServiceTypeLabel).filter(Boolean);
  const countLabel = count > 1 ? `${count} اشتراكات منتهية` : "اشتراك منتهي";

  return {
    countLabel,
    typesLabel: types.join(" · "),
    count,
    types,
  };
}

export function isExpiredSubscriptionFilterActive(filters = {}) {
  return filters?.subscriptionState === EXPIRED_SUBSCRIPTION_FILTER;
}

export function resolveEffectiveAccountStatusFilter(accountStatusFilter = "all", clientFilters = {}) {
  if (isExpiredSubscriptionFilterActive(clientFilters)) return "all";
  return accountStatusFilter || "all";
}
