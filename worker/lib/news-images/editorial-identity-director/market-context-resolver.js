const MARKET_CONTEXT_IS_EDITORIAL_NOT_LITERAL =
  "Market context is editorial not literal: influence scene choice, mood, camera angle, hero subject, and seriousness without adding financial symbols.";

const SYMBOL_CLUTTER_FORBIDDEN = [
  "giant dollar bills",
  "giant gold bars",
  "giant stock chart overlay",
  "glowing trading dashboard as hero",
  "stacked money symbols",
  "multiple financial icons in one frame",
  "building plus chart plus cash in one frame",
  "tanker plus barrel plus chart plus dollar plus flag collage",
  "red arrow stock symbol over city skyline",
];

const MARKET_TRANSMISSION_BY_EVENT = {
  WALL_STREET_SELLOFF: "Risk-off equity repricing and volatility spillover into broader assets.",
  MARKET_SELLOFF: "Risk-off equity repricing and volatility spillover into broader assets.",
  GOLD_RALLY: "Defensive flows into precious metals amid uncertainty or rate expectations.",
  XAU_RALLY: "Defensive flows into precious metals amid uncertainty or rate expectations.",
  OIL_SUPPLY_DISRUPTION: "Energy supply risk reprices crude and inflation expectations.",
  BITCOIN_ETF_FLOWS: "Institutional capital flows reshape digital asset liquidity and sentiment.",
  STRAIT_OF_HORMUZ_TENSION: "Shipping lane risk transmits into oil prices, freight costs, and risk premiums.",
  CORPORATE_EARNINGS_MAJOR: "Corporate profitability updates drive sector and index sentiment.",
  GENERIC_POLITICAL_STATEMENT: null,
};

function resolvePrimaryMarket(profile = {}, entities = {}, domains = []) {
  const markets = entities.markets || profile.eventDefinition?.affectedMarkets || [];
  if (markets.length > 0) {
    const first = typeof markets[0] === "string" ? markets[0] : markets[0]?.id;
    return first || "USD";
  }
  if (domains.includes("ENERGY")) return "OIL";
  if (domains.includes("CRYPTO")) return "CRYPTO";
  if (domains.includes("COMMODITIES") || domains.includes("SAFE_HAVEN_FLOWS")) return "GOLD";
  if (domains.includes("EQUITIES")) return "EQUITIES";
  if (domains.includes("FIXED_INCOME")) return "US_TREASURIES";
  if (domains.includes("FOREX")) return "USD";
  return "USD";
}

function resolveSecondaryMarkets(profile = {}, entities = {}, primaryMarket = "USD") {
  const markets = entities.markets || profile.eventDefinition?.affectedMarkets || [];
  const ids = markets.map((market) => (typeof market === "string" ? market : market?.id)).filter(Boolean);
  return ids.filter((id) => id !== primaryMarket);
}

function resolveMarketAngle(profile = {}, context = {}, domains = [], syntheticEventKey = "") {
  const key = syntheticEventKey.toUpperCase();
  const haystack = [context.eventName, context.title, context.summary, context.sourceText, context.editorialTopic]
    .filter(Boolean)
    .join(" ");

  if (key === "GENERIC_POLITICAL_STATEMENT" || /political speech|campaign rally|domestic politics/i.test(haystack)) {
    return {
      hasMarketAngle: false,
      affectedMarkets: [],
      marketTransmission: null,
      visualMarketRelevance: "No clear market transmission; not eligible for premium financial imagery.",
      premiumImageEligible: false,
    };
  }

  if (domains.length === 0) {
    return {
      hasMarketAngle: false,
      affectedMarkets: [],
      marketTransmission: null,
      visualMarketRelevance: "No editorial domain match; insufficient market linkage.",
      premiumImageEligible: false,
    };
  }

  const primaryMarket = resolvePrimaryMarket(profile, { markets: profile.eventDefinition?.affectedMarkets?.map((id) => ({ id })) }, domains);
  const affectedMarkets = [
    primaryMarket,
    ...resolveSecondaryMarkets(profile, { markets: profile.eventDefinition?.affectedMarkets?.map((id) => ({ id })) }, primaryMarket),
  ].filter(Boolean);

  const transmission =
    MARKET_TRANSMISSION_BY_EVENT[key] ||
    (domains.includes("GEOPOLITICAL_MARKET_RISK")
      ? "Geopolitical stress transmits into energy, trade, and risk assets."
      : domains.includes("CENTRAL_BANKS")
        ? "Policy expectations transmit into rates, currency, and equities."
        : domains.includes("CONSUMER_ECONOMY")
          ? "Inflation and spending data transmit into rate expectations and consumer sectors."
          : "Macro signal transmits into cross-asset positioning.");

  return {
    hasMarketAngle: true,
    affectedMarkets: [...new Set(affectedMarkets)],
    marketTransmission: transmission,
    visualMarketRelevance: MARKET_CONTEXT_IS_EDITORIAL_NOT_LITERAL,
    premiumImageEligible: true,
  };
}

function resolveIdentityForbiddenSubjects(marketAngle = {}) {
  const forbidden = [...SYMBOL_CLUTTER_FORBIDDEN];
  if (!marketAngle.hasMarketAngle) {
    forbidden.push("general political rally imagery without market linkage");
  }
  return forbidden;
}

module.exports = {
  MARKET_CONTEXT_IS_EDITORIAL_NOT_LITERAL,
  SYMBOL_CLUTTER_FORBIDDEN,
  resolvePrimaryMarket,
  resolveSecondaryMarkets,
  resolveMarketAngle,
  resolveIdentityForbiddenSubjects,
};
