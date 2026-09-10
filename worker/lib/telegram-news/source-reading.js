const { normalizeArabicForPromoMatching, stripInlinePromoSegment } = require("./promo-filter");

const READING_LINE_PATTERNS = [
  /^[\s👈➡️⬅️✍️]*النتيجة\s*[:：]\s*(.+)$/iu,
  /^[\s👈➡️⬅️✍️]*النتيجة\s+(.+)$/iu,
];

const INLINE_READING_PATTERNS = [
  /(?:•|👈)\s*النتيجة\s*[:：]\s*(.+)$/iu,
  /النتيجة\s*[:：]\s*(.+)$/iu,
];

const INVENTORY_READING_PATTERNS = [
  /(?:نقص|انخفاض|تراجع)\s*المخزون\s*[^.\n]{0,40}(?:إيجابي|ايجابي)[^.\n]{0,40}(?:للنفط|لأسعار\s*النفط)/iu,
  /(?:زيادة|ارتفاع)\s*المخزون\s*[^.\n]{0,40}(?:سلبي|سلبية)[^.\n]{0,40}(?:للنفط|لأسعار\s*النفط)/iu,
  /(?:inventory\s*draw|drawdown)[^.\n]{0,40}(?:bullish|positive)[^.\n]{0,40}(?:oil|crude)/iu,
  /(?:inventory\s*build|buildup)[^.\n]{0,40}(?:bearish|negative)[^.\n]{0,40}(?:oil|crude)/iu,
];

function cleanReadingFragment(value) {
  return String(value || "")
    .replace(/^[\s👈➡️⬅️✍️🔴🔵▪️▫️]+/u, "")
    .replace(/[\s👇]+$/u, "")
    .trim();
}

function inferDirection(text) {
  const value = String(text || "");
  if (/(?:إيجابي|ايجابي|positive|bullish|supportive|داعم|داعمة)/iu.test(value)) {
    return "POSITIVE";
  }
  if (/(?:سلبي|سلبية|negative|bearish|ضاغط|ضاغطة)/iu.test(value)) {
    return "NEGATIVE";
  }
  if (/(?:محايد|neutral|محدود|inline|كما\s*هو\s*متوقع)/iu.test(value)) {
    return "NEUTRAL";
  }
  return null;
}

function inferAsset(text, eventType = null) {
  const value = String(text || "");
  const key = String(eventType || "");
  if (/EIA_.*INVENTOR|CRUDE|GASOLINE|DISTILLATE|CUSHING/i.test(key) || /(?:النفط|نفط|oil|crude|برنت|wti)/iu.test(value)) {
    return "OIL";
  }
  if (/(?:الدولار|دولار|usd|\$)/iu.test(value)) {
    return "USD";
  }
  if (/(?:الذهب|gold|xau)/iu.test(value)) {
    return "GOLD";
  }
  if (/(?:الأسهم|stocks|equities|nasdaq|s&p)/iu.test(value)) {
    return "STOCKS";
  }
  if (/(?:الباوند|pound|gbp|sterling)/iu.test(value)) {
    return "GBP";
  }
  if (/(?:اليورو|euro|eur)/iu.test(value)) {
    return "EUR";
  }
  return null;
}

function buildNormalizedText(raw, direction, asset) {
  const cleaned = cleanReadingFragment(raw);
  if (!cleaned) {
    return null;
  }

  if (/^النتيجة\s*[:：]/iu.test(cleaned)) {
    const inner = cleaned.replace(/^النتيجة\s*[:：]\s*/iu, "").trim();
    return `النتيجة ${inner.endsWith(".") ? inner : `${inner}.`}`;
  }

  if (direction === "POSITIVE" && asset === "USD") {
    return "النتيجة إيجابية للدولار الأمريكي.";
  }
  if (direction === "NEGATIVE" && asset === "USD") {
    return "النتيجة سلبية للدولار الأمريكي.";
  }
  if (direction === "POSITIVE" && asset === "OIL") {
    return "النتيجة داعمة لأسعار النفط الأمريكي.";
  }
  if (direction === "NEGATIVE" && asset === "OIL") {
    return "النتيجة ضاغطة على أسعار النفط الأمريكي.";
  }
  if (direction === "NEUTRAL" && asset === "USD") {
    return "النتيجة محايدة للدولار الأمريكي.";
  }
  if (direction === "POSITIVE" && asset === "EUR") {
    return cleaned.endsWith(".") ? cleaned : `${cleaned}.`;
  }
  if (direction === "NEGATIVE" && asset === "EUR") {
    return cleaned.endsWith(".") ? cleaned : `${cleaned}.`;
  }

  return cleaned.endsWith(".") ? cleaned : `${cleaned}.`;
}

