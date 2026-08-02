const { COVERAGE_MODES } = require("./config/editorial-tones");

const INVESTOR_RELEVANCE_BY_DOMAIN = {
  MACRO_ECONOMY: "Shapes inflation expectations, growth outlook, and central bank reaction function.",
  CENTRAL_BANKS: "Directly affects rates, liquidity, currency, and cross-asset pricing.",
  LABOR_MARKET: "Signals employment strength, wage pressure, and Fed policy path.",
  CONSUMER_ECONOMY: "Reflects household spending power and inflation sensitivity.",
  EQUITIES: "Moves index sentiment, risk appetite, and sector allocation.",
  MARKET_VOLATILITY: "Signals risk-off or risk-on repositioning across portfolios.",
  FIXED_INCOME: "Re-prices yields, duration, and rate expectations.",
  FOREX: "Moves currency pairs and global capital flows.",
  COMMODITIES: "Affects inflation hedges, real assets, and sector exposure.",
  SAFE_HAVEN_FLOWS: "Signals defensive positioning into gold and related assets.",
  ENERGY: "Impacts inflation, transport costs, and energy-linked equities.",
  CRYPTO: "Reflects institutional adoption and digital asset liquidity.",
  INSTITUTIONAL_FLOWS: "Shows where large capital is moving in digital markets.",
  GEOPOLITICAL_MARKET_RISK: "Can disrupt trade routes, energy supply, and risk premiums.",
  GLOBAL_TRADE: "Affects supply chains, shipping costs, and export-sensitive sectors.",
  CORPORATE_EARNINGS: "Updates company profitability and equity valuation context.",
};

function resolveCoverageMode(profile = {}, domains = [], syntheticEventKey = "") {
  const key = syntheticEventKey.toUpperCase();
  const category = profile.eventDefinition?.category;

  if (/POWELL|LAGARDE|SPEECH|CONFERENCE/.test(key)) return COVERAGE_MODES.CENTRAL_BANK_SPEECH;
  if (/FED|ECB|BOE|BOJ|RATE_DECISION/.test(key)) return COVERAGE_MODES.CENTRAL_BANK_DECISION;
  if (/NFP|CPI|PCE|GDP|RETAIL|ISM|CLAIMS|UNEMPLOYMENT/.test(key)) return COVERAGE_MODES.DATA_RELEASE;
  if (/SELLOFF|VOLATILITY/.test(key)) return COVERAGE_MODES.MARKET_MOVE;
  if (/GOLD|XAU|COMMOD/.test(key)) return COVERAGE_MODES.COMMODITY_SHOCK;
  if (/OIL|ENERGY|HORMUZ/.test(key)) return COVERAGE_MODES.GEOPOLITICAL_TRANSMISSION;
  if (/BITCOIN|CRYPTO|ETF/.test(key)) return COVERAGE_MODES.INSTITUTIONAL_FLOW;
  if (/EARNINGS/.test(key)) return COVERAGE_MODES.CORPORATE_RESULTS;

  if (category === "central_bank") return COVERAGE_MODES.CENTRAL_BANK_DECISION;
  if (category === "central_bank_speech") return COVERAGE_MODES.CENTRAL_BANK_SPEECH;
  if (category === "employment" || category === "inflation") return COVERAGE_MODES.DATA_RELEASE;

  if (domains.includes("GEOPOLITICAL_MARKET_RISK")) return COVERAGE_MODES.GEOPOLITICAL_TRANSMISSION;
  if (domains.includes("MARKET_VOLATILITY")) return COVERAGE_MODES.MARKET_MOVE;
  if (domains.includes("CORPORATE_EARNINGS")) return COVERAGE_MODES.CORPORATE_RESULTS;

  return COVERAGE_MODES.DATA_RELEASE;
}

function resolveInvestorRelevance(domains = [], profile = {}) {
  const primary = domains[0];
  const base = INVESTOR_RELEVANCE_BY_DOMAIN[primary] || "Relevant to global macro and cross-asset positioning.";
  const eventName = profile.displayTitle || profile.eventDefinition?.displayName || "this release";
  return `Investors watch ${eventName} because it ${base.charAt(0).toLowerCase()}${base.slice(1)}`;
}

function resolveHeroSubjectType(profile = {}, artDirection = {}, domains = []) {
  const personPolicy = profile.eventDefinition?.personPolicy;
  if (personPolicy === "person_primary") return "PERSON";
  if (personPolicy === "institution_primary") return "INSTITUTION";
  if (domains.includes("GEOPOLITICAL_MARKET_RISK")) return "FIELD_EVENT";
  if (domains.includes("ENERGY")) return "INDUSTRIAL_ASSET";
  if (domains.includes("CRYPTO")) return "FINANCIAL_TECHNOLOGY";
  if (domains.includes("CORPORATE_EARNINGS")) return "BUSINESS_ACTIVITY";
  if (domains.includes("EQUITIES") || domains.includes("MARKET_VOLATILITY")) return "MARKET_ENVIRONMENT";
  if (domains.includes("CONSUMER_ECONOMY")) return "ECONOMIC_ACTIVITY";
  if (domains.includes("LABOR_MARKET")) return "WORKPLACE_ACTIVITY";
  if (artDirection?.primarySubjectType) return artDirection.primarySubjectType;
  return "ECONOMIC_ACTIVITY";
}

function resolveVisualNarrative(profile = {}, artDirection = {}, editorialConsistency = {}) {
  const hero =
    editorialConsistency?.photoStory?.heroSubject ||
    artDirection?.heroSubject ||
    "one credible real-world scene that carries the macro story";
  return `The single visual story is ${hero}. No secondary explanation is needed beyond this frame.`;
}

module.exports = {
  resolveCoverageMode,
  resolveInvestorRelevance,
  resolveHeroSubjectType,
  resolveVisualNarrative,
};
