/**
 * Partner Center rollout flags — visibility/rollout only.
 * Must NOT bypass RLS, IAM, or financial security.
 */

function readFlag(name) {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function readPairedFlag(serverName, publicName) {
  const server = readFlag(serverName);
  const publicFlag = readFlag(publicName);
  if (server !== publicFlag && (server || publicFlag)) {
    const mismatch = `${serverName}=${server} vs ${publicName}=${publicFlag}`;
    if (process.env.NODE_ENV === "production") {
      console.error(`[partner-center] Feature flag mismatch — using server value: ${mismatch}`);
    }
  }
  return server || publicFlag;
}

export function isPartnerCenterV2UiEnabled() {
  return readPairedFlag("PARTNER_CENTER_V2_UI", "NEXT_PUBLIC_PARTNER_CENTER_V2_UI");
}

export function isPartnerGrowthEngineEnabled() {
  return readPairedFlag("PARTNER_GROWTH_ENGINE", "NEXT_PUBLIC_PARTNER_GROWTH_ENGINE");
}

export function isPartnerAdminMarketingEnabled() {
  return readPairedFlag("PARTNER_ADMIN_MARKETING", "NEXT_PUBLIC_PARTNER_ADMIN_MARKETING");
}

export function getPartnerCenterFlagConsistency() {
  const pairs = [
    ["PARTNER_CENTER_V2_UI", "NEXT_PUBLIC_PARTNER_CENTER_V2_UI"],
    ["PARTNER_GROWTH_ENGINE", "NEXT_PUBLIC_PARTNER_GROWTH_ENGINE"],
    ["PARTNER_ADMIN_MARKETING", "NEXT_PUBLIC_PARTNER_ADMIN_MARKETING"],
  ];
  const mismatches = [];
  for (const [serverName, publicName] of pairs) {
    const server = readFlag(serverName);
    const publicFlag = readFlag(publicName);
    if (server !== publicFlag && (server || publicFlag)) {
      mismatches.push({ serverName, publicName, server, public: publicFlag });
    }
  }
  return { consistent: mismatches.length === 0, mismatches };
}

export function getPartnerCenterFeatureFlags() {
  const consistency = getPartnerCenterFlagConsistency();
  return {
    PARTNER_CENTER_V2_UI: isPartnerCenterV2UiEnabled(),
    PARTNER_GROWTH_ENGINE: isPartnerGrowthEngineEnabled(),
    PARTNER_ADMIN_MARKETING: isPartnerAdminMarketingEnabled(),
    flagConsistency: consistency.consistent ? "ok" : "server_authoritative",
    ...(consistency.mismatches.length ? { flagMismatches: consistency.mismatches } : {}),
  };
}
