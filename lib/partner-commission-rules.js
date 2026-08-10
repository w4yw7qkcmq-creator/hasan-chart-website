import { TIER_POLICIES } from "./partner-center/service-commission-constants.js";

export const DEFAULT_COMMISSION_PERCENT = 10;

export const COMMISSION_MODES = {
  FIXED: "fixed",
  PERCENT: "percent",
  PROFIT_SHARE: "profit_share",
};

export const RELEASE_POLICIES = {
  ON_SERVICE_ACTIVATION: "on_service_activation",
  ON_PROFIT_APPROVAL: "on_profit_approval",
  MANUAL: "manual",
};

export const DEFAULT_COMMISSION_RULES = {
  vip_signal: {
    service_type: "vip_signal",
    commission_percent: DEFAULT_COMMISSION_PERCENT,
    commission_mode: COMMISSION_MODES.PERCENT,
    fixed_amount: null,
    is_active: true,
    release_policy: RELEASE_POLICIES.ON_SERVICE_ACTIVATION,
    notes: "VIP Signals / Futures subscriptions",
    source_type: "vip_subscription",
    partner_counter: "vip_signal_count",
  },
  vip_spot: {
    service_type: "vip_spot",
    commission_percent: DEFAULT_COMMISSION_PERCENT,
    commission_mode: COMMISSION_MODES.PERCENT,
    fixed_amount: null,
    is_active: true,
    is_enabled: true,
    tier_policy: TIER_POLICIES.USE_PARTNER_TIER,
    release_policy: RELEASE_POLICIES.ON_SERVICE_ACTIVATION,
    notes: "VIP Spot subscriptions",
    source_type: "vip_subscription",
    partner_counter: "vip_spot_count",
  },
  vip_forex: {
    service_type: "vip_forex",
    commission_percent: DEFAULT_COMMISSION_PERCENT,
    commission_mode: COMMISSION_MODES.PERCENT,
    fixed_amount: null,
    is_active: true,
    is_enabled: true,
    tier_policy: TIER_POLICIES.USE_PARTNER_TIER,
    release_policy: RELEASE_POLICIES.ON_SERVICE_ACTIVATION,
    notes: "VIP Forex subscriptions",
    source_type: "vip_subscription",
    partner_counter: null,
  },
  account_management: {
    service_type: "account_management",
    commission_percent: DEFAULT_COMMISSION_PERCENT,
    commission_mode: COMMISSION_MODES.PROFIT_SHARE,
    fixed_amount: null,
    is_active: false,
    is_enabled: false,
    release_policy: RELEASE_POLICIES.ON_PROFIT_APPROVAL,
    notes: "Profit share after management profits approval",
    source_type: "account_management",
    partner_counter: "account_management_service_count",
    increment_active_accounts: true,
  },
  academy: {
    service_type: "academy",
    commission_percent: DEFAULT_COMMISSION_PERCENT,
    commission_mode: COMMISSION_MODES.PERCENT,
    fixed_amount: null,
    is_active: true,
    release_policy: RELEASE_POLICIES.ON_SERVICE_ACTIVATION,
    notes: "Academy paid services",
    source_type: "academy",
    partner_counter: "academy_count",
  },
  subscription: {
    service_type: "subscription",
    commission_percent: DEFAULT_COMMISSION_PERCENT,
    commission_mode: COMMISSION_MODES.PERCENT,
    fixed_amount: null,
    is_active: true,
    release_policy: RELEASE_POLICIES.ON_SERVICE_ACTIVATION,
    notes: "Generic paid subscriptions",
    source_type: "service",
    partner_counter: null,
  },
  future_service: {
    service_type: "future_service",
    commission_percent: DEFAULT_COMMISSION_PERCENT,
    commission_mode: COMMISSION_MODES.PERCENT,
    fixed_amount: null,
    is_active: true,
    release_policy: RELEASE_POLICIES.ON_SERVICE_ACTIVATION,
    notes: "Template for future services",
    source_type: "service",
    partner_counter: null,
  },
};

