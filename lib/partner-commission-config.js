import {
  DEFAULT_COMMISSION_RULES,
  registerDefaultCommissionRule,
} from "./partner-commission-rules";

export const DEFAULT_SERVICE_COMMISSION_PERCENT = 10;

export {
  COMMISSION_MODES,
  DEFAULT_COMMISSION_PERCENT,
  DEFAULT_COMMISSION_RULES,
  RELEASE_POLICIES,
  getPartnerCommissionRule,
  loadPartnerCommissionRules,
  registerDefaultCommissionRule,
} from "./partner-commission-rules";

export function parseSubscriptionPrice(value) {
  const amount = Number(String(value || "").replace(/[^0-9.]/g, ""));

  if (!Number.isFinite(amount) || amount < 0) {
    return 0;
  }

  return amount;
}

export function resolveSubscriptionServiceType(category, planName) {
  const text = `${category || ""} ${planName || ""}`.toLowerCase();

  if (text.includes("spot") || text.includes("سبوت")) {
    return "vip_spot";
  }

  if (
    text.includes("future") ||
    text.includes("futures") ||
    text.includes("فيوتشر") ||
    text.includes("signal")
  ) {
    return "vip_signal";
  }

  return "vip_signal";
}

export function registerPartnerService(serviceType, config = {}) {
  return registerDefaultCommissionRule(serviceType, {
    commission_percent: config.percent ?? DEFAULT_SERVICE_COMMISSION_PERCENT,
    commission_mode: config.variableAmount ? "profit_share" : "percent",
    notes: config.reason || "Custom service",
    source_type: config.sourceType || "service",
    partner_counter: config.partnerCounter || null,
    increment_active_accounts: Boolean(config.incrementActiveAccounts),
  });
}

export function getPartnerServiceConfig(serviceType) {
  const key = String(serviceType || "").trim().toLowerCase();
  return DEFAULT_COMMISSION_RULES[key] || null;
}
