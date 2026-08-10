import { partnerLogger } from "./partner-logger.js";

export async function capturePartnerMonitoringEvent({
  channel = "audit",
  event,
  level = "info",
  payload = {},
} = {}) {
  const record = {
    channel,
    event,
    level,
    payload,
    capturedAt: new Date().toISOString(),
  };

  partnerLogger.info(`monitor.${channel}.${event}`, record);

  return {
    hookReady: true,
    delivered: false,
    record,
  };
}

export async function capturePartnerSentryEvent(error, context = {}) {
  return capturePartnerMonitoringEvent({
    channel: "sentry",
    event: "exception",
    level: "error",
    payload: {
      message: error?.message || "Unknown partner error",
      stack: error?.stack || null,
      ...context,
    },
  });
}

export async function capturePartnerAnalyticsEvent(event, payload = {}) {
  return capturePartnerMonitoringEvent({
    channel: "analytics",
    event,
    payload,
  });
}

export async function writePartnerAuditLog(action, payload = {}) {
  return capturePartnerMonitoringEvent({
    channel: "audit",
    event: action,
    payload,
  });
}

export async function getPartnerHealthSnapshot(supabase) {
  const checks = {
    settings: false,
    tiers: false,
    commissionRules: false,
  };

  try {
    const [settings, tiers, rules] = await Promise.all([
      supabase.from("partner_program_settings").select("id").limit(1),
      supabase.from("partner_tiers").select("tier_key").eq("is_active", true).limit(1),
      supabase.from("partner_commission_rules").select("service_type").eq("is_active", true).limit(1),
    ]);

    checks.settings = !settings.error && Boolean(settings.data?.length);
    checks.tiers = !tiers.error && Boolean(tiers.data?.length);
    checks.commissionRules = !rules.error && Boolean(rules.data?.length);
  } catch (error) {
    partnerLogger.error("health.check_failed", { error });
  }

  const healthy = checks.settings && checks.tiers && checks.commissionRules;

  return {
    healthy,
    checks,
    timestamp: new Date().toISOString(),
  };
}
