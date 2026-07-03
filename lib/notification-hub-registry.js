import {
  NOTIFICATION_SOUND_KEY_LABELS_AR,
  NOTIFICATION_SOUND_KEY_ORDER,
  NOTIFICATION_SOUND_KEYS,
  normalizeNotificationKey,
} from "./notification-sound-keys.js";
import { resolveNotificationCenterKeyFromSiteType } from "./notification-center-shared.js";
import { normalizeNotification } from "./notifications-shared.js";

export const NOTIFICATION_HUB_REGISTRY = {
  [NOTIFICATION_SOUND_KEYS.PRICE_ALERT]: {
    icon: "🔔",
    color: "#22d3ee",
    badge: "تنبيه",
    titleFormatter: ({ title, message }) => title || `تنبيه سعر: ${message || ""}`.trim(),
  },
  [NOTIFICATION_SOUND_KEYS.VIP_SIGNAL]: {
    icon: "⭐",
    color: "#fbbf24",
    badge: "VIP",
    titleFormatter: ({ title }) => title || "توصية VIP جديدة",
  },
  [NOTIFICATION_SOUND_KEYS.BREAKING_NEWS]: {
    icon: "📰",
    color: "#f87171",
    badge: "عاجل",
    titleFormatter: ({ title }) => title || "خبر عاجل",
  },
  [NOTIFICATION_SOUND_KEYS.ADMIN]: {
    icon: "🛡️",
    color: "#a78bfa",
    badge: "إدارة",
    titleFormatter: ({ title }) => title || "إشعار لوحة الإدارة",
  },
  [NOTIFICATION_SOUND_KEYS.SYSTEM]: {
    icon: "⚙️",
    color: "#94a3b8",
    badge: "نظام",
    titleFormatter: ({ title }) => title || "إشعار النظام",
  },
  [NOTIFICATION_SOUND_KEYS.ANALYSIS_REQUEST]: {
    icon: "📝",
    color: "#38bdf8",
    badge: "طلب تحليل",
    titleFormatter: ({ title }) => title || "طلب تحليل جديد",
  },
  [NOTIFICATION_SOUND_KEYS.ANALYSIS_REPLY]: {
    icon: "🧠",
    color: "#34d399",
    badge: "رد تحليل",
    titleFormatter: ({ title }) => title || "رد على طلب التحليل",
  },
  [NOTIFICATION_SOUND_KEYS.SUBSCRIPTION_REQUEST]: {
    icon: "💳",
    color: "#60a5fa",
    badge: "اشتراك",
    titleFormatter: ({ title }) => title || "طلب اشتراك",
  },
  [NOTIFICATION_SOUND_KEYS.SUBSCRIPTION_EXPIRY]: {
    icon: "⏳",
    color: "#fb923c",
    badge: "انتهاء",
    titleFormatter: ({ title }) => title || "تنبيه انتهاء الاشتراك",
  },
  [NOTIFICATION_SOUND_KEYS.ACCOUNT_MANAGEMENT]: {
    icon: "📂",
    color: "#c084fc",
    badge: "حساب",
    titleFormatter: ({ title }) => title || "إدارة الحساب",
  },
  [NOTIFICATION_SOUND_KEYS.MARKET_NEWS]: {
    icon: "📈",
    color: "#4ade80",
    badge: "سوق",
    titleFormatter: ({ title }) => title || "خبر سوق",
  },
};

export function getNotificationHubKeyDefinitions() {
  return NOTIFICATION_SOUND_KEY_ORDER.map((key) => ({
    key,
    label: NOTIFICATION_SOUND_KEY_LABELS_AR[key] || key,
    ...NOTIFICATION_HUB_REGISTRY[key],
  }));
}

export function resolveHubNotificationKey(notification = {}) {
  return normalizeNotificationKey(
    notification.notificationKey ||
      notification.notification_key ||
      resolveNotificationCenterKeyFromSiteType(notification.type)
  );
}

export function getNotificationHubPresentation(notification = {}) {
  const key = resolveHubNotificationKey(notification);
  const config =
    NOTIFICATION_HUB_REGISTRY[key] || NOTIFICATION_HUB_REGISTRY[NOTIFICATION_SOUND_KEYS.SYSTEM];
  const fallback = NOTIFICATION_HUB_REGISTRY[NOTIFICATION_SOUND_KEYS.SYSTEM];

  return {
    key,
    icon: config?.icon || fallback.icon,
    color: config?.color || fallback.color,
    badge: config?.badge || fallback.badge,
    displayTitle: (config?.titleFormatter || fallback.titleFormatter)({
      title: notification.title,
      message: notification.message,
    }),
  };
}

export function enrichHubNotification(raw = {}) {
  const normalized =
    raw.id && raw.title !== undefined
      ? raw.href !== undefined
        ? raw
        : normalizeNotification(raw)
      : normalizeNotification(raw);

  if (!normalized) return null;

  const presentation = getNotificationHubPresentation(normalized);

  return {
    ...normalized,
    notificationKey: presentation.key,
    hubIcon: presentation.icon,
    hubColor: presentation.color,
    hubBadge: presentation.badge,
    displayTitle: presentation.displayTitle,
    isPinned: Boolean(normalized.isPinned ?? normalized.is_pinned),
  };
}

export function formatRelativeNotificationTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} دقيقة`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "منذ ساعة" : `منذ ${hours} ساعة`;

  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? "منذ يوم" : `منذ ${days} يوم`;

  return new Intl.DateTimeFormat("ar-SY-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Damascus",
  }).format(date);
}

export function sortHubNotifications(items = []) {
  return [...items].sort((left, right) => {
    const pinDelta = Number(Boolean(right.isPinned)) - Number(Boolean(left.isPinned));
    if (pinDelta !== 0) return pinDelta;

    return (
      new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()
    );
  });
}

export function matchesHubFilters(notification, { search = "", key = "all", read = "all" } = {}) {
  if (!notification) return false;

  if (read === "unread" && notification.isRead) return false;
  if (read === "read" && !notification.isRead) return false;

  if (key !== "all" && resolveHubNotificationKey(notification) !== normalizeNotificationKey(key)) {
    return false;
  }

  const query = String(search || "").trim().toLowerCase();
  if (!query) return true;

  const haystack = [
    notification.title,
    notification.message,
    notification.displayTitle,
    notification.hubBadge,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}
