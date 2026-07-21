import {
  ACTIVE_ACCOUNT_MANAGEMENT_STATUSES,
  ACTIVE_SUBSCRIPTION_STATUSES,
  buildActiveServiceFlagsFromRows,
  classifySubscriptionRow,
  isActiveAccountManagementRequest,
  isActivePriceAlertRow,
  isActiveSubscriptionForDashboardStats,
  isActiveSubscriptionRequest,
  isExpiredSubscriptionRequest,
  isVipServiceType,
  normalizeAdminUserServiceType,
} from "./admin-user-service-classifier.js";

const STATS_PAGE_SIZE = 1000;
const ACTIVE_ALERT_STATUSES = ["active", "نشط", "enabled"];
const EXPIRED_SUBSCRIPTION_STATUSES = ["منتهي", "expired"];

async function fetchPaginatedRows(supabase, table, select, applyFilters) {
  const rows = [];
  let page = 0;

  while (true) {
    const from = page * STATS_PAGE_SIZE;
    const to = from + STATS_PAGE_SIZE - 1;
    let query = supabase.from(table).select(select).range(from, to);
    query = applyFilters(query);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < STATS_PAGE_SIZE) break;
    page += 1;
  }

  return rows;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function collectDistinctVipActiveEmails(subscriptionRows = []) {
  const emails = new Set();
  for (const row of subscriptionRows) {
    if (!isActiveSubscriptionForDashboardStats(row)) continue;
    const serviceType = normalizeAdminUserServiceType(row, { sourceTable: "subscription_requests" });
    if (!isVipServiceType(serviceType)) continue;
    const email = normalizeEmail(row.user_email);
    if (email) emails.add(email);
  }
  return emails;
}

export function analyzeVipSubscriptionRows(subscriptionRows = []) {
  const dbDistinctEmails = new Set();
  const vipActiveEmails = new Set();
  const records = [];

  for (const row of subscriptionRows) {
    const email = normalizeEmail(row.user_email);
    if (email) dbDistinctEmails.add(email);

    const classification = classifySubscriptionRow(row);
    records.push({
      id: row.id ?? null,
      user_email: row.user_email ?? null,
      status: classification.status,
      plan_name: classification.plan_name,
      category: classification.category,
      normalizedServiceType: classification.normalizedServiceType,
      isActive: classification.isActive,
      countsAsVipActive: classification.countsAsVipActive,
      exclusionReason: classification.exclusionReason,
    });

    if (classification.countsAsVipActive && email) {
      vipActiveEmails.add(email);
    }
  }

  const excluded = records.filter((record) => record.exclusionReason);

  return {
    totalRows: subscriptionRows.length,
    dbDistinctEmailCount: dbDistinctEmails.size,
    vipActiveCount: vipActiveEmails.size,
    records,
    excluded,
    matchesDbDistinctEmails: dbDistinctEmails.size === vipActiveEmails.size,
  };
}

function collectDistinctAccountManagementUserIds(accountRows = []) {
  const userIds = new Set();
  for (const row of accountRows) {
    if (!isActiveAccountManagementRequest(row)) continue;
    const userId = String(row.user_id || "").trim();
    if (userId) userIds.add(userId);
  }
  return userIds;
}

function collectDistinctPriceAlertEmails(alertRows = []) {
  const emails = new Set();
  for (const row of alertRows) {
    if (!isActivePriceAlertRow(row)) continue;
    const email = normalizeEmail(row.user_email);
    if (email) emails.add(email);
  }
  return emails;
}

function collectDistinctExpiredEmails(subscriptionRows = []) {
  const emails = new Set();
  for (const row of subscriptionRows) {
    if (!isExpiredSubscriptionRequest(row)) continue;
    const email = normalizeEmail(row.user_email);
    if (email) emails.add(email);
  }
  return emails;
}

export async function resolveActiveServiceUserKeys(supabase, serviceKey) {
  const normalizedKey = String(serviceKey || "").trim().toLowerCase();

  if (normalizedKey === "vip") {
    const rows = await fetchPaginatedRows(
      supabase,
      "subscription_requests",
      "user_email,plan_name,category,status,expires_at,admin_disabled",
      (query) => query.in("status", [...ACTIVE_SUBSCRIPTION_STATUSES])
    );
    return {
      emails: collectDistinctVipActiveEmails(rows),
      userIds: new Set(),
    };
  }

  if (normalizedKey === "account_management") {
    const rows = await fetchPaginatedRows(
      supabase,
      "account_management_requests",
      "user_id,status",
      (query) => query.in("status", [...ACTIVE_ACCOUNT_MANAGEMENT_STATUSES])
    );
    return {
      emails: new Set(),
      userIds: collectDistinctAccountManagementUserIds(rows),
    };
  }

  if (normalizedKey === "alerts") {
    const rows = await fetchPaginatedRows(
      supabase,
      "price_alerts",
      "user_email,status",
      (query) => query.in("status", ACTIVE_ALERT_STATUSES)
    );
    return {
      emails: collectDistinctPriceAlertEmails(rows),
      userIds: new Set(),
    };
  }

  return { emails: new Set(), userIds: new Set() };
}

