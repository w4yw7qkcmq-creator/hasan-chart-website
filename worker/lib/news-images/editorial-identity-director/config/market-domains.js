const EDITORIAL_DOMAINS = {
  MACRO_ECONOMY: { id: "MACRO_ECONOMY", label: "Macro Economy" },
  CENTRAL_BANKS: { id: "CENTRAL_BANKS", label: "Central Banks" },
  EQUITIES: { id: "EQUITIES", label: "Equities" },
  FIXED_INCOME: { id: "FIXED_INCOME", label: "Fixed Income" },
  FOREX: { id: "FOREX", label: "Forex" },
  COMMODITIES: { id: "COMMODITIES", label: "Commodities" },
  ENERGY: { id: "ENERGY", label: "Energy" },
  CRYPTO: { id: "CRYPTO", label: "Crypto" },
  CORPORATE_EARNINGS: { id: "CORPORATE_EARNINGS", label: "Corporate Earnings" },
  MARKET_VOLATILITY: { id: "MARKET_VOLATILITY", label: "Market Volatility" },
  GEOPOLITICAL_MARKET_RISK: { id: "GEOPOLITICAL_MARKET_RISK", label: "Geopolitical Market Risk" },
  GLOBAL_TRADE: { id: "GLOBAL_TRADE", label: "Global Trade" },
  LABOR_MARKET: { id: "LABOR_MARKET", label: "Labor Market" },
  CONSUMER_ECONOMY: { id: "CONSUMER_ECONOMY", label: "Consumer Economy" },
  SAFE_HAVEN_FLOWS: { id: "SAFE_HAVEN_FLOWS", label: "Safe Haven Flows" },
  INSTITUTIONAL_FLOWS: { id: "INSTITUTIONAL_FLOWS", label: "Institutional Flows" },
};

const EVENT_DOMAIN_MAP = {
  US_CPI_MOM: ["MACRO_ECONOMY", "CONSUMER_ECONOMY"],
  US_CPI_YOY: ["MACRO_ECONOMY", "CONSUMER_ECONOMY"],
  US_CORE_CPI_MOM: ["MACRO_ECONOMY", "CONSUMER_ECONOMY"],
  US_CORE_CPI_YOY: ["MACRO_ECONOMY", "CONSUMER_ECONOMY"],
  US_NFP: ["LABOR_MARKET", "MACRO_ECONOMY"],
  US_UNEMPLOYMENT_RATE: ["LABOR_MARKET", "MACRO_ECONOMY"],
  US_FED_RATE_DECISION: ["CENTRAL_BANKS", "FIXED_INCOME", "FOREX"],
  US_FED_STATEMENT: ["CENTRAL_BANKS", "FIXED_INCOME", "FOREX"],
  US_POWELL_SPEECH: ["CENTRAL_BANKS", "FIXED_INCOME", "FOREX"],
  US_GDP_QOQ: ["MACRO_ECONOMY", "EQUITIES"],
  US_RETAIL_SALES: ["MACRO_ECONOMY", "CONSUMER_ECONOMY"],
  US_CORE_PCE_MOM: ["MACRO_ECONOMY", "CONSUMER_ECONOMY"],
  US_ISM_MANUFACTURING: ["MACRO_ECONOMY", "EQUITIES"],
  ECB_RATE_DECISION: ["CENTRAL_BANKS", "FIXED_INCOME", "FOREX"],
  ECB_LAGARDE_SPEECH: ["CENTRAL_BANKS", "FIXED_INCOME", "FOREX"],
  BOE_RATE_DECISION: ["CENTRAL_BANKS", "FIXED_INCOME", "FOREX"],
  BOJ_RATE_DECISION: ["CENTRAL_BANKS", "FIXED_INCOME", "FOREX"],
  MARKET_SELLOFF: ["EQUITIES", "MARKET_VOLATILITY"],
  WALL_STREET_SELLOFF: ["EQUITIES", "MARKET_VOLATILITY"],
  GOLD_RALLY: ["COMMODITIES", "SAFE_HAVEN_FLOWS"],
  XAU_RALLY: ["COMMODITIES", "SAFE_HAVEN_FLOWS"],
  OIL_SUPPLY_DISRUPTION: ["ENERGY", "COMMODITIES", "GLOBAL_TRADE"],
  BITCOIN_ETF_FLOWS: ["CRYPTO", "INSTITUTIONAL_FLOWS"],
  STRAIT_OF_HORMUZ_TENSION: ["GEOPOLITICAL_MARKET_RISK", "ENERGY", "GLOBAL_TRADE"],
  CORPORATE_EARNINGS_MAJOR: ["CORPORATE_EARNINGS", "EQUITIES"],
  GENERIC_POLITICAL_STATEMENT: [],
};

