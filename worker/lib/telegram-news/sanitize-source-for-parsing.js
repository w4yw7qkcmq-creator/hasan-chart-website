const {
  stripPromotionalFooter,
  stripPromotionalContent,
  isPromoLine,
} = require("./promo-filter");
const { extractSourceReading } = require("./source-reading");

const COMPETITOR_CHANNEL_PATTERNS = [
  /forexbreakingnews/iu,
  /forexnewspaper/iu,
  /https?:\/\/(?:www\.)?telegram\.me\/[^\s]*/giu,
  /https?:\/\/t\.me\/(?!EconomicNewsi\b)[^\s]*/giu,
  /@[Ff]orex[Bb]reaking[Nn]ews\b/gu,
  /@[Ff]orex[Nn]ewspaper\b/gu,
];

const PROMO_PHRASE_PATTERNS = [
  /لمتابعة[^\n]{0,120}(?:انضم|إنضم|اشترك)[^\n]{0,80}/giu,
  /(?:انضم|إنضم)\s*(?:لل)?(?:قناة|القناة)/giu,
  /(?:اشترك|اشتركوا)\s*(?:بال)?(?:قناة|القناة|الآن)/giu,
  /تابع(?:نا|ونا)\s*(?:على|في)?/giu,
  /join\s+our\s+channel/giu,
  /subscribe\s+(?:now|to\s+our\s+channel)/giu,
];

function stripInlinePromoArtifacts(text) {
  let value = String(text || "");
  for (const pattern of COMPETITOR_CHANNEL_PATTERNS) {
    value = value.replace(pattern, "");
  }
  for (const pattern of PROMO_PHRASE_PATTERNS) {
    value = value.replace(pattern, "");
  }
  return value;
}

function isPromotionalDetailLine(line) {
  const value = String(line || "").trim();
  if (!value) {
    return true;
  }
  if (isPromoLine(value)) {
    return true;
  }
  return COMPETITOR_CHANNEL_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

function sanitizeSourceForParsing(sourceText, options = {}) {
  const sourceRawText = String(sourceText || "").trim();
  const sourceReading = extractSourceReading(sourceRawText, { eventType: options.eventType || null });

  let sanitized = stripInlinePromoArtifacts(sourceRawText);
  sanitized = stripPromotionalFooter(sanitized);
  sanitized = stripPromotionalContent(sanitized);
  sanitized = sanitized
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0 && !isPromotionalDetailLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    sourceRawText,
    sanitizedText: sanitized,
    sourceReading,
    promoFooterRemoved: sourceRawText !== sanitized,
  };
}

module.exports = {
  sanitizeSourceForParsing,
  isPromotionalDetailLine,
  stripInlinePromoArtifacts,
  COMPETITOR_CHANNEL_PATTERNS,
};