export async function loadAdminUserDashboardStats(supabase) {
  const [vipKeys, accountKeys, alertKeys, expiredRows] = await Promise.all([
    resolveActiveServiceUserKeys(supabase, "vip"),
    resolveActiveServiceUserKeys(supabase, "account_management"),
    resolveActiveServiceUserKeys(supabase, "alerts"),
    fetchPaginatedRows(
      supabase,
      "subscription_requests",
      "user_email,status,expires_at",
      (query) => query.in("status", [...EXPIRED_SUBSCRIPTION_STATUSES, ...ACTIVE_SUBSCRIPTION_STATUSES])
    ),
  ]);

  return {
    vipActive: vipKeys.emails.size,
    accountManagementActive: accountKeys.userIds.size,
    priceAlertsActive: alertKeys.emails.size,
    expiredSubscriptions: collectDistinctExpiredEmails(expiredRows).size,
    sources: {
      vipActive: "subscription_requests.user_email DISTINCT (status مفعل/نشط/active + VIP classifier, DB status is source of truth)",
      accountManagementActive: "account_management_requests.user_id DISTINCT (status: نشط/مفعل/active)",
      priceAlertsActive: "price_alerts.user_email DISTINCT (status active)",
      expiredSubscriptions: "subscription_requests.user_email DISTINCT (expired status or expires_at)",
    },
  };
}

export async function attachActiveServiceFlagsToUsers(supabase, users = []) {
  if (!users.length) return users;

  const emails = [...new Set(users.map((user) => normalizeEmail(user.email)).filter(Boolean))];
  const userIds = [...new Set(users.map((user) => String(user.id || "").trim()).filter(Boolean))];

  const [subscriptionsResult, accountResult, alertsResult] = await Promise.all([
    emails.length
      ? supabase
          .from("subscription_requests")
          .select("user_email,plan_name,category,status,expires_at,admin_disabled")
          .in("user_email", emails)
          .in("status", [...ACTIVE_SUBSCRIPTION_STATUSES])
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? supabase
          .from("account_management_requests")
          .select("user_id,status")
          .in("user_id", userIds)
          .in("status", [...ACTIVE_ACCOUNT_MANAGEMENT_STATUSES])
      : Promise.resolve({ data: [], error: null }),
    emails.length
      ? supabase
          .from("price_alerts")
          .select("user_email,status")
          .in("user_email", emails)
          .in("status", ACTIVE_ALERT_STATUSES)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (subscriptionsResult.error) throw subscriptionsResult.error;
  if (accountResult.error) throw accountResult.error;
  if (alertsResult.error) throw alertsResult.error;

  const subscriptionsByEmail = new Map();
  for (const row of subscriptionsResult.data || []) {
    const email = normalizeEmail(row.user_email);
    if (!email) continue;
    if (!subscriptionsByEmail.has(email)) subscriptionsByEmail.set(email, []);
    subscriptionsByEmail.get(email).push(row);
  }

  const accountByUserId = new Map();
  for (const row of accountResult.data || []) {
    const userId = String(row.user_id || "").trim();
    if (!userId) continue;
    if (!accountByUserId.has(userId)) accountByUserId.set(userId, []);
    accountByUserId.get(userId).push(row);
  }

  const alertsByEmail = new Map();
  for (const row of alertsResult.data || []) {
    const email = normalizeEmail(row.user_email);
    if (!email) continue;
    if (!alertsByEmail.has(email)) alertsByEmail.set(email, []);
    alertsByEmail.get(email).push(row);
  }

  return users.map((user) => {
    const email = normalizeEmail(user.email);
    const userId = String(user.id || "").trim();
    const activeServices = buildActiveServiceFlagsFromRows({
      subscriptions: subscriptionsByEmail.get(email) || [],
      accountRows: accountByUserId.get(userId) || [],
      alerts: alertsByEmail.get(email) || [],
    });

    return {
      ...user,
      activeServices,
    };
  });
}
