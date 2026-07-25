import { isPendingAnalysisStatus } from "./admin-status-constants.js";

function isPendingSubscriptionStatus(status) {
  const raw = String(status || "").trim();
  const normalized = raw.toLowerCase();

  return (
    !raw ||
    normalized === "pending" ||
    normalized === "new" ||
    raw === "بانتظار المراجعة" ||
    raw === "قيد المعالجة" ||
    raw === "جديد"
  );
}

function isPendingAccountStatus(status) {
  const raw = String(status || "").trim();
  const normalized = raw.toLowerCase();

  return !raw || normalized === "new" || raw === "جديد" || raw === "بانتظار المراجعة";
}

function sortByCreatedAtDesc(items) {
  return [...items].sort(
    (a, b) => new Date(b.createdAtRaw || 0).getTime() - new Date(a.createdAtRaw || 0).getTime()
  );
}

export function buildAdminNotificationsFeed({
  analysis = [],
  subscriptions = [],
  accounts = [],
  withdrawals = [],
} = {}) {
  const analysisItems = (analysis || [])
    .filter((item) => isPendingAnalysisStatus(item.status))
    .map((item) => ({
      id: `analysis-${item.id}`,
      type: "analysis",
      icon: "🧠",
      title: "طلب تحليل جديد",
      message: `${item.coin || "عملة"} — ${item.user_email || item.username || "مستخدم"}`,
      createdAtRaw: item.created_at || null,
      createdAt: item.created_at ? new Date(item.created_at).toLocaleString("ar") : "",
      targetTab: "analysis",
      targetId: item.id,
    }));

  const subscriptionItems = (subscriptions || [])
    .filter((item) => isPendingSubscriptionStatus(item.status))
    .map((item) => ({
      id: `subscription-${item.id}`,
      type: "subscription",
      icon: "💳",
      title: "طلب اشتراك جديد",
      message: `${item.plan_name || item.category || "اشتراك"} — ${item.user_email || item.username || "مستخدم"}`,
      createdAtRaw: item.created_at || null,
      createdAt: item.created_at ? new Date(item.created_at).toLocaleString("ar") : "",
      targetTab: "subscriptions",
      targetId: item.id,
    }));

  const accountItems = (accounts || [])
    .filter((item) => isPendingAccountStatus(item.status))
    .map((item) => ({
      id: `account-${item.id}`,
      type: "account",
      icon: "📂",
      title: "طلب إدارة حساب جديد",
      message: item.email || item.contact_method || "طلب جديد",
      createdAtRaw: item.created_at || null,
      createdAt: item.created_at ? new Date(item.created_at).toLocaleString("ar") : "",
      targetTab: "accounts",
      targetId: item.id,
    }));

  const withdrawalItems = (withdrawals || [])
    .filter((item) => String(item.status || "").trim() === "pending")
    .map((item) => ({
      id: `withdrawal-${item.id}`,
      type: "withdrawal",
      icon: "💸",
      title: "طلب سحب شريك جديد",
      message: `${item.amountLabel || item.amount || "—"} USDT — ${item.partnerLabel || item.partner_email || "شريك"}`,
      createdAtRaw: item.created_at || item.createdAt || null,
      createdAt: item.created_at
        ? new Date(item.created_at).toLocaleString("ar")
        : item.createdAt
          ? new Date(item.createdAt).toLocaleString("ar")
          : "",
      targetTab: "partners",
      targetId: item.id,
      url: "/admin/partners",
    }));

  return sortByCreatedAtDesc([
    ...analysisItems,
    ...subscriptionItems,
    ...accountItems,
    ...withdrawalItems,
  ]).slice(0, 30);
}
