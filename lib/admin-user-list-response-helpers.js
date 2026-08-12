export const ADMIN_USER_LIST_ALL_CAP = 1000;

export const ADMIN_USER_LIST_PROFILE_COLUMNS =
  "id,email,username,role,telegram,created_at,last_sign_in_at,user_classification,user_classification_source,user_classification_updated_at,effective_user_classification,effective_user_classification_source,effective_user_classification_at,subscription_plan,subscription_status,account_status,status_reason,status_updated_at,status_updated_by,suspended_at,banned_at,deleted_at";

export const ADMIN_USER_LIST_PROFILE_COLUMNS_BASIC =
  "id,email,username,role,telegram,created_at,subscription_plan,subscription_status,account_status,suspended_at,banned_at,deleted_at";

export const ADMIN_USER_LIST_SUBSCRIPTION_FLAG_COLUMNS =
  "user_email,plan_name,category,status,expires_at,admin_disabled";

export const ADMIN_USER_LIST_HEAVY_FIELD_DENYLIST = [
  "payment_proof",
  "paymentProof",
  "timeline",
  "notes",
  "communications",
  "audit",
  "base64",
  "imageUrl",
  "proof",
  "subscriptions",
  "activity",
  "emails",
  "payments",
  "management",
];

export function buildAdminUserListTruncationMeta({
  total = 0,
  returned = 0,
  cap = ADMIN_USER_LIST_ALL_CAP,
  listAll = false,
} = {}) {
  const normalizedTotal = Number(total) || 0;
  const normalizedReturned = Number(returned) || 0;
  const truncated = Boolean(listAll) && normalizedTotal > cap;

  if (!truncated) {
    return {
      truncated: false,
      total: normalizedTotal,
      returned: normalizedReturned,
      cap,
    };
  }

  return {
    truncated: true,
    total: normalizedTotal,
    returned: normalizedReturned,
    cap,
    warning: `تم عرض ${normalizedReturned} من ${normalizedTotal} مستخدم. الحد الأقصى الحالي ${cap} بدون pagination.`,
  };
}

export function estimateAdminUserListResponseBytes(payload = {}) {
  try {
    return Buffer.byteLength(JSON.stringify(payload), "utf8");
  } catch {
    return 0;
  }
}

export function assertAdminUserListRowIsLightweight(user = {}) {
  for (const key of ADMIN_USER_LIST_HEAVY_FIELD_DENYLIST) {
    if (Object.prototype.hasOwnProperty.call(user, key)) {
      throw new Error(`heavy list field detected: ${key}`);
    }
  }
  return true;
}

export function buildMockAdminUserListRow(index = 0) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    uid: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    email: `user${index}@example.com`,
    username: `user${index}`,
    avatarUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastSignInAt: "2026-07-01T12:00:00.000Z",
    accountStatus: "active",
    accountStatusLabel: "نشط",
    accountStatusIcon: "✅",
    statusReason: null,
    statusUpdatedAt: null,
    statusUpdatedBy: null,
    activeSubscriptionsCount: 1,
    role: "user",
    telegram: "",
    subscriptionPlan: "VIP Spot",
    subscriptionStatus: "نشط",
    activeServices: {
      vip: true,
      accountManagement: false,
      alerts: false,
    },
    expiredServiceTypes: [],
    activeServiceTypes: ["vip"],
    expiredSubscriptionTypes: [],
    expiredSubscriptionCount: 0,
    hasExpiredService: false,
    hasExpiredSubscription: false,
    activeSubscriptionCount: 1,
    hasActiveSubscription: true,
    inactiveAccountManagementCount: 0,
    hasInactiveAccountManagement: false,
    inactiveAlertCount: 0,
  };
}

export function benchmarkAdminUserListResponse(userCount = 96) {
  const startedAt = Date.now();
  const users = Array.from({ length: userCount }, (_, index) => buildMockAdminUserListRow(index + 1));
  users.forEach((row) => assertAdminUserListRowIsLightweight(row));

  const truncation = buildAdminUserListTruncationMeta({
    total: users.length,
    returned: users.length,
    listAll: true,
  });

  const payload = {
    success: true,
    users,
    listAll: true,
    pagination: {
      page: 1,
      pageSize: users.length,
      total: users.length,
      totalPages: 1,
    },
    truncation,
    durationMs: Date.now() - startedAt,
    responseBytes: estimateAdminUserListResponseBytes({ users, truncation }),
    listQueryFields: {
      profiles: ADMIN_USER_LIST_PROFILE_COLUMNS,
      subscriptionFlags: ADMIN_USER_LIST_SUBSCRIPTION_FLAG_COLUMNS,
      accountFlags: "user_id,status",
      alertFlags: "user_email,status",
    },
  };

  payload.responseBytes = estimateAdminUserListResponseBytes(payload);

  return {
    userCount: users.length,
    durationMs: Date.now() - startedAt,
    responseBytes: payload.responseBytes,
    fields: payload.listQueryFields,
    sampleUserKeys: Object.keys(users[0] || {}),
  };
}
