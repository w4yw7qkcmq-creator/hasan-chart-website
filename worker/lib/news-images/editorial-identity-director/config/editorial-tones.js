const SUBTITLE_BY_DOMAIN = {
  MACRO_ECONOMY: "Macro Data",
  CENTRAL_BANKS: "Central Bank Watch",
  EQUITIES: "Global Markets",
  FIXED_INCOME: "Global Markets",
  FOREX: "Global Markets",
  COMMODITIES: "Global Markets",
  ENERGY: "Energy Markets",
  CRYPTO: "Crypto Markets",
  CORPORATE_EARNINGS: "Corporate Earnings",
  MARKET_VOLATILITY: "Market Alert",
  GEOPOLITICAL_MARKET_RISK: "Global Risk",
  GLOBAL_TRADE: "Global Risk",
  LABOR_MARKET: "Macro Data",
  CONSUMER_ECONOMY: "Macro Data",
  SAFE_HAVEN_FLOWS: "Global Markets",
  INSTITUTIONAL_FLOWS: "Crypto Markets",
};

const SUBTITLE_BY_EVENT = {
  US_CPI_MOM: "Macro Data",
  US_CPI_YOY: "Macro Data",
  US_CORE_CPI_MOM: "Macro Data",
  US_CORE_CPI_YOY: "Macro Data",
  US_NFP: "Macro Data",
  US_FED_RATE_DECISION: "Central Bank Watch",
  US_POWELL_SPEECH: "Central Bank Watch",
  US_FED_STATEMENT: "Central Bank Watch",
  ECB_RATE_DECISION: "Central Bank Watch",
  ECB_LAGARDE_SPEECH: "Central Bank Watch",
  BOE_RATE_DECISION: "Central Bank Watch",
  BOJ_RATE_DECISION: "Central Bank Watch",
  WALL_STREET_SELLOFF: "Market Alert",
  MARKET_SELLOFF: "Market Alert",
  GOLD_RALLY: "Global Markets",
  XAU_RALLY: "Global Markets",
  OIL_SUPPLY_DISRUPTION: "Energy Markets",
  BITCOIN_ETF_FLOWS: "Crypto Markets",
  STRAIT_OF_HORMUZ_TENSION: "Global Risk",
  CORPORATE_EARNINGS_MAJOR: "Corporate Earnings",
};

const HEADLINE_BY_EVENT = {
  WALL_STREET_SELLOFF: ["WALL STREET", "SELL-OFF"],
  MARKET_SELLOFF: ["WALL STREET", "SELL-OFF"],
  GOLD_RALLY: ["GOLD", "RALLY"],
  XAU_RALLY: ["GOLD", "RALLY"],
  OIL_SUPPLY_DISRUPTION: ["OIL SUPPLY", "RISK"],
  BITCOIN_ETF_FLOWS: ["BITCOIN ETF", "FLOWS"],
  STRAIT_OF_HORMUZ_TENSION: ["GLOBAL TRADE", "TENSIONS"],
  CORPORATE_EARNINGS_MAJOR: ["CORPORATE", "EARNINGS"],
};

const COLOR_LANGUAGE_BY_DOMAIN = {
  CENTRAL_BANKS: {
    palette: "neutral stone, institutional blue, restrained warm highlights",
    saturation: "low to medium",
    contrast: "controlled institutional",
  },
  MACRO_ECONOMY: {
    palette: "natural retail or workplace colors, neutral whites, subdued blue accents",
    saturation: "natural",
    contrast: "moderate informational",
  },
  CONSUMER_ECONOMY: {
    palette: "natural retail or workplace colors, neutral whites, subdued blue accents",
    saturation: "natural",
    contrast: "moderate informational",
  },
  LABOR_MARKET: {
    palette: "natural workplace colors, neutral whites, subdued blue accents",
    saturation: "natural",
    contrast: "moderate informational",
  },
  EQUITIES: {
    palette: "cool neutral tones, controlled contrast, realistic market environment",
    saturation: "subdued",
    contrast: "controlled",
  },
  MARKET_VOLATILITY: {
    palette: "cool neutral tones, controlled contrast, realistic market environment",
    saturation: "subdued",
    contrast: "elevated but realistic",
  },
  ENERGY: {
    palette: "industrial steel, earth tones, restrained amber",
    saturation: "natural industrial",
    contrast: "moderate",
  },
  COMMODITIES: {
    palette: "warm neutral metallic tones without advertisement shine",
    saturation: "restrained warm",
    contrast: "moderate",
  },
  SAFE_HAVEN_FLOWS: {
    palette: "warm neutral metallic tones without advertisement shine",
    saturation: "restrained warm",
    contrast: "moderate",
  },
  CRYPTO: {
    palette: "modern dark neutral technology without neon cyberpunk",
    saturation: "low",
    contrast: "controlled modern",
  },
  INSTITUTIONAL_FLOWS: {
    palette: "modern dark neutral technology without neon cyberpunk",
    saturation: "low",
    contrast: "controlled modern",
  },
  GEOPOLITICAL_MARKET_RISK: {
    palette: "documentary neutral, low saturation, serious newsroom tone",
    saturation: "low",
    contrast: "serious documentary",
  },
  GLOBAL_TRADE: {
    palette: "documentary neutral, low saturation, serious newsroom tone",
    saturation: "low",
    contrast: "serious documentary",
  },
  CORPORATE_EARNINGS: {
    palette: "cool neutral business environment, restrained corporate blues and greys",
    saturation: "natural",
    contrast: "moderate",
  },
  FIXED_INCOME: {
    palette: "neutral stone, institutional blue, restrained warm highlights",
    saturation: "low",
    contrast: "controlled institutional",
  },
  FOREX: {
    palette: "neutral stone, institutional blue, restrained warm highlights",
    saturation: "low",
    contrast: "controlled institutional",
  },
};

const IDENTITY_TONES = {
  INSTITUTIONAL_CALM: "trusted, institutional, calm, globally credible",
  INFORMATIVE_CALM: "informational, measured, professional, investor-focused",
  MARKET_ALERT: "serious, urgent but realistic, not cinematic",
  INDUSTRIAL_DOCUMENTARY: "grounded, industrial, factual, market-relevant",
  TECH_FINANCIAL: "modern financial technology, restrained, not hype-driven",
  GEOPOLITICAL_SERIOUS: "serious documentary, market-linked, low drama",
};

const VISUAL_INTENSITY = {
  LOW: "calm informational frame, soft focus on context",
  MEDIUM: "clearer subject focus with moderate contrast",
  HIGH: "strong composition and higher seriousness without artificial drama",
  CRITICAL: "urgent news weight with realism preserved, never poster-like",
};

const COVERAGE_MODES = {
  DATA_RELEASE: "scheduled macro data release",
  CENTRAL_BANK_DECISION: "central bank policy decision",
  CENTRAL_BANK_SPEECH: "central bank communication",
  MARKET_MOVE: "market price action story",
  COMMODITY_SHOCK: "commodity supply or demand shock",
  GEOPOLITICAL_TRANSMISSION: "geopolitical event with market transmission",
  CORPORATE_RESULTS: "corporate earnings release",
  INSTITUTIONAL_FLOW: "institutional capital flow story",
};

module.exports = {
  SUBTITLE_BY_DOMAIN,
  SUBTITLE_BY_EVENT,
  HEADLINE_BY_EVENT,
  COLOR_LANGUAGE_BY_DOMAIN,
  IDENTITY_TONES,
  VISUAL_INTENSITY,
  COVERAGE_MODES,
};
