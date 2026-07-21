export const ADMIN_SERVICE_TYPES = {
  VIP: "vip",
  VIP_SPOT: "vip_spot",
  VIP_FUTURES: "vip_futures",
  VIP_SIGNALS: "vip_signals",
  ACADEMY: "academy",
  ACCOUNT_MANAGEMENT: "account_management",
  PRICE_ALERT: "price_alert",
  OTHER: "other",
};

export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["مفعل", "نشط", "active"]);
export const INACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "مرفوض",
  "ملغى",
  "مؤرشف",
  "منتهي",
  "موقوف",
  "rejected",
  "cancelled",
  "expired",
  "pending",
  "بانتظار المراجعة",
]);

export const ACTIVE_ACCOUNT_MANAGEMENT_STATUSES = new Set(["نشط", "مفعل", "active"]);

export const ACTIVE_PRICE_ALERT_STATUSES = new Set(["active", "نشط", "enabled"]);

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function combinedServiceText(row) {
  return [
    row?.plan_name,
    row?.category,
    row?.service_type,
    row?.platform,
    row?.account_type,
    row?.plan,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(" ");
}

export function normalizeAdminUserServiceType(row, { sourceTable } = {}) {
  const inferredSource =
    sourceTable ||
    row?.sourceTable ||
    (row?.user_id && !row?.plan_name && !row?.category && row?.platform == null
      ? "account_management_requests"
      : row?.triggered_at != null || row?.symbol != null
      ? "price_alerts"
      : "subscription_requests");

  if (inferredSource === "account_management_requests") {
    return ADMIN_SERVICE_TYPES.ACCOUNT_MANAGEMENT;
  }

  if (inferredSource === "price_alerts") {
    return ADMIN_SERVICE_TYPES.PRICE_ALERT;
  }

  const combined = combinedServiceText(row);

  if (/signal|signals|إشارات|قناة\s*خاصة|قناة|private\s*channel|vip\s*signal/.test(combined)) {
    return ADMIN_SERVICE_TYPES.VIP_SIGNALS;
  }

  if (/future|futures|فيوتشر/.test(combined)) {
    return ADMIN_SERVICE_TYPES.VIP_FUTURES;
  }

  if (/spot|سبوت/.test(combined)) {
    return ADMIN_SERVICE_TYPES.VIP_SPOT;
  }

  if (/vip|توصيات/.test(combined)) {
    return ADMIN_SERVICE_TYPES.VIP;
  }

  if (/academy|أكاديم|academ/.test(combined)) {
    return ADMIN_SERVICE_TYPES.ACADEMY;
  }

  if (/account\s*management|management|إدارة\s*الحساب|إدارة\s*حساب|إدارة/.test(combined)) {
    return ADMIN_SERVICE_TYPES.ACCOUNT_MANAGEMENT;
  }

  return ADMIN_SERVICE_TYPES.OTHER;
}

export function isVipServiceType(serviceType) {
  return (
    serviceType === ADMIN_SERVICE_TYPES.VIP ||
    serviceType === ADMIN_SERVICE_TYPES.VIP_SPOT ||
    serviceType === ADMIN_SERVICE_TYPES.VIP_FUTURES ||
    serviceType === ADMIN_SERVICE_TYPES.VIP_SIGNALS
  );
}

export function isActiveSubscriptionRequest(row) {
  if (!row) return false;
  if (row.admin_disabled) return false;

  const status = String(row.status || "").trim();
  const normalized = status.toLowerCase();

  if (INACTIVE_SUBSCRIPTION_STATUSES.has(status) || INACTIVE_SUBSCRIPTION_STATUSES.has(normalized)) {
    return false;
  }

  if (!ACTIVE_SUBSCRIPTION_STATUSES.has(status) && !ACTIVE_SUBSCRIPTION_STATUSES.has(normalized)) {
    return false;
  }

  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return false;
  }

  return true;
}

export function isActiveAccountManagementRequest(row) {
  if (!row) return false;
  const status = String(row.status || "").trim();
  const normalized = status.toLowerCase();
  return (
    ACTIVE_ACCOUNT_MANAGEMENT_STATUSES.has(status) ||
    ACTIVE_ACCOUNT_MANAGEMENT_STATUSES.has(normalized)
  );
}

export function isActivePriceAlertRow(row) {
  if (!row) return false;
  const status = String(row.status || "").trim().toLowerCase();
  return ACTIVE_PRICE_ALERT_STATUSES.has(status);
}

export function isExpiredSubscriptionRequest(row) {
  if (!row) return false;
  const status = String(row.status || "").trim().toLowerCase();
  if (/expired|منته|ended|inactive|غير/.test(status)) return true;
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return true;
  return false;
}

export function matchesAdminServiceFilter(serviceType, filterKey) {
  if (!filterKey || filterKey === "all") return true;
  if (filterKey === "vip") return isVipServiceType(serviceType);
  if (filterKey === "account_management") return serviceType === ADMIN_SERVICE_TYPES.ACCOUNT_MANAGEMENT;
  if (filterKey === "alerts") return serviceType === ADMIN_SERVICE_TYPES.PRICE_ALERT;
  if (filterKey === "academy") return serviceType === ADMIN_SERVICE_TYPES.ACADEMY;
  return false;
}

export function buildActiveServiceFlagsFromRows({ subscriptions = [], accountRows = [], alerts = [] } = {}) {
  const flags = {
    vip: false,
    academy: false,
    accountManagement: false,
    priceAlerts: false,
  };

  for (const row of subscriptions) {
    if (!isActiveSubscriptionRequest(row)) continue;
    const serviceType = normalizeAdminUserServiceType(row, { sourceTable: "subscription_requests" });
    if (isVipServiceType(serviceType)) flags.vip = true;
    if (serviceType === ADMIN_SERVICE_TYPES.ACADEMY) flags.academy = true;
  }

  for (const row of accountRows) {
    if (isActiveAccountManagementRequest(row)) {
      flags.accountManagement = true;
    }
  }

  for (const row of alerts) {
    if (isActivePriceAlertRow(row)) {
      flags.priceAlerts = true;
    }
  }

  return flags;
}