const TOPIC_DOMAIN_MAP = [
  { pattern: /sell.?off|wall street|equity rout|stock market drop/i, domains: ["EQUITIES", "MARKET_VOLATILITY"], eventKey: "WALL_STREET_SELLOFF" },
  { pattern: /gold rally|gold surge|safe haven gold|xau/i, domains: ["COMMODITIES", "SAFE_HAVEN_FLOWS"], eventKey: "GOLD_RALLY" },
  { pattern: /oil supply|crude disruption|opec cut|energy supply/i, domains: ["ENERGY", "COMMODITIES", "GLOBAL_TRADE"], eventKey: "OIL_SUPPLY_DISRUPTION" },
  { pattern: /bitcoin etf|btc etf|crypto etf flow/i, domains: ["CRYPTO", "INSTITUTIONAL_FLOWS"], eventKey: "BITCOIN_ETF_FLOWS" },
  { pattern: /hormuz|strait of hormuz|shipping lane/i, domains: ["GEOPOLITICAL_MARKET_RISK", "ENERGY", "GLOBAL_TRADE"], eventKey: "STRAIT_OF_HORMUZ_TENSION" },
  { pattern: /earnings beat|earnings miss|corporate earnings|quarterly results/i, domains: ["CORPORATE_EARNINGS", "EQUITIES"], eventKey: "CORPORATE_EARNINGS_MAJOR" },
  { pattern: /political speech|campaign rally|domestic politics/i, domains: [], eventKey: "GENERIC_POLITICAL_STATEMENT", noMarketAngle: true },
];

const CATEGORY_DOMAIN_MAP = {
  central_bank: ["CENTRAL_BANKS", "FIXED_INCOME", "FOREX"],
  central_bank_speech: ["CENTRAL_BANKS", "FIXED_INCOME", "FOREX"],
  inflation: ["MACRO_ECONOMY", "CONSUMER_ECONOMY"],
  employment: ["LABOR_MARKET", "MACRO_ECONOMY"],
  growth: ["MACRO_ECONOMY", "EQUITIES"],
  consumer: ["CONSUMER_ECONOMY", "MACRO_ECONOMY"],
};

function resolveEditorialDomains(profile = {}, context = {}) {
  const eventKey = String(profile.canonicalEventKey || profile.eventKey || context.eventKey || "").toUpperCase();
  if (EVENT_DOMAIN_MAP[eventKey]) {
    return EVENT_DOMAIN_MAP[eventKey];
  }

  const haystack = [context.eventName, context.title, context.summary, context.sourceText, context.editorialTopic]
    .filter(Boolean)
    .join(" ");

  for (const topic of TOPIC_DOMAIN_MAP) {
    if (topic.pattern.test(haystack) || topic.eventKey === eventKey) {
      return topic.domains;
    }
  }

  const category = profile.eventDefinition?.category;
  if (category && CATEGORY_DOMAIN_MAP[category]) {
    return CATEGORY_DOMAIN_MAP[category];
  }

  return ["MACRO_ECONOMY"];
}

function resolveSyntheticEventKey(profile = {}, context = {}) {
  const eventKey = String(profile.canonicalEventKey || profile.eventKey || context.eventKey || "").toUpperCase();
  if (EVENT_DOMAIN_MAP[eventKey]) {
    return eventKey;
  }

  const haystack = [context.eventName, context.title, context.summary, context.sourceText, context.editorialTopic]
    .filter(Boolean)
    .join(" ");

  for (const topic of TOPIC_DOMAIN_MAP) {
    if (topic.pattern.test(haystack) || topic.eventKey === eventKey) {
      return topic.eventKey;
    }
  }

  return eventKey || "MACRO_RELEASE";
}

module.exports = {
  EDITORIAL_DOMAINS,
  EVENT_DOMAIN_MAP,
  TOPIC_DOMAIN_MAP,
  resolveEditorialDomains,
  resolveSyntheticEventKey,
};
