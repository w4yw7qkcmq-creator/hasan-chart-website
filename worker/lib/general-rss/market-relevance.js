const { rssItemHasStructuredTripleFields } = require("../telegram-news/rss-filter");
const { classifyNewsCategory, getScoreThreshold } = require("./news-category");

const LIFESTYLE_PATTERN =
  /worldpride|fashion week|celebrity|movie|film|album|concert|recipe|travel guide|restaurant review|sports score|nba finals|world cup|premier league|lifestyle|beauty tips|dating advice|worth streaming|what'?s worth streaming|streaming in|netflix.*hulu|tv show|movie review|حفل|مهرajan|رياضة|كرة قدم|مسلسل|فيلم/i;

const POLITICS_WITHOUT_MARKET_PATTERN =
  /mayor|city council|park renovation|bar referral|appeals order|local election|campaign rally(?!.*market)|community infrastructure/i;

const INVESTMENT_REFLECTION_PATTERN =
  /\d+(?:\.\d+)?%|\$\d|€|¥|bps|bp\b|\d+[KMB]|surge|plunge|selloff|sell-off|rally|jump|jumps|fall|falls|drop|drops|rise|rises|climb|slide|spike|tumble|beat|beats|miss|misses|earnings|revenue|guidance|profit|loss|liquidation|after-hours|premarket|futures|yield|rate cut|rate hike|tariff|sanction|approval|decision|ipo|merger|deal|record|boom|exploit|attack|war|escalate|tension|supply|risk premium|shares|stock price|trading|market move|profit growth|beats estimates|misses estimates|raises guidance|quarterly results|investors sending|sending bitcoin back|oil market|market boom|trickier|wilder|makes its mark/i;

const PLACEHOLDER_PATTERN = /^(?:\.+|…+|\.{3,}|update:|breaking:|news:|\s*[-–—]\s*)$/i;

const MARKET_PATTERNS = [
  { market: "equities", pattern: /nasdaq|dow jones|s&p 500|wall street|stocks|equities|indices|index futures|magnificent seven|nvidia|tesla|microsoft|amazon|meta|أسهم|مؤشر|ناسداك|داو جونز|وول ستريت/i },
  { market: "fx", pattern: /forex|eurusd|gbpusd|usdjpy|dollar index|dxy|yen|euro|currency|الدولار|اليورو|الين|عملات|فوركس/i },
  { market: "gold", pattern: /gold|xau|precious metals|silver|platinum|الذهب|معادن/i },
  { market: "oil", pattern: /oil|crude|brent|wti|opec|energy prices|gasoline|refinery|pipeline|النفط|طاقة|برنت|أوبك/i },
  { market: "rates", pattern: /treasury yields?|bond yields?|yields curve|fed funds|interest rate|central bank|fomc|powell|ecb|boe|lagarde|الفائدة|سندات|عوائد|الفيدرالي|باول/i },
  { market: "crypto", pattern: /bitcoin|btc|ethereum|eth|crypto|stablecoin|blockchain|etf approval|coinbase|binance|البيتكوين|كريبتو|عملات رقمية/i },
  { market: "trade", pattern: /tariff|sanctions|trade war|export ban|import ban|shipping routes|hormuz|red sea|supply chain|maritime|tariffs|عقوبات|تجارة|جمارك|هرمز|ممر/i },
  { market: "geopolitics", pattern: /iran|israel|ukraine|russia|middle east|missile|airstrike|war|ceasefire|conflict|attack|gaza|tehran|إيران|إسرائيل|حرب|صاروخ|تصعيد/i },
  { market: "earnings", pattern: /earnings|eps|revenue|guidance|quarterly results|profit warning|beat estimates|miss estimates|أرباح|إيرادات/i },
];

const HIGH_IMPACT_PATTERN =
  /fed rate decision|fomc decision|interest rate decision|rate cut|rate hike|market crash|selloff|sell-off|stocks plunge|liquidations|oil prices surge|oil spikes|gold jumps|bitcoin plunges|bitcoin surges|war breaks out|missile attack|airstrike|hormuz|sanctions announced|tariff announced|انهيار|تصفيات|هجوم|هرمز/i;

const LOW_VALUE_PATTERN =
  /analyst estimates|price target|stock on pace|shares rise modestly|personal care|what to watch|could|may|might|minor move|little changed|mixed close|opinion column|editorial/i;

