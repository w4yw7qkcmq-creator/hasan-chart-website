const { WIDTH, HEIGHT } = require("./fallback-visual-themes");
const { resolveImageDisplayTitle } = require("./editorial-intelligence");

const HEADLINE_LINE_OVERRIDES = {
  US_NFP: ["US NONFARM", "PAYROLLS"],
  US_FED_RATE_DECISION: ["FED RATE", "DECISION"],
  US_POWELL_SPEECH: ["FED PRESS", "CONFERENCE"],
  US_CPI_MOM: ["US CPI", "INFLATION"],
  US_CPI_YOY: ["US CPI", "INFLATION"],
  US_CORE_CPI_MOM: ["CORE CPI", "INFLATION"],
  US_CORE_CPI_YOY: ["CORE CPI", "INFLATION"],
  ECB_RATE_DECISION: ["ECB RATE", "DECISION"],
  ECB_LAGARDE_SPEECH: ["ECB PRESS", "CONFERENCE"],
  BOE_RATE_DECISION: ["BOE RATE", "DECISION"],
  BOJ_RATE_DECISION: ["BOJ RATE", "DECISION"],
  WALL_STREET_SELLOFF: ["WALL STREET", "SELL-OFF"],
  MARKET_SELLOFF: ["WALL STREET", "SELL-OFF"],
  GOLD_RALLY: ["GOLD", "RALLY"],
  XAU_RALLY: ["GOLD", "RALLY"],
  OIL_SUPPLY_DISRUPTION: ["OIL SUPPLY", "RISK"],
  BITCOIN_ETF_FLOWS: ["BITCOIN ETF", "FLOWS"],
  STRAIT_OF_HORMUZ_TENSION: ["GLOBAL TRADE", "TENSIONS"],
  CORPORATE_EARNINGS_MAJOR: ["CORPORATE", "EARNINGS"],
};

function resolveEditorialHeadline(context = {}) {
  const key = String(context.eventKey || context.canonicalEventKey || "").trim().toUpperCase();
  if (HEADLINE_LINE_OVERRIDES[key]) {
    return HEADLINE_LINE_OVERRIDES[key].join(" ");
  }
  return String(resolveImageDisplayTitle(context) || "MACRO RELEASE").trim().toUpperCase();
}

function resolveEditorialHeadlineLines(context = {}) {
  if (Array.isArray(context.headlineLines) && context.headlineLines.length > 0) {
    return context.headlineLines.slice(0, 2);
  }

  const key = String(context.eventKey || context.canonicalEventKey || "").trim().toUpperCase();
  if (HEADLINE_LINE_OVERRIDES[key]) {
    return [...HEADLINE_LINE_OVERRIDES[key]];
  }

  const headline = resolveEditorialHeadline(context);
  const words = headline.split(/\s+/).filter(Boolean);
  if (words.length <= 2) {
    return [headline];
  }

  const midpoint = Math.ceil(words.length / 2);
  return [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")].filter(Boolean);
}

function resolveEditorialHeadlineTypography({
  context = {},
  title,
  zoneWidth,
  zoneHeight,
  imageWidth = WIDTH,
  imageHeight = HEIGHT,
} = {}) {
  const lines = title
    ? String(title)
        .toUpperCase()
        .split(/\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 2)
    : resolveEditorialHeadlineLines(context);

  const maxTextWidth = Math.floor(imageWidth * 0.48);
  const maxTextHeight = Math.floor(imageHeight * 0.3);
  let fontSize = lines.join(" ").length > 22 ? 58 : 64;
  if (lines.join(" ").length <= 14) {
    fontSize = 72;
  }
  const minFontSize = 54;

  const lineHeight = Math.round(fontSize * 1.08);
  while ((lines.length * lineHeight > maxTextHeight || lines.some((line) => line.length * fontSize * 0.56 > maxTextWidth)) && fontSize > minFontSize) {
    fontSize -= 2;
  }

  return {
    headline: lines.join(" "),
    lines,
    fontSize,
    lineHeight,
    maxTextWidth,
    maxTextHeight,
    minFontSize,
    maxFontSize: 72,
    uppercase: true,
    strokeWidth: 1.2,
    shadowOpacity: 0.34,
  };
}

module.exports = {
  HEADLINE_LINE_OVERRIDES,
  resolveEditorialHeadline,
  resolveEditorialHeadlineLines,
  resolveEditorialHeadlineTypography,
};