function trimReadingAtPromoBoundary(fragment) {
  let value = stripInlinePromoSegment(String(fragment || ""));
  value = value.split(/📚|👇|»/)[0];
  const normalized = normalizeArabicForPromoMatching(value);
  const stop = normalized.search(
    /(?:لمتابعة|\u0627\u0646\u0636\u0645|\u0627\u0634\u062a\u0631\u0643|telegram\.me|t\.me\/|forexbreakingnews|forexnewspaper)/
  );
  if (stop >= 0) {
    value = value.slice(0, stop);
  }
  return cleanReadingFragment(value);
}

function extractSourceReadingRaw(text) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    for (const pattern of READING_LINE_PATTERNS) {
      const match = line.match(pattern);
      if (match?.[1]) {
        return cleanReadingFragment(match[1]);
      }
    }
    if (/^النتيجة\s*[:：]/iu.test(line)) {
      return cleanReadingFragment(line.replace(/^النتيجة\s*[:：]\s*/iu, ""));
    }
  }

  const joined = lines.join("\n");
  for (const pattern of INVENTORY_READING_PATTERNS) {
    const match = joined.match(pattern);
    if (match?.[0]) {
      return cleanReadingFragment(match[0]);
    }
  }

  for (const line of lines) {
    for (const pattern of INLINE_READING_PATTERNS) {
      const match = line.match(pattern);
      if (match?.[1]) {
        const trimmed = trimReadingAtPromoBoundary(match[1]);
        if (trimmed) {
          return trimmed;
        }
      }
    }
  }

  for (const line of lines) {
    const inlineMatch = line.match(
      /(?:^|[\d.%KMBkmb\s•👈➡️-]+)\s*(?:•|👈)\s*النتيجة\s*[:：]\s*(.+)$/iu
    );
    if (inlineMatch?.[1]) {
      const trimmed = trimReadingAtPromoBoundary(inlineMatch[1]);
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return null;
}

function normalizeSourceReading(raw, options = {}) {
  if (!raw) {
    return null;
  }
  const direction = inferDirection(raw);
  const asset = inferAsset(raw, options.eventType);
  const normalizedText = buildNormalizedText(raw, direction, asset);
  if (!normalizedText) {
    return null;
  }
  return {
    direction,
    asset,
    raw: String(raw).trim(),
    normalizedText,
  };
}

function extractSourceReading(text, options = {}) {
  const raw = extractSourceReadingRaw(text);
  if (!raw) {
    return null;
  }
  return normalizeSourceReading(raw, options);
}

function paraphrasePublishedReading(sourceReading) {
  if (!sourceReading?.normalizedText) {
    return null;
  }
  return sourceReading.normalizedText;
}

function readingDirectionMatchesPublished(sourceReading, publishedText) {
  if (!sourceReading?.direction || !publishedText) {
    return true;
  }
  const text = String(publishedText);
  if (sourceReading.direction === "POSITIVE") {
    return /(?:إيجاب|داعم|داعمة|positive|bullish)/iu.test(text);
  }
  if (sourceReading.direction === "NEGATIVE") {
    return /(?:سلب|ضاغط|negative|bearish)/iu.test(text);
  }
  if (sourceReading.direction === "NEUTRAL") {
    return /(?:محايد|neutral|محدود|inline)/iu.test(text);
  }
  return true;
}

module.exports = {
  extractSourceReadingRaw,
  normalizeSourceReading,
  extractSourceReading,
  paraphrasePublishedReading,
  readingDirectionMatchesPublished,
  inferDirection,
  inferAsset,
};
