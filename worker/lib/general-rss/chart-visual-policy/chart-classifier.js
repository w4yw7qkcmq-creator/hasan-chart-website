const VISUAL_TYPES = Object.freeze({
  CHART: "CHART",
  EDITORIAL_PHOTO: "EDITORIAL_PHOTO",
  SOURCE_PHOTO: "SOURCE_PHOTO",
  GENERATED_CARD: "GENERATED_CARD",
  OTHER: "OTHER",
});

const CHART_URL_PATTERNS = [
  /\/chart/i,
  /\/graph/i,
  /tradingview/i,
  /\/candle/i,
  /stock-chart/i,
  /price-chart/i,
  /\/charts\//i,
  /investing\.com.*chart/i,
  /marketwatch.*chart/i,
];

const MARKET_CHART_TEXT_PATTERNS = [
  /\b(?:usd\/jpy|eur\/usd|gbp\/usd|wti|brent|crude oil|xauusd)\b[^\n]{0,80}\bchart\b/i,
  /\bchart\b[^\n]{0,80}\b(?:usd\/jpy|eur\/usd|gbp\/usd|wti|brent|crude|gold)\b/i,
  /\b(?:candlestick|price chart|technical chart)\b/i,
  /(?:رسم\s*بياني|مخطط\s*(?:سعر|فني))/i,
];

function textSuggestsMarketChart(text = "") {
  const value = String(text || "");
  return MARKET_CHART_TEXT_PATTERNS.some((pattern) => pattern.test(value));
}

function classifyImageVisualType(url = "", metadata = {}) {
  if (metadata.visualType && VISUAL_TYPES[metadata.visualType]) {
    return metadata.visualType;
  }
  if (metadata.isGeneratedNewsCard === true) {
    return VISUAL_TYPES.GENERATED_CARD;
  }
  const value = String(url || "");
  if (CHART_URL_PATTERNS.some((pattern) => pattern.test(value))) {
    return VISUAL_TYPES.CHART;
  }
  if (textSuggestsMarketChart(`${metadata.title || ""} ${metadata.imageTitle || ""} ${metadata.contextText || ""}`)) {
    return VISUAL_TYPES.CHART;
  }
  if (/og|hero|photo|image|cdn|media|mktw|sanity|cnbcfm/i.test(value)) {
    return VISUAL_TYPES.SOURCE_PHOTO;
  }
  return VISUAL_TYPES.OTHER;
}

function consumesPublicChartQuota(visualType) {
  return visualType === VISUAL_TYPES.CHART;
}

module.exports = {
  VISUAL_TYPES,
  classifyImageVisualType,
  textSuggestsMarketChart,
  consumesPublicChartQuota,
};
