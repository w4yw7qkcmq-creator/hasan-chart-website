import { SERVICE_COMMISSION_ARABIC_LABELS } from "../../../../lib/partner-center/service-commission-constants.js";

export { SERVICE_COMMISSION_ARABIC_LABELS };

export const AUDIT_ACTION_LABELS = Object.freeze({
  update: "تحديث",
  create: "إنشاء",
  delete: "حذف",
  activate: "تفعيل",
  deactivate: "إيقاف",
  pause: "إيقاف مؤقت",
  resume: "استئناف",
  complete: "إكمال",
  cancel: "إلغاء",
  publish: "نشر",
  reverse: "عكس",
  approve: "موافقة",
  reject: "رفض",
  hold: "تعليق",
  release: "تحرير",
  release_hold: "تحرير",
  keep_hold: "إبقاء على التعليق",
});

export const AUDIT_ENTITY_LABELS = Object.freeze({
  qualified_referral_reward_rule: "قاعدة مكافأة المستخدم المؤهل",
  service_commission_rule: "قاعدة عمولة خدمة",
  partner_commission_rule: "قاعدة عمولة خدمة",
  reward_entitlement: "استحقاق مكافأة",
  campaign: "حملة",
  campaign_program: "حملة",
  mission: "مهمة",
  partner_tier: "مستوى شريك",
  tier: "مستوى شريك",
  partner_reward: "مكافأة شريك",
  milestone: "معلم",
  performance_bonus_rule: "قاعدة مكافأة أداء",
});

export const TIER_POLICY_OPTIONS = Object.freeze([
  {
    value: "use_partner_tier",
    label: "حسب مستوى الشريك",
    description: "تُستخدم نسبة مستوى الشريك الحالية، مثل 10% للشريك و15% للفضي…",
  },
  {
    value: "fixed_service_rate",
    label: "نسبة ثابتة لهذه الخدمة",
    description: "يتم استخدام نسبة ثابتة لهذه الخدمة بغض النظر عن مستوى الشريك.",
  },
]);

export const RELEASE_POLICY_OPTIONS = Object.freeze([
  {
    value: "on_service_activation",
    label: "عند تفعيل الخدمة",
    description: "تصبح العمولة قابلة للتحرير وفق تدفق تفعيل الخدمة.",
  },
  {
    value: "on_profit_approval",
    label: "عند اعتماد الأرباح",
    description: "تُحرر العمولة بعد اعتماد الربح الفعلي.",
  },
  {
    value: "manual",
    label: "تحرير يدوي",
    description: "تبقى العمولة قيد الانتظار حتى يقوم مسؤول مخوّل بتحريرها.",
  },
]);

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

export function tierPolicyLabel(value) {
  const key = String(value || "").toLowerCase();
  return TIER_POLICY_OPTIONS.find((o) => o.value === key)?.label || value || "—";
}

export function releasePolicyLabel(value) {
  const key = String(value || "").toLowerCase();
  return RELEASE_POLICY_OPTIONS.find((o) => o.value === key)?.label || value || "—";
}

export function formatAuditStateSummary(state) {
  if (!state || typeof state !== "object") return "—";
  const parts = [];
  if (state.commissionPercent != null) parts.push(`النسبة: ${state.commissionPercent}%`);
  if (state.isEnabled != null) parts.push(state.isEnabled ? "مفعّلة" : "متوقفة");
  if (state.tierPolicy) parts.push(tierPolicyLabel(state.tierPolicy));
  if (state.releasePolicy) parts.push(releasePolicyLabel(state.releasePolicy));
  if (state.amount != null) parts.push(`المبلغ: ${state.amount}`);
  if (state.ruleVersion != null) parts.push(`v${state.ruleVersion}`);
  return parts.length ? parts.join(" · ") : "—";
}
