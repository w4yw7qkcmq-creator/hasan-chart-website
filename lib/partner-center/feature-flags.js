/**
 * Partner Center rollout flags — visibility/rollout only.
 * Must NOT bypass RLS, IAM, or financial security.
 */

function readFlag(name) {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function isPartnerCenterV2UiEnabled() {
  return (
    readFlag("PARTNER_CENTER_V2_UI") ||
    readFlag("NEXT_PUBLIC_PARTNER_CENTER_V2_UI")
  );
}

export function isPartnerGrowthEngineEnabled() {
  return (
    readFlag("PARTNER_GROWTH_ENGINE") ||
    readFlag("NEXT_PUBLIC_PARTNER_GROWTH_ENGINE")
  );
}

export function isPartnerAdminMarketingEnabled() {
  return (
    readFlag("PARTNER_ADMIN_MARKETING") ||
    readFlag("NEXT_PUBLIC_PARTNER_ADMIN_MARKETING")
  );
}

export function getPartnerCenterFeatureFlags() {
  return {
    PARTNER_CENTER_V2_UI: isPartnerCenterV2UiEnabled(),
    PARTNER_GROWTH_ENGINE: isPartnerGrowthEngineEnabled(),
    PARTNER_ADMIN_MARKETING: isPartnerAdminMarketingEnabled(),
  };
}
