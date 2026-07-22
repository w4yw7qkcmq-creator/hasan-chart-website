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
