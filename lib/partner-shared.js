export const REFERRAL_COOKIE_NAME = "hc_referral_code";
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 60 * 24 * 60 * 60;
export const VISITOR_COOKIE_NAME = "hc_visitor_id";
export const VISITOR_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
export const SIGNUP_BONUS_AMOUNT = 0.2;

export const WITHDRAWAL_NETWORKS = ["TRC20", "BEP20", "ERC20", "TON"];
export const MIN_PARTNER_WITHDRAWAL_USDT = 10;

export const DEFAULT_SITE_URL = "https://www.hasanchartworld.com";

/** Production site URL for partner referral links and QR codes. */
export function getPartnerSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;

  if (configured) {
    return String(configured).replace(/\/$/, "");
  }

  return DEFAULT_SITE_URL;
}

/** Set to true when enough partners exist to show the public leaderboard. */
export const PARTNER_LEADERBOARD_UI_ENABLED = false;

export const PARTNER_LEADERBOARD_METRICS = [
  { key: "sales", label: "أعلى مبيعات" },
  { key: "commissions", label: "أعلى عمولات" },
  { key: "referrals", label: "أكثر إحالات" },
  { key: "active_accounts", label: "أكثر حسابات نشطة" },
  { key: "conversion", label: "أعلى معدل تحويل" },
];

const REFERRAL_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6,10}$/;

export function sanitizeReferralCode(value) {
  const code = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (code.length < 6 || code.length > 12) {
    return null;
  }

  return code;
}

export function isGeneratedReferralCode(code) {
  return REFERRAL_CODE_PATTERN.test(String(code || ""));
}

export function buildReferralLink(referralCode, siteOrigin) {
  const origin = String(siteOrigin || getPartnerSiteUrl()).replace(/\/$/, "");
  const code = sanitizeReferralCode(referralCode);

  if (!code) {
    return origin;
  }

  return `${origin}/?ref=${encodeURIComponent(code)}`;
}

export function buildShortReferralLink(referralCode, siteOrigin) {
  const origin = String(siteOrigin || getPartnerSiteUrl()).replace(/\/$/, "");
  const code = sanitizeReferralCode(referralCode);

  if (!code) {
    return origin;
  }

  return `${origin}/r/${encodeURIComponent(code)}`;
}

export function formatPartnerMoney(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "$0.00";
  }

  return `$${amount.toFixed(2)}`;
}

export function serviceTypeLabel(serviceType) {
  const map = {
    registration: "تسجيل مستخدم",
    vip_signal: "VIP Signals",
    vip_spot: "VIP Spot",
    vip_futures: "VIP Futures",
    account_management: "إدارة حسابات",
    academy: "الأكاديمية",
  };

  return map[serviceType] || serviceType || "—";
}

export function tierNameLabel(tierKey) {
  const map = {
    partner: "شريك",
    silver: "فضي",
    gold: "ذهبي",
    platinum: "بلاتيني",
    diamond: "ماسي",
  };

  return map[String(tierKey || "").toLowerCase()] || tierKey || "شريك";
}

export function withdrawalStatusLabel(status) {
  const map = {
    pending: "قيد المراجعة",
    approved: "معتمد",
    rejected: "مرفوض",
    paid: "مدفوع",
  };

  return map[status] || status || "—";
}

export function commissionStatusLabel(status) {
  const map = {
    pending: "معلق",
    pending_activation: "بانتظار التفعيل",
    approved: "معتمد",
    withdrawable: "قابل للسحب",
    rejected: "مرفوض",
    paid: "مدفوع",
  };

  return map[status] || status || "—";
}
