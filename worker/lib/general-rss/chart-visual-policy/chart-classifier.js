const VISUAL_TYPES = Object.freeze({
  CHART: "CHART",
  EDITORIAL_PHOTO: "EDITORIAL_PHOTO",
  SOURCE_PHOTO: "SOURCE_PHOTO",
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
];

function classifyImageVisualType(url = "", metadata = {}) {
  if (metadata.visualType && VISUAL_TYPES[metadata.visualType]) {
    return metadata.visualType;
  }
  const value = String(url || "");
  if (CHART_URL_PATTERNS.some((pattern) => pattern.test(value))) {
    return VISUAL_TYPES.CHART;
  }
  if (/og|hero|photo|image|cdn|media|mktw|sanity|cnbcfm/i.test(value)) {
    return VISUAL_TYPES.SOURCE_PHOTO;
  }
  return VISUAL_TYPES.OTHER;
}

module.exports = {
  VISUAL_TYPES,
  classifyImageVisualType,
};
