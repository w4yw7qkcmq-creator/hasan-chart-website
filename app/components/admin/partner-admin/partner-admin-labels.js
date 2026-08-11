import { SERVICE_COMMISSION_ARABIC_LABELS } from "../../../../lib/partner-center/service-commission-constants.js";

export { SERVICE_COMMISSION_ARABIC_LABELS };

export const AUDIT_ACTION_LABELS = Object.freeze({
  update: "تحديث",
  create: "إنشاء",
  delete: "حذف",
  activate: "تفعيل",
  deactivate: "إيقاف",
  publish: "نشر",
  reverse: "عكس",
  approve: "موافقة",
  reject: "رفض",
});

export const AUDIT_ENTITY_LABELS = Object.freeze({
  qualified_referral_reward_rule: "قاعدة مكافأة المستخدم المؤهل",
  service_commission_rule: "قاعدة عمولة خدمة",
  partner_commission_rule: "قاعدة عمولة",
  campaign: "حملة",
  mission: "مهمة",
  partner_tier: "مستوى شريك",
  partner_reward: "مكافأة شريك",
});

export const TIER_VISUAL = Object.freeze({
  partner: { icon: "🤝", className: "pa-tier--partner", order: 1 },
  silver: { icon: "🥈", className: "pa-tier--silver", order: 2 },
  gold: { icon: "🥇", className: "pa-tier--gold", order: 3 },
  platinum: { icon: "💎", className: "pa-tier--platinum", order: 4 },
  diamond: { icon: "👑", className: "pa-tier--diamond", order: 5 },
});

export const RISK_LEVEL_LABELS = Object.freeze({
  high: "عالي",
  medium: "متوسط",
  low: "منخفض",
  blocked: "محظور",
  critical: "حرج",
});

export function auditActionLabel(action) {
  return AUDIT_ACTION_LABELS[String(action || "").toLowerCase()] || action || "—";
}

export function auditEntityLabel(entityType) {
  return AUDIT_ENTITY_LABELS[String(entityType || "").toLowerCase()] || entityType || "—";
}

export function formatShortUuid(value) {
  const id = String(value || "").trim();
  if (!id) return "—";
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export function formatAuditDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function serviceLabel(serviceType, displayNameAr) {
  const key = String(serviceType || "").toLowerCase();
  return displayNameAr || SERVICE_COMMISSION_ARABIC_LABELS[key] || serviceType || "—";
}

export function riskLevelLabel(level) {
  const key = String(level || "").toLowerCase();
  return RISK_LEVEL_LABELS[key] || level || "—";
}