function normalizeTitle(title = "") {
  return String(title || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9\u0600-\u06ff\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasPlaceholderTitle(title = "") {
  const normalized = normalizeTitle(title);
  return !normalized || normalized.length < 12 || PLACEHOLDER_PATTERN.test(normalized);
}

function detectAffectedMarkets(text = "") {
  const affected = [];
  for (const entry of MARKET_PATTERNS) {
    if (entry.pattern.test(text)) {
      affected.push(entry.market);
    }
  }
  return [...new Set(affected)];
}

function hasInvestmentReflection(text = "") {
  return INVESTMENT_REFLECTION_PATTERN.test(text);
}

function buildMarketAngle(text = "", markets = []) {
  if (!markets.length || !hasInvestmentReflection(text)) {
    return null;
  }

  if (markets.includes("oil") && /price|surge|jump|fall|drop|reaction|rally|market|boom|هبوط|ارتفاع/i.test(text)) {
    return "Energy price move with market impact";
  }

  if (markets.includes("gold") && /price|surge|jump|fall|drop|safe haven|هبوط|ارتفاع/i.test(text)) {
    return "Gold price move";
  }

  if (markets.includes("crypto") && /price|surge|fall|etf|approval|liquidation|market|هبوط|ارتفاع/i.test(text)) {
    return "Crypto market move";
  }

  if (markets.includes("equities") && /fall|rise|plunge|selloff|rally|earnings|profit growth|market|هبوط|ارتفاع/i.test(text)) {
    return "Equity market move";
  }

  if (markets.includes("geopolitics") && /market|risk|oil|gold|stocks|dollar|attack|war|deal|agreement|cancel|sanctions|boom|سوق/i.test(text)) {
    return "Geopolitical event with market transmission";
  }

  if (markets.includes("trade")) {
    return "Trade or sanctions development affecting markets";
  }

  if (markets.includes("fx")) {
    return "Currency market development";
  }

  if (markets.includes("rates")) {
    return "Rates or central bank development";
  }

  if (markets.includes("earnings")) {
    return "Corporate earnings with market relevance";
  }

  return null;
}

function scoreGeneralNews(text = "", markets = [], impactLevel = "LOW", category = "market_move") {
  let score = 0;

  if (markets.length) {
    score += 20 + Math.min(markets.length, 3) * 5;
  }

  if (/\d+(?:\.\d+)?%|\$\d|€|¥|bps|bp\b|\d+[KMB]/i.test(text)) {
    score += 15;
  }

  if (/breaking|just in|surge|plunge|selloff|attack|approval|decision|earnings beat|earnings miss|beats estimates|misses estimates|raises guidance|revenue guidance|after-hours|quarterly results|profit growth|market boom/i.test(text)) {
    score += 15;
  }

  if (/earnings|quarterly results|guidance|after-hours|profit growth|record revenue|record profit/i.test(text) && (markets.includes("earnings") || category === "earnings" || category === "corporate_institutional")) {
    score += 10;
  }

  if (impactLevel === "HIGH") {
    score += 20;
  } else if (impactLevel === "MEDIUM") {
    score += 10;
  }

  if (category === "opinion" || category === "evergreen") {
    score -= 15;
  }

  if (LOW_VALUE_PATTERN.test(text) && !/earnings beat|earnings miss|beats estimates|misses estimates|raises guidance|revenue guidance|quarterly results|after-hours|profit growth/i.test(text)) {
    score -= 20;
  }

  if (LIFESTYLE_PATTERN.test(text) || category === "product_lifestyle") {
    score -= 40;
  }

  return Math.max(0, Math.min(100, score));
}

function resolveImpactLevel(text = "", markets = []) {
  if (HIGH_IMPACT_PATTERN.test(text)) {
    return "HIGH";
  }

  if (markets.length && !LOW_VALUE_PATTERN.test(text)) {
    return "MEDIUM";
  }

  return "LOW";
}

function evaluateGeneralNewsMarketRelevance(item = {}) {
  const text = `${item.title || ""} ${item.contentSnippet || ""} ${item.summary || ""} ${item.description || ""}`.trim();
  const title = String(item.title || "").trim();
  const category = classifyNewsCategory(text);

  if (rssItemHasStructuredTripleFields(item)) {
    return {
      eligible: false,
      impactLevel: "HIGH",
      primaryMarket: "macro_data",
      affectedMarkets: ["macro_data"],
      marketAngle: null,
      category,
      rejectionReason: "structured_economic_release",
      score: 0,
    };
  }

  if (hasPlaceholderTitle(title)) {
    return {
      eligible: false,
      impactLevel: "LOW",
      primaryMarket: null,
      affectedMarkets: [],
      marketAngle: null,
      category,
      rejectionReason: "placeholder_or_short_title",
      score: 0,
    };
  }

  if (category === "evergreen") {
    return {
      eligible: false,
      impactLevel: "LOW",
      primaryMarket: null,
      affectedMarkets: [],
      marketAngle: null,
      category,
      rejectionReason: "evergreen_educational",
      score: 0,
    };
  }

  if (category === "product_lifestyle" || LIFESTYLE_PATTERN.test(text)) {
    return {
      eligible: false,
      impactLevel: "LOW",
      primaryMarket: null,
      affectedMarkets: [],
      marketAngle: null,
      category,
      rejectionReason: "product_lifestyle_or_non_financial",
      score: 0,
    };
  }

  if (POLITICS_WITHOUT_MARKET_PATTERN.test(text) && !hasInvestmentReflection(text)) {
    return {
      eligible: false,
      impactLevel: "LOW",
      primaryMarket: null,
      affectedMarkets: [],
      marketAngle: null,
      category,
      rejectionReason: "politics_without_market_impact",
      score: 0,
    };
  }

  const affectedMarkets = detectAffectedMarkets(text);
  const impactLevel = resolveImpactLevel(text, affectedMarkets);
  const marketAngle = buildMarketAngle(text, affectedMarkets);
  const score = scoreGeneralNews(text, affectedMarkets, impactLevel, category);
  const threshold = getScoreThreshold(category, impactLevel);

  if (!affectedMarkets.length) {
    return {
      eligible: false,
      impactLevel: "LOW",
      primaryMarket: null,
      affectedMarkets: [],
      marketAngle: null,
      category,
      rejectionReason: "no_market_angle",
      score,
    };
  }

  if (affectedMarkets.includes("geopolitics") && !marketAngle && affectedMarkets.length === 1) {
    return {
      eligible: false,
      impactLevel,
      primaryMarket: "geopolitics",
      affectedMarkets,
      marketAngle: null,
      category,
      rejectionReason: "geopolitics_without_market_transmission",
      score,
    };
  }

  if (impactLevel === "LOW" && category !== "corporate_institutional") {
    return {
      eligible: false,
      impactLevel,
      primaryMarket: affectedMarkets[0] || null,
      affectedMarkets,
      marketAngle,
      category,
      rejectionReason: "low_impact",
      score,
    };
  }

  if (!marketAngle) {
    return {
      eligible: false,
      impactLevel,
      primaryMarket: affectedMarkets[0] || null,
      affectedMarkets,
      marketAngle: null,
      category,
      rejectionReason: affectedMarkets.length
        ? "asset_mention_without_investment_reflection"
        : "no_market_angle",
      score,
    };
  }

  if (impactLevel !== "HIGH" && impactLevel !== "MEDIUM") {
    return {
      eligible: false,
      impactLevel,
      primaryMarket: affectedMarkets[0] || null,
      affectedMarkets,
      marketAngle,
      category,
      rejectionReason: "low_impact",
      score,
    };
  }

  if (score < threshold) {
    return {
      eligible: false,
      impactLevel,
      primaryMarket: affectedMarkets[0] || null,
      affectedMarkets,
      marketAngle,
      category,
      rejectionReason: category === "opinion" ? "opinion_below_threshold" : "quality_score_below_threshold",
      score,
    };
  }

  return {
    eligible: true,
    impactLevel,
    primaryMarket: affectedMarkets[0] || null,
    affectedMarkets,
    marketAngle,
    category,
    rejectionReason: null,
    score,
  };
}

module.exports = {
  evaluateGeneralNewsMarketRelevance,
  detectAffectedMarkets,
  buildMarketAngle,
  scoreGeneralNews,
  resolveImpactLevel,
  hasInvestmentReflection,
  normalizeTitle,
};
