/** Phase 2 growth engine constants — missions, levels, campaigns, rewards. */

export const PARTNER_BUSINESS_TIMEZONE = "Asia/Baghdad";

export const MISSION_TYPES = Object.freeze({
  QUALIFIED_REFERRALS_COUNT: "qualified_referrals_count",
  QUALIFIED_REFERRALS_IN_PERIOD: "qualified_referrals_in_period",
  CUSTOMERS_COUNT: "customers_count",
  REVENUE_AMOUNT: "revenue_amount",
  SUBSCRIPTIONS_COUNT: "subscriptions_count",
  CAMPAIGN_CONVERSIONS: "campaign_conversions",
  CONVERSION_RATE: "conversion_rate",
  FIRST_CUSTOMER: "first_customer",
  STREAK_PERIOD: "streak_period",
  CUSTOM_RULE: "custom_rule",
  SERVICE_SALES_COUNT: "service_sales_count",
  SERVICE_SALES_AMOUNT: "service_sales_amount",
  SMART_LINK_CONVERSIONS: "smart_link_conversions",
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
  CAMPAIGN_LIFETIME: "campaign_lifetime",
});

export const CAMPAIGN_PROGRAM_STATUSES = Object.freeze({
  DRAFT: "draft",
  SCHEDULED: "scheduled",
  ACTIVE: "active",
  PAUSED: "paused",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  /** @deprecated use COMPLETED — normalized at read time */
  ENDED: "ended",
});

export const AUDIENCE_MODES = Object.freeze({
  ALL_PARTNERS: "all_partners",
  TIERS: "tiers",
  NEW_PARTNERS: "new_partners",
  ACTIVE_PARTNERS: "active_partners",
  SELECTED_PARTNERS: "selected_partners",
});

export const CAMPAIGN_AUDIT_ACTIONS = Object.freeze({
  CREATE: "create",
  UPDATE: "update",
  CREATE_VERSION: "create_version",
  SCHEDULE: "schedule",
  ACTIVATE: "activate",
  PAUSE: "pause",
  RESUME: "resume",
  COMPLETE: "complete",
  CANCEL: "cancel",
  DELETE: "delete",
});

export const REWARD_MIN = 0.01;
export const REWARD_MAX = 100;

export const TIER_ORDER = Object.freeze([
  "partner",
  "silver",
  "gold",
  "platinum",
  "diamond",
]);

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
