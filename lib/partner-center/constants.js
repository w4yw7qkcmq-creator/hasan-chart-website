/** Canonical partner event types — extensible without schema redesign. */
export const PARTNER_EVENT_TYPES = Object.freeze({
  REFERRAL_CLICK: "referral_click",
  SIGNUP: "signup",
  VERIFIED_SIGNUP: "verified_signup",
  QUALIFIED_REFERRAL: "qualified_referral",
  SUBSCRIPTION_CREATED: "subscription_created",
  SUBSCRIPTION_ACTIVATED: "subscription_activated",
  PURCHASE: "purchase",
  REVENUE_CONFIRMED: "revenue_confirmed",
  REFUND: "refund",
  CHARGEBACK: "chargeback",
  COMMISSION_CREATED: "commission_created",
  REWARD_CREATED: "reward_created",
  REWARD_APPROVED: "reward_approved",
  REWARD_REVERSED: "reward_reversed",
  PAYOUT_REQUESTED: "payout_requested",
  PAYOUT_COMPLETED: "payout_completed",
});

export const PARTNER_EVENT_SOURCE_SYSTEMS = Object.freeze({
  API: "api",
  WORKER: "worker",
  WEBHOOK: "webhook",
  ADMIN: "admin",
  MIGRATION_BACKFILL: "migration_backfill",
  SYSTEM: "system",
});

export const ATTRIBUTION_POLICY = Object.freeze({
  FIRST_TOUCH: "first_touch",
});

/** Default attribution window — aligned with referral cookie max age. */
export const DEFAULT_ATTRIBUTION_WINDOW_SECONDS = 60 * 60 * 24 * 30;

export const QUALIFICATION_STATES = Object.freeze({
  SIGNUP: "signup",
  VERIFIED: "verified",
  QUALIFIED: "qualified",
  CUSTOMER: "customer",
  DISQUALIFIED: "disqualified",
});

export const VALID_QUALIFICATION_TRANSITIONS = Object.freeze({
  signup: new Set(["verified", "qualified", "disqualified"]),
  verified: new Set(["qualified", "disqualified"]),
  qualified: new Set(["customer", "disqualified"]),
  customer: new Set(["disqualified"]),
  disqualified: new Set(),
});

export const LEDGER_ENTRY_TYPES = Object.freeze({
  COMMISSION: "commission",
  MISSION_REWARD: "mission_reward",
  MILESTONE_REWARD: "milestone_reward",
  PERFORMANCE_BONUS: "performance_bonus",
  MANUAL_ADJUSTMENT: "manual_adjustment",
  REVERSAL: "reversal",
  PAYOUT: "payout",
});

export const LEDGER_ENTRY_DIRECTIONS = Object.freeze({
  CREDIT: "credit",
  DEBIT: "debit",
});

export const LEDGER_LIFECYCLE_STATUSES = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  PAYABLE: "payable",
  PAID: "paid",
  REVERSED: "reversed",
});

export const LEDGER_BALANCE_BUCKETS = Object.freeze({
  PENDING: "pending",
  WITHDRAWABLE: "withdrawable",
  BONUS_PENDING: "bonus_pending",
  PAID_OUT: "paid_out",
  EARNINGS_TOTAL: "earnings_total",
});

export const FRAUD_RISK_LEVELS = Object.freeze({
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  BLOCKED: "BLOCKED",
});

export const FRAUD_DECISIONS = Object.freeze({
  ALLOW: "allow",
  REVIEW: "review",
  BLOCK: "block",
});

export const FRAUD_SIGNAL_TYPES = Object.freeze({
  SELF_REFERRAL: "self_referral",
  DUPLICATE_ATTRIBUTION: "duplicate_attribution",
  VELOCITY_ANOMALY: "velocity_anomaly",
  RELATIONSHIP_ANOMALY: "relationship_anomaly",
  DUPLICATE_REWARD_ATTEMPT: "duplicate_reward_attempt",
});
