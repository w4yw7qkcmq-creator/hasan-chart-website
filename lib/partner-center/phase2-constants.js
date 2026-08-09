/** Phase 2 growth engine constants — missions, levels, campaigns, rewards. */

export const PARTNER_BUSINESS_TIMEZONE = "Asia/Baghdad";

export const MISSION_TYPES = Object.freeze({
  QUALIFIED_REFERRALS_COUNT: "qualified_referrals_count",
  CUSTOMERS_COUNT: "customers_count",
  REVENUE_AMOUNT: "revenue_amount",
  SUBSCRIPTIONS_COUNT: "subscriptions_count",
  CAMPAIGN_CONVERSIONS: "campaign_conversions",
  CONVERSION_RATE: "conversion_rate",
  FIRST_CUSTOMER: "first_customer",
  STREAK_PERIOD: "streak_period",
  CUSTOM_RULE: "custom_rule",
});

export const MISSION_STATUSES = Object.freeze({
  DRAFT: "draft",
  ACTIVE: "active",
  PAUSED: "paused",
  ENDED: "ended",
});

export const MISSION_PROGRESS_STATUSES = Object.freeze({
  ELIGIBLE: "eligible",
  ACTIVE: "active",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  REWARD_PENDING: "reward_pending",
  REWARD_APPROVED: "reward_approved",
  REWARD_CREDITED: "reward_credited",
  EXPIRED: "expired",
  DISQUALIFIED: "disqualified",
});

export const REWARD_SOURCE_TYPES = Object.freeze({
  MISSION: "mission",
  MILESTONE: "milestone",
  PERFORMANCE_BONUS: "performance_bonus",
});

export const REWARD_ENTITLEMENT_STATUSES = Object.freeze({
  EARNED: "earned",
  PENDING: "pending",
  RISK_HOLD: "risk_hold",
  APPROVED: "approved",
  PAYABLE: "payable",
  PAID: "paid",
  REVERSED: "reversed",
  REWARD_CREDITED: "reward_credited",
});

export const PERIOD_TYPES = Object.freeze({
  ONCE: "once",
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  CUSTOM: "custom",
});

export const CAMPAIGN_PROGRAM_STATUSES = Object.freeze({
  DRAFT: "draft",
  ACTIVE: "active",
  PAUSED: "paused",
  ENDED: "ended",
});

export const ALLOWED_LANDING_PATHS = Object.freeze([
  "/",
  "/pricing",
  "/vip",
  "/signals",
  "/register",
  "/partner",
]);

export const LEADERBOARD_METRICS = Object.freeze({
  CONFIRMED_REVENUE: "confirmed_revenue",
  CUSTOMERS: "customers",
  QUALIFIED_REFERRALS: "qualified_referrals",
  GROWTH_RATE: "growth_rate",
});

export const LEVEL_CHANGE_REASONS = Object.freeze({
  AUTO_UPGRADE: "auto_upgrade",
  AUTO_DOWNGRADE: "auto_downgrade",
  ADMIN_OVERRIDE: "admin_override",
  METRICS_RECOMPUTE: "metrics_recompute",
});
