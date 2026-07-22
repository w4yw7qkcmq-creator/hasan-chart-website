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

export const VIP_SPOT_CATEGORY_LABELS = new Set([
  "باقات السبوت",
  "spot",
  "Spot",
]);

export const VIP_FUTURES_CATEGORY_LABELS = new Set([
  "باقات الفيوتشر",
  "futures",
  "Futures",
]);

export const VIP_SIGNALS_CATEGORY_LABELS = new Set([
  "signals",
  "Signals",
  "الإشارات",
  "القناة الخاصة",
]);

export const VIP_SPOT_PLAN_LABELS = new Set([
  "VIP Spot",
  "VIP Spot Monthly",
]);

export const VIP_FUTURES_PLAN_LABELS = new Set([
  "VIP Futures",
  "VIP Futures Monthly",
]);

export const VIP_SIGNALS_PLAN_LABELS = new Set([
  "VIP Signals",
]);

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeLabel(value) {
  return String(value || "").trim();
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

  const planName = normalizeLabel(row?.plan_name);
  const category = normalizeLabel(row?.category);
  const combined = combinedServiceText(row);

  if (
    VIP_SIGNALS_PLAN_LABELS.has(planName) ||
    VIP_SIGNALS_CATEGORY_LABELS.has(category) ||
    /signal|signals|private\s*channel|vip\s*signal/.test(combined) ||
    combined.includes("\u0625\u0634\u0627\u0631\u0627\u062a") ||
    combined.includes("\u0642\u0646\u0627\u0629")
  ) {
    return ADMIN_SERVICE_TYPES.VIP_SIGNALS;
  }

  if (
    VIP_FUTURES_PLAN_LABELS.has(planName) ||
    VIP_FUTURES_CATEGORY_LABELS.has(category) ||
    /future|futures/.test(combined) ||
    combined.includes("\u0641\u064a\u0648\u062a\u0634")
  ) {
    return ADMIN_SERVICE_TYPES.VIP_FUTURES;
  }

  if (
    VIP_SPOT_PLAN_LABELS.has(planName) ||
    VIP_SPOT_CATEGORY_LABELS.has(category) ||
    /spot/.test(combined) ||
    combined.includes("\u0633\u0628\u0648\u062a")
  ) {
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

function hasActiveSubscriptionStatus(row) {
  const status = String(row?.status || "").trim();
  const normalized = status.toLowerCase();

  if (INACTIVE_SUBSCRIPTION_STATUSES.has(status) || INACTIVE_SUBSCRIPTION_STATUSES.has(normalized)) {
    return false;
  }

  return ACTIVE_SUBSCRIPTION_STATUSES.has(status) || ACTIVE_SUBSCRIPTION_STATUSES.has(normalized);
}

export function isActiveSubscriptionRequest(row) {
  if (!row) return false;
  if (row.admin_disabled) return false;
  if (!hasActiveSubscriptionStatus(row)) return false;

  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return false;
  }

  return true;
}

export function isActiveSubscriptionForDashboardStats(row) {
  if (!row) return false;
  if (row.admin_disabled) return false;
  return hasActiveSubscriptionStatus(row);
}

export function classifySubscriptionRow(row, { sourceTable = "subscription_requests" } = {}) {
  const normalizedServiceType = normalizeAdminUserServiceType(row, { sourceTable });
  const isActive = isActiveSubscriptionForDashboardStats(row);
  const countsAsVipActive = isActive && isVipServiceType(normalizedServiceType);

  return {
    status: String(row?.status || "").trim(),
    plan_name: normalizeLabel(row?.plan_name),
    category: normalizeLabel(row?.category),
    normalizedServiceType,
    isActive,
    countsAsVipActive,
    exclusionReason: explainVipActiveExclusion(row, { normalizedServiceType, isActive }),
  };
}

export function explainVipActiveExclusion(row, precomputed = {}) {
  if (!row) return "missing_row";

  if (row.admin_disabled) return "admin_disabled";

  const status = String(row.status || "").trim();
  const normalizedStatus = status.toLowerCase();

  if (INACTIVE_SUBSCRIPTION_STATUSES.has(status) || INACTIVE_SUBSCRIPTION_STATUSES.has(normalizedStatus)) {
    return `inactive_status:${status || "empty"}`;
  }

  if (!ACTIVE_SUBSCRIPTION_STATUSES.has(status) && !ACTIVE_SUBSCRIPTION_STATUSES.has(normalizedStatus)) {
    return `unknown_status:${status || "empty"}`;
  }

  const normalizedServiceType =
    precomputed.normalizedServiceType ??
    normalizeAdminUserServiceType(row, { sourceTable: "subscription_requests" });

  if (!isVipServiceType(normalizedServiceType)) {
    return `not_vip_service:${normalizedServiceType}`;
  }

  const isActive = precomputed.isActive ?? isActiveSubscriptionForDashboardStats(row);
  if (!isActive) return "inactive_row";

  return null;
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
  if (row.admin_disabled) return true;

  const status = String(row.status || "").trim();
  const normalized = status.toLowerCase();

  if (/expired|منته|انته|ended|inactive|غير|موقوف|ملغ|cancel|suspend|reject|rejected/.test(normalized)) {
    return true;
  }

  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return true;
  }

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
