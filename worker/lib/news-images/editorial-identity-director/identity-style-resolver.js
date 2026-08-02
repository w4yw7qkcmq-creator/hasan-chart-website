const {
  SUBTITLE_BY_DOMAIN,
  SUBTITLE_BY_EVENT,
  HEADLINE_BY_EVENT,
  COLOR_LANGUAGE_BY_DOMAIN,
  IDENTITY_TONES,
  VISUAL_INTENSITY,
} = require("./config/editorial-tones");

function resolveEditorialSubtitle(domains = [], syntheticEventKey = "") {
  const key = syntheticEventKey.toUpperCase();
  if (SUBTITLE_BY_EVENT[key]) {
    return SUBTITLE_BY_EVENT[key];
  }

  for (const domain of domains) {
    if (SUBTITLE_BY_DOMAIN[domain]) {
      return SUBTITLE_BY_DOMAIN[domain];
    }
  }

  return "Macro Data";
}

function resolveHeadlineLines(syntheticEventKey = "", profile = {}) {
  const key = syntheticEventKey.toUpperCase();
  if (HEADLINE_BY_EVENT[key]) {
    return [...HEADLINE_BY_EVENT[key]];
  }
  return null;
}

function resolveColorLanguage(domains = []) {
  for (const domain of domains) {
    if (COLOR_LANGUAGE_BY_DOMAIN[domain]) {
      return {
        domain,
        ...COLOR_LANGUAGE_BY_DOMAIN[domain],
      };
    }
  }
  return {
    domain: "MACRO_ECONOMY",
    palette: COLOR_LANGUAGE_BY_DOMAIN.MACRO_ECONOMY.palette,
    saturation: COLOR_LANGUAGE_BY_DOMAIN.MACRO_ECONOMY.saturation,
    contrast: COLOR_LANGUAGE_BY_DOMAIN.MACRO_ECONOMY.contrast,
  };
}

function resolveIdentityTone(domains = [], coverageMode = "") {
  if (domains.includes("GEOPOLITICAL_MARKET_RISK") || domains.includes("GLOBAL_TRADE")) {
    return { key: "GEOPOLITICAL_SERIOUS", description: IDENTITY_TONES.GEOPOLITICAL_SERIOUS };
  }
  if (domains.includes("MARKET_VOLATILITY")) {
    return { key: "MARKET_ALERT", description: IDENTITY_TONES.MARKET_ALERT };
  }
  if (domains.includes("CRYPTO") || domains.includes("INSTITUTIONAL_FLOWS")) {
    return { key: "TECH_FINANCIAL", description: IDENTITY_TONES.TECH_FINANCIAL };
  }
  if (domains.includes("ENERGY")) {
    return { key: "INDUSTRIAL_DOCUMENTARY", description: IDENTITY_TONES.INDUSTRIAL_DOCUMENTARY };
  }
  if (domains.includes("CENTRAL_BANKS")) {
    return { key: "INSTITUTIONAL_CALM", description: IDENTITY_TONES.INSTITUTIONAL_CALM };
  }
  if (/MARKET_MOVE|COMMODITY_SHOCK|GEOPOLITICAL/.test(coverageMode)) {
    return { key: "MARKET_ALERT", description: IDENTITY_TONES.MARKET_ALERT };
  }
  return { key: "INFORMATIVE_CALM", description: IDENTITY_TONES.INFORMATIVE_CALM };
}

function resolveVisualIntensity(profile = {}, domains = [], syntheticEventKey = "") {
  const key = syntheticEventKey.toUpperCase();
  const importance = Number(profile.importance || 0);

  if (/HORMUZ|SUPPLY_DISRUPTION|SELLOFF|VOLATILITY/.test(key)) {
    return { level: "HIGH", guidance: VISUAL_INTENSITY.HIGH };
  }
  if (/FED|ECB|BOE|BOJ|RATE_DECISION|POWELL|LAGARDE/.test(key)) {
    return { level: "MEDIUM", guidance: VISUAL_INTENSITY.MEDIUM };
  }
  if (/CPI|NFP|PCE|GDP|RETAIL|EARNINGS/.test(key)) {
    return { level: importance >= 3 ? "MEDIUM" : "LOW", guidance: importance >= 3 ? VISUAL_INTENSITY.MEDIUM : VISUAL_INTENSITY.LOW };
  }
  if (domains.includes("MARKET_VOLATILITY") || domains.includes("GEOPOLITICAL_MARKET_RISK")) {
    return { level: "HIGH", guidance: VISUAL_INTENSITY.HIGH };
  }
  if (domains.includes("CENTRAL_BANKS")) {
    return { level: "MEDIUM", guidance: VISUAL_INTENSITY.MEDIUM };
  }
  return { level: "LOW", guidance: VISUAL_INTENSITY.LOW };
}

module.exports = {
  resolveEditorialSubtitle,
  resolveHeadlineLines,
  resolveColorLanguage,
  resolveIdentityTone,
  resolveVisualIntensity,
};
