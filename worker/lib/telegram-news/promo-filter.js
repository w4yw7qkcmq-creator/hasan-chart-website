const PROMO_SIGNALS = [
  /\bexness\b/i,
  /\bxm\b/i,
  /one\.exness/i,
  /افتح\s*حساب/i,
  /افتح\s*حسابك/i,
  /سجل\s*الآن/i,
  /رابط\s*التسجيل/i,
  /رابط\s*الإحالة/i,
  /referral/i,
  /promo\s*code/i,
  /broker/i,
  /وسيط/i,
  /خصم/i,
  /بونص|bonus/i,
  /سبريد/i,
  /عمولة/i,
  /اشتراك\s*شهري/i,
  /اشتراك\s*3\s*أشهر/i,
  /تخفيض\s*سعر\s*الاشتراك/i,
  /القنوات\s*الخاصة/i,
  /قناة\s*المضاربات/i,
  /توصيات\s*مدفوعة/i,
  /\bvip\b/i,
  /تواصل\s*معنا/i,
  /انضم\s*الآن/i,
  /اشترك\s*الآن/i,
  /العرض\s*لفترة\s*محدودة/i,
  /حصاد\s*أسبوع/i,
  /توصياتنا/i,
  /100\s*\$?\s*→?\s*75/i,
  /100\s*دولار/i,
  /75\s*دولار/i,
  /affiliate/i,
  /open\s*account/i,
  /register\s*now/i,
];

const PROMO_LINE_PATTERN =
  /^(?:اشترك|انضم|إنضم|join(?:\s+our\s+channel)?|subscribe|تابعنا|follow\s*us|تواصل\s*معنا|افتح\s*حساب|open\s*account|promo\s*code|referral|broker|exness|\bxm\b|⬤\s*قناة|📚|please\s*open\s*telegram|https?:\/\/t\.me\/\S+|@forex\w+|one\.exness)/i;

const NEWS_SIGNAL_PATTERN =
  /صدر\s*الآن|السابق|الحالي|المتوقع|عاجل|breaking|gold|bitcoin|fed|fomc|powell|iran|trump|oil|نفط|ذهب|دولار|cpi|nfp|gdp|pmi|ism|ترامب|إيران|تصريح|بيان|🇺🇸|🟥|🚨|percent|%/i;

function detectPromotionSignals(text) {
  const value = String(text || "");
  const signals = [];
  for (const pattern of PROMO_SIGNALS) {
    if (pattern.test(value)) {
      signals.push(pattern.source.slice(0, 40));
    }
  }
  return [...new Set(signals)];
}

function isPromoLine(line) {
  const value = String(line || "").trim();
  if (!value) {
    return false;
  }
  return PROMO_LINE_PATTERN.test(value) || PROMO_SIGNALS.some((p) => p.test(value));
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

function stripPromotionalContent(text) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isPromoLine(line))
    .filter((line) => !/^https?:\/\/(?:one\.)?exness/i.test(line))
    .filter((line) => !/forexbreakingnews|forexnewspaper/i.test(line));

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function hasRealNewsContent(text) {
  const cleaned = stripPromotionalContent(stripPromotionalFooter(text));
  if (!cleaned || cleaned.length < 25) {
    return false;
  }

  if (/^https?:\/\/\S+$/i.test(cleaned)) {
    return false;
  }

  const hasStructured = /السابق|المتوقع|الحالي|previous|forecast|actual/i.test(cleaned);
  const hasEvent = /صدر\s*الآن|عاجل|breaking|fed|fomc|cpi|nfp|gdp|pmi|ism|powell|ترامب|trump|iran|إيران|الذهب|gold|النفط|oil|bitcoin|nasdaq|dow|logan|تصريح|statement/i.test(
    cleaned
  );
  const hasSubstance = cleaned.split(/\s+/).length >= 8;

  return (hasStructured || hasEvent) && hasSubstance;
}

function isPromotionOnly(text) {
  const signals = detectPromotionSignals(text);
  const cleaned = stripPromotionalContent(stripPromotionalFooter(text));

  if (!cleaned || cleaned.length < 12) {
    return true;
  }

  if (/^(?:اخبار\s*الفوركس\s*العاجلة\s*📊\s*📚?|[\s📊📚🔔⬤]+)$/i.test(cleaned)) {
    return true;
  }

  if (/^https?:\/\/t\.me\/\S+$/i.test(cleaned)) {
    return true;
  }

  if (signals.length >= 2 && !hasRealNewsContent(text)) {
    return true;
  }

  if (/^(?:exness|\bxm\b).{0,120}$/i.test(cleaned) && !NEWS_SIGNAL_PATTERN.test(cleaned)) {
    return true;
  }

  if (/قناة\s*المضاربات|حصاد\s*أسبوع|توصياتنا|100\s*\$|75\s*\$/i.test(cleaned) && !/السابق|المتوقع|الحالي|صدر\s*الآن/i.test(cleaned)) {
    return true;
  }

  return false;
}

module.exports = {
  PROMO_SIGNALS,
  isPromoLine,
  stripPromotionalFooter,
  stripPromotionalContent,
  detectPromotionSignals,
  hasRealNewsContent,
  isPromotionOnly,
};