function normalizeRule(row) {
  const fallback =
    DEFAULT_COMMISSION_RULES[String(row?.service_type || "").toLowerCase()] || {};

  const isEnabled = row?.is_enabled ?? row?.is_active ?? fallback.is_enabled ?? fallback.is_active ?? true;

  return {
    id: row?.id || null,
    service_type: String(row?.service_type || fallback.service_type || "").toLowerCase(),
    commission_percent: Number(row?.commission_percent ?? fallback.commission_percent ?? DEFAULT_COMMISSION_PERCENT),
    commission_mode: row?.commission_mode || fallback.commission_mode || COMMISSION_MODES.PERCENT,
    fixed_amount:
      row?.fixed_amount == null ? fallback.fixed_amount ?? null : Number(row.fixed_amount),
    is_active: isEnabled,
    is_enabled: isEnabled,
    tier_policy: row?.tier_policy || fallback.tier_policy || TIER_POLICIES.USE_PARTNER_TIER,
    rule_version: Number(row?.rule_version ?? 1),
    display_name_ar: row?.display_name_ar || null,
    release_policy: row?.release_policy || fallback.release_policy || RELEASE_POLICIES.ON_SERVICE_ACTIVATION,
    notes: row?.notes || fallback.notes || null,
    source_type: fallback.source_type || "service",
    partner_counter: fallback.partner_counter || null,
    increment_active_accounts: Boolean(fallback.increment_active_accounts),
    initial_status:
      (row?.release_policy || fallback.release_policy) === RELEASE_POLICIES.ON_PROFIT_APPROVAL
        ? "pending"
        : "pending_activation",
  };
}

export async function loadPartnerCommissionRules(supabase) {
  const { data, error } = await supabase
    .from("partner_commission_rules")
    .select(
      "id, service_type, commission_percent, commission_mode, fixed_amount, is_active, is_enabled, tier_policy, rule_version, display_name_ar, release_policy, notes, status"
    )
    .eq("status", "active")
    .order("service_type", { ascending: true });

  if (error) {
    throw error;
  }

  if (!data?.length) {
    return Object.values(DEFAULT_COMMISSION_RULES).map((rule) => normalizeRule(rule));
  }

  return data.map((row) => normalizeRule(row));
}

export async function getPartnerCommissionRule(supabase, serviceType) {
  const key = String(serviceType || "").trim().toLowerCase();

  if (!key) {
    return null;
  }

  let query = supabase
    .from("partner_commission_rules")
    .select(
      "id, service_type, commission_percent, commission_mode, fixed_amount, is_active, is_enabled, tier_policy, rule_version, display_name_ar, release_policy, notes, status"
    )
    .eq("service_type", key);

  const { data, error } = await query.eq("status", "active").maybeSingle();

  if (error?.code === "42703") {
    const legacy = await supabase
      .from("partner_commission_rules")
      .select(
        "service_type, commission_percent, commission_mode, fixed_amount, is_active, release_policy, notes"
      )
      .eq("service_type", key)
      .maybeSingle();
    if (legacy.error) throw legacy.error;
    return legacy.data ? normalizeRule(legacy.data) : DEFAULT_COMMISSION_RULES[key]
      ? normalizeRule(DEFAULT_COMMISSION_RULES[key])
      : null;
  }

  if (error) {
    throw error;
  }

  if (data) {
    return normalizeRule(data);
  }

  const fallback = DEFAULT_COMMISSION_RULES[key];

  return fallback ? normalizeRule(fallback) : null;
}

export function registerDefaultCommissionRule(serviceType, overrides = {}) {
  const key = String(serviceType || "").trim().toLowerCase();

  DEFAULT_COMMISSION_RULES[key] = {
    ...DEFAULT_COMMISSION_RULES.future_service,
    service_type: key,
    ...overrides,
  };

  return DEFAULT_COMMISSION_RULES[key];
}
