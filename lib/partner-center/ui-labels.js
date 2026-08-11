/** Arabic UI labels for Partner Center Phase 3 — no raw DB enums exposed. */

export const MISSION_UI_STATUS = Object.freeze({
  available: "متاحة",
  in_progress: "قيد التنفيذ",
  completed: "مكتملة",
  reward_pending: "المكافأة قيد المراجعة",
  reward_credited: "تمت إضافة المكافأة",
  expired: "انتهت",
  ineligible: "غير مؤهل",
  disqualified: "غير مؤهل",
});

export const REWARD_UI_STATUS = Object.freeze({
  earned: "تم الاستحقاق",
  pending: "قيد المعالجة",
  risk_hold: "قيد المراجعة",
  reward_credited: "أضيفت إلى الرصيد المعلق",
  approved: "معتمدة",
  payable: "متاحة للسحب",
  paid: "تم الدفع",
  reversed: "تم عكسها",
});

export const LEDGER_UI_TYPE = Object.freeze({
  commission: "عمولة",
  mission_reward: "مكافأة مهمة",
  milestone_reward: "مكافأة إنجاز",
  performance_bonus: "مكافأة أداء",
  signup_bonus: "مكافأة تسجيل",
  reversal: "عكس",
  manual_adjustment: "تعديل",
  payout: "سحب",
});

export const CAMPAIGN_UI_STATUS = Object.freeze({
  draft: "مسودة",
  scheduled: "مجدولة",
  active: "نشطة",
  paused: "متوقفة",
  ended: "منتهية",
  completed: "مكتملة",
  cancelled: "ملغاة",
  future: "قادمة",
  expired: "منتهية",
});

export function missionStatusLabel(status, { eligible = true } = {}) {
  if (!eligible) return MISSION_UI_STATUS.ineligible;
  return MISSION_UI_STATUS[status] || status || "—";
}

export function rewardStatusLabel(status, { payoutHold = false } = {}) {
  if (payoutHold || status === "risk_hold") return REWARD_UI_STATUS.risk_hold;
  return REWARD_UI_STATUS[status] || status || "—";
}

export function ledgerTypeLabel(entryType) {
  return LEDGER_UI_TYPE[entryType] || entryType || "—";
}

export function campaignStatusLabel(status, { withinWindow = true, lifecycle = null } = {}) {
  if (lifecycle === "scheduled") return CAMPAIGN_UI_STATUS.scheduled;
  if (lifecycle === "completed") return CAMPAIGN_UI_STATUS.completed;
  if (lifecycle === "cancelled") return CAMPAIGN_UI_STATUS.cancelled;
  if (!withinWindow && status === "active") return CAMPAIGN_UI_STATUS.expired;
  return CAMPAIGN_UI_STATUS[status] || status || "—";
}

export function formatCountdownAr(targetIso, { now = new Date() } = {}) {
  if (!targetIso) return null;
  const target = new Date(targetIso);
  if (Number.isNaN(target.getTime())) return null;
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return "انتهى الوقت";
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} يوم ${hours} ساعة`;
  if (hours > 0) return `${hours} ساعة ${minutes} دقيقة`;
  return `${minutes} دقيقة`;
}

export const AUDIENCE_MODE_LABELS = Object.freeze({
  all: "جميع الشركاء",
  tier_min: "حد أدنى للمستوى",
  selected_partners: "شركاء محددون",
});

export function safePercent(numerator, denominator) {
  const n = Number(numerator || 0);
  const d = Number(denominator || 0);
  if (d <= 0) return 0;
  return Math.round((n / d) * 1000) / 10;
}

export function maskPartnerDisplay(referralCode) {
  const code = String(referralCode || "").trim();
  if (code.length <= 4) return "Partner ***";
  return `Partner ${code.slice(0, 4)}***`;
}
