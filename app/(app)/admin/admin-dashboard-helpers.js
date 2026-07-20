export const ADMIN_STATUS_FILTERS = [
  ["pending", "بانتظار المراجعة"],
  ["reviewed", "تمت المراجعة"],
  ["all", "الكل"],
];

export const ADMIN_TABS = [
  { id: "overview", label: "نظرة عامة", icon: "📊" },
  { id: "analysis", label: "طلبات التحليل", icon: "🧠" },
  { id: "daily-publish", label: "نشر تحليل يومي", icon: "📝" },
  { id: "accounts", label: "إدارة الحسابات", icon: "📂" },
  { id: "subscriptions", label: "الاشتراكات", icon: "💳" },
  { id: "financial-center", label: "المركز المالي", icon: "💰" },
  { id: "user-management", label: "إدارة المستخدمين", icon: "👥" },
  { id: "vip", label: "نشر VIP", icon: "⭐" },
];

export const SIMPLE_STATUS_OPTIONS = [
  { value: "pending", label: "بانتظار المراجعة" },
  { value: "reviewed", label: "تمت المراجعة" },
];

const PENDING_STATUS_VALUES = new Set([
  "pending",
  "new",
  "reviewing",
  "قيد المراجعة",
  "بانتظار المراجعة",
  "جديد",
  "قيد المعالجة",
  "قيد التحليل",
]);

const REVIEWED_STATUS_VALUES = new Set([
  "reviewed",
  "approved",
  "completed",
  "تمت المراجعة",
  "تم الرد",
  "مكتمل",
  "مفعل",
  "تم التواصل",
  "قيد التفعيل",
  "نشط",
  "مرفوض",
  "مؤرشف",
  "مغلق",
  "بانتظار الدفع",
]);

export const ADMIN_ANALYSIS_LIMIT = 50;
export const ADMIN_USERS_LIMIT = 200;
export const ADMIN_SUBSCRIPTIONS_LIMIT = 50;

const normalizeAdminStatusValue = (status) => String(status || "").trim().toLowerCase();

export const getAdminStatusKey = (status) => {
  const raw = String(status || "").trim();
  const normalized = normalizeAdminStatusValue(status);

  if (!raw || PENDING_STATUS_VALUES.has(raw) || PENDING_STATUS_VALUES.has(normalized)) {
    return "pending";
  }

  if (REVIEWED_STATUS_VALUES.has(raw) || REVIEWED_STATUS_VALUES.has(normalized)) {
    return "reviewed";
  }

  return "pending";
};

export const getAdminStatusLabel = (status) => {
  if (status === "reviewed") return "تمت المراجعة";
  if (status === "pending") return "بانتظار المراجعة";
  return getAdminStatusKey(status) === "reviewed" ? "تمت المراجعة" : "بانتظار المراجعة";
};

export const matchesAdminStatusFilter = (status, filterKey) => {
  if (filterKey === "all") return true;
  return getAdminStatusKey(status) === filterKey;
};

export const countAdminStatusFilter = (list, filterKey, getStatus = (item) => item.status) =>
  list.filter((item) => matchesAdminStatusFilter(getStatus(item), filterKey)).length;

export const getSimpleStatusSelectValue = (status) => getAdminStatusKey(status);

const normalizeAdminSearch = (value) => String(value || "").trim().toLowerCase();

export const isValidPreviewUrl = (value) => {
  const src = String(value || "").trim();
  if (!src || src === "null" || src === "undefined" || src.startsWith("about:")) {
    return false;
  }
  return true;
};

export const matchesAdminSearch = (item, searchValue, fields) => {
  const query = normalizeAdminSearch(searchValue);
  if (!query) return true;

  return fields.some((field) => normalizeAdminSearch(item?.[field]).includes(query));
};

export const formatAnalysisRequest = (item) => ({
  id: item.id,
  userEmail: item.user_email,
  username: item.username,
  coin: item.coin,
  frame: item.frame,
  status: item.status || "قيد المراجعة",
  reply: item.reply || "",
  replyImage: item.reply_image || "",
  createdAt: item.created_at ? new Date(item.created_at).toLocaleString("ar") : "",
});

export const formatSubscriptionRequest = (item) => ({
  id: item.id,
  userEmail: item.user_email,
  username: item.username,
  planName: item.plan_name,
  category: item.category,
  price: item.price,
  telegramUsername: item.telegram_username || "",
  paymentProof: item.payment_proof || "",
  status: item.status || "قيد المعالجة",
  createdAt: item.created_at ? new Date(item.created_at).toLocaleString("ar") : "",
});

export const formatAccountManagementRequest = (item) => ({
  id: item.id,
  type: item.account_type || item.platform || "طلب إدارة حساب",
  platform: item.platform || "",
  email: item.email || "",
  telegram: item.contact_method || "",
  capital: item.capital || "",
  notes: item.notes || "",
  status: item.status || "جديد",
  createdAt: item.created_at ? new Date(item.created_at).toLocaleString("ar") : "",
  apiKey: item.has_sensitive_keys ? "محفوظ بشكل مشفر" : "",
  secretKey: item.has_sensitive_keys ? "محفوظ بشكل مشفر" : "",
  password: item.has_sensitive_keys ? "محفوظ بشكل مشفر" : "",
  hasSensitiveKeys: Boolean(item.has_sensitive_keys),
});
