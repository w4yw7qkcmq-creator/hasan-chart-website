export const TIER_POLICIES = Object.freeze({
  USE_PARTNER_TIER: "use_partner_tier",
  FIXED_SERVICE_RATE: "fixed_service_rate",
});

export const SERVICE_COMMISSION_ARABIC_LABELS = Object.freeze({
  vip_signal: "VIP الإشارات",
  vip_spot: "VIP سبوت",
  vip_forex: "VIP فوركس",
  academy: "الأكاديمية",
  subscription: "الاشتراكات",
  future_service: "خدمات مستقبلية",
  account_management: "إدارة الحسابات",
});

export const ALLOWED_RELEASE_POLICIES = Object.freeze([
  "on_service_activation",
  "on_profit_approval",
  "manual",
]);

export const ALLOWED_COMMISSION_MODES = Object.freeze(["percent", "fixed", "profit_share"]);
