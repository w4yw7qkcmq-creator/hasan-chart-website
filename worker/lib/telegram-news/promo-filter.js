const PROMO_LINE_PATTERN =
  /^(?:اشترك|انضم|إنضم|join(?:\s+our\s+channel)?|subscribe|تابعنا|follow\s*us|تواصل\s*معنا|افتح\s*حساب|open\s*account|promo\s*code|referral|broker|exness|\bxm\b|⬤\s*قناة|📚|please\s*open\s*telegram|https?:\/\/t\.me\/\S+|@forex\w+)/i;

const PROMO_ONLY_BODY_PATTERN =
  /^(?:اخبار\s*الفوركس\s*العاجلة\s*📊\s*📚?|[\s📊📚🔔⬤]+|https?:\/\/t\.me\/\S+\s*)$/i;

const NEWS_SIGNAL_PATTERN =
  /صدر\s*الآن|السابق|الحالي|المتوقع|عاجل|breaking|gold|bitcoin|fed|fomc|powell|iran|trump|oil|نفط|ذهب|دولار|cpi|nfp|gdp|pmi|ism|🇺🇸|🟥|🚨|percent|%/i;

function isPromoLine(line) {
  const value = String(line || "").trim();
  if (!value) {
    return false;
  }
  return PROMO_LINE_PATTERN.test(value);
}

function stripPromotionalFooter(text) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  while (lines.length > 0) {
    const lastLine = lines[lines.length - 1];
    if (isPromoLine(lastLine)) {
      lines.pop();
      continue;
    }
    break;
  }

  return lines.join("\n").trim();
}

function isPromotionOnly(text) {
  const cleaned = stripPromotionalFooter(text);
  if (!cleaned || cleaned.length < 12) {
    return true;
  }

  if (PROMO_ONLY_BODY_PATTERN.test(cleaned)) {
    return true;
  }

  if (/^https?:\/\/t\.me\/\S+$/i.test(cleaned)) {
    return true;
  }

  if (!NEWS_SIGNAL_PATTERN.test(cleaned) && /(?:exness|\bxm\b|broker|referral|promo|اشترك|انضم)/i.test(cleaned)) {
    return true;
  }

  return false;
}

module.exports = {
  isPromoLine,
  stripPromotionalFooter,
  isPromotionOnly,
};
