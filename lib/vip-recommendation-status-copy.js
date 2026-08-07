import {
  getVipSiteNotificationType,
  normalizeVipSignalType,
  signalTypeLabel,
} from "./vip-signal-types.js";

export const VIP_STATUS_EVENT_TYPES = Object.freeze([
  "target_1_hit",
  "target_2_hit",
  "close_now",
]);

export const VIP_STATUS_EVENT_LABELS_AR = Object.freeze({
  target_1_hit: "تم تحقيق الهدف الأول بنجاح",
  target_2_hit: "تم تحقيق الهدف الثاني بنجاح",
  close_now: "إغلاق الآن فوري",
});

export function normalizeTradeStatus(value) {
  const text = String(value || "").trim().toLowerCase();

  if (
    text === "target_1_hit" ||
    text === "target_2_hit" ||
    text === "closed_immediately" ||
    text === "completed" ||
    text === "cancelled" ||
    text === "active"
  ) {
    return text;
  }

  if (text === "نشطة" || text === "active") {
    return "active";
  }

  return text || "active";
}

export function tradeStatusLabelAr(tradeStatus) {
  const normalized = normalizeTradeStatus(tradeStatus);

  switch (normalized) {
    case "target_1_hit":
      return "الهدف الأول تحقق";
    case "target_2_hit":
      return "الهدف الثاني تحقق";
    case "closed_immediately":
      return "إغلاق فوري";
    case "completed":
      return "مكتملة";
    case "cancelled":
      return "ملغاة";
    default:
      return "نشطة";
  }
}

export function mapEventToTradeStatus(eventType) {
  switch (eventType) {
    case "target_1_hit":
      return "target_1_hit";
    case "target_2_hit":
      return "target_2_hit";
    case "close_now":
      return "closed_immediately";
    default:
      throw new Error(`Unsupported event type: ${eventType}`);
  }
}

export function buildVipStatusNotificationCopy(eventType, signal) {
  const symbol = String(signal?.coin || "العملة").trim().toUpperCase();
  const normalizedType = normalizeVipSignalType(signal?.signal_type);
  const label = signalTypeLabel(normalizedType);
  const siteType = getVipSiteNotificationType(normalizedType);

  if (eventType === "target_1_hit") {
    return {
      title: "🎯 تم تحقيق الهدف الأول بنجاح",
      message: `تم تحقيق الهدف الأول لتوصية ${symbol} بنجاح.\nيمكنك متابعة الصفقة وفق تفاصيل التوصية وإدارة المخاطر الخاصة بك.`,
      subject: `HasaN CharT World — تم تحقيق الهدف الأول لـ ${symbol}`,
      siteType,
      notificationKey: "vip_signal",
      eventTypeKey: "vip_target_1_hit",
    };
  }

  if (eventType === "target_2_hit") {
    return {
      title: "🏆 تم تحقيق الهدف الثاني بنجاح",
      message: `تم تحقيق الهدف الثاني لتوصية ${symbol} بنجاح.\nنبارك لمشتركي HasaN CharT World هذه النتيجة.`,
      subject: `HasaN CharT World — تم تحقيق الهدف الثاني لـ ${symbol}`,
      siteType,
      notificationKey: "vip_signal",
      eventTypeKey: "vip_target_2_hit",
    };
  }

  return {
    title: "🚨 إغلاق الصفقة الآن",
    message: `يرجى إغلاق توصية ${symbol} الآن وفق تحديث فريق HasaN CharT World.\nلا تنتظر وصول أهداف إضافية.`,
    subject: `HasaN CharT World — إغلاق توصية ${symbol} الآن`,
    siteType,
    notificationKey: "vip_signal",
    eventTypeKey: "vip_close_now",
    tradeTypeLabel: label,
  };
}

export function validateStatusTransition(currentStatus, eventType) {
  const status = normalizeTradeStatus(currentStatus);

  if (status === "closed_immediately" || status === "completed" || status === "cancelled") {
    return { allowed: false, reason: "الصفقة مغلقة ولا يمكن تحديث حالتها" };
  }

  if (eventType === "target_1_hit") {
    if (status === "target_1_hit" || status === "target_2_hit") {
      return { allowed: false, reason: "تم إرسال تحديث الهدف الأول مسبقًا" };
    }
    return { allowed: true };
  }

  if (eventType === "target_2_hit") {
    if (status === "target_2_hit") {
      return { allowed: false, reason: "تم إرسال تحديث الهدف الثاني مسبقًا" };
    }
    if (status !== "target_1_hit") {
      return { allowed: false, reason: "يجب تحقيق الهدف الأول قبل الهدف الثاني" };
    }
    return { allowed: true };
  }

  if (eventType === "close_now") {
    return { allowed: true };
  }

  return { allowed: false, reason: "حدث غير مدعوم" };
}
