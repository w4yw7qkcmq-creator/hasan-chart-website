const {
  resolveCanonicalEventKey,
  CANONICAL_EVENT_DEFINITIONS,
} = require("../economic-releases/canonical-events");
const { resolveEventTypeFromAliases } = require("../news-intelligence/event-registry");
const { resolveCountryCode } = require("../economic-releases/country-resolver");
const { normalizeTextForMatching, normalizeArabicIndicDigits } = require("../economic-releases/text-normalization");
const { extractNumbers } = require("./fingerprint");
const { normalizeTitleText, isGenericTitle } = require("./editorial-title");

const FIELD_PATTERNS = {
  previous: [
    /(?:السابق|previous|previous rate|الفائدة السابقة|القرار السابق)\s*[:：]?\s*([^\n]+)/i,
    /▪️\s*السابق\s*[:：]?\s*([^\n]+)/i,
    /🔴\s*السابق\s*[:：]?\s*([^\n]+)/i,
  ],
  forecast: [
    /(?:المتوقع|التقدير|forecast|consensus|expected|expected rate|الفائدة المتوقعة|التوقعات)\s*[:：]?\s*([^\n]+)/i,
    /▪️\s*(?:المتوقع|التقدير)\s*[:：]?\s*([^\n]+)/i,
    /🔴\s*(?:المتوقع|التقدير)\s*[:：]?\s*([^\n]+)/i,
  ],
  actual: [
    /(?:الحالي|actual|current rate|new rate|key rate|rate decision|الفائدة الجديدة|القرار الحالي)\s*[:：]?\s*([^\n]+)/i,
    /▫️\s*الحالي\s*[:：]?\s*([^\n]+)/i,
    /🔵\s*الحالي\s*[:：]?\s*([^\n]+)/i,
  ],
  revisedPrevious: [/previous revised from\s+([^\n]+)/i, /تم revising.*?([0-9.%KMB]+)/i],
};

const COUNTRY_DISPLAY = {
  US: "الولايات المتحدة",
  UK: "المملكة المتحدة",
  EZ: "منطقة اليورو",
  CA: "كندا",
  AU: "أستراليا",
  JP: "اليابان",
  CN: "الصين",
  CH: "\u0633\u0648\u064a\u0633\u0631\u0627",
  RU: "روسيا",
  DE: "ألمانيا",
  FR: "فرنسا",
};

const HIGH_IMPACT_KEYS = new Set(
  Object.keys(CANONICAL_EVENT_DEFINITIONS).filter((key) => {
    const def = CANONICAL_EVENT_DEFINITIONS[key];
    return def.requiresTripleTemplate !== false && def.eventType !== "plain_news";
  })
);

function sanitizeFieldValue(value) {
  if (!value) {
    return null;
  }
  let cleaned = String(value).trim();
  cleaned = cleaned.split(/🔴|🔵|▪️|▫️|✍️|👇|🇬🇧|🇺🇸|🇪🇺|🇨🇭|🇷🇺|➡️/)[0].trim();
  cleaned = cleaned.split(/\s+(?:المتوقع|التقدير|الحالي|forecast|actual|previous|السابق)\s*[:：]/i)[0].trim();
  return cleaned || null;
}

function extractRateDecisionAction(text) {
  const value = String(text || "");
  const hikeMatch = value.match(
    /(?:rate\s+hike|hiked|raised|increase(?:d)?|(?:رفع|رفعت)\s+(?:الفائدة|سعر\s+الفائدة)?|(?:\+|-)?\d+\s*(?:bp|bps|نقطة|نقاط\s+أساس))[^\n]{0,80}/i
  );
  const cutMatch = value.match(
    /(?:rate\s+cut|cut(?:ting)?|lowered|decrease(?:d)?|(?:خفض|خفضت)\s+(?:الفائدة|سعر\s+الفائدة)?)[^\n]{0,80}/i
  );
  const holdMatch = value.match(
    /(?:unchanged|no change|hold(?:ing)?|kept|left\s+unchanged|ثبات|بدون\s+تغيير|ابق(?:اء|ى)?(?:ت)?\s+على)[^\n]{0,80}/i
  );
  if (hikeMatch) return sanitizeFieldValue(hikeMatch[0]);
  if (cutMatch) return sanitizeFieldValue(cutMatch[0]);
  if (holdMatch) return sanitizeFieldValue(holdMatch[0]);
  return null;
}

function isRateDecisionCanonical(canonical, resolvedEventKey) {
  const key = resolvedEventKey || canonical?.eventKey;
  if (!key) return false;
  const def = CANONICAL_EVENT_DEFINITIONS[key];
  return def?.eventType === "rate_decision" || canonical?.eventType === "rate_decision";
}
function extractField(text, fieldName) {
  const normalizedText = normalizeArabicIndicDigits(text);
  for (const pattern of FIELD_PATTERNS[fieldName] || []) {
    const match = String(normalizedText || "").match(pattern);
    if (match?.[1]) {
      return sanitizeFieldValue(match[1].trim());
    }
  }
  return null;
}

function extractInlineEventTitle(text) {
  const value = String(text || "");
  const inlineMatch = value.match(
    /(?:🔴|▪️|🟥)?\s*(?:مؤشر|تقرير|بيانات|مبيعات|معدل|الناتج|قرar|محضr|طلبات|فرص|متوسط|بدايات|تراخيص|الميزان|الحساب|الإنتاج|استغlال|طلبيات|مديري)[^\n🔴🔵▪️▫️✍️👇]{4,120}/i
  );
  if (inlineMatch?.[0]) {
    return stripLeadingDecorations(inlineMatch[0]).slice(0, 120);
  }
  return null;
}

function extractCountryCode(text) {
  return resolveCountryCode(text);
}

function extractCountry(text) {
  const code = extractCountryCode(text);
  if (code && COUNTRY_DISPLAY[code]) {
    return COUNTRY_DISPLAY[code];
  }
  return null;
}

function extractPeriod(text) {
  const match = String(text || "").match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\b\d{4}[-/]\d{2}|\bq[1-4]\s*\d{4}/i
  );
  return match ? match[0] : null;
}

function stripLeadingDecorations(line) {
  return String(line || "")
    .replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+/gu, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/🇺🇸|🇪🇺|🇬🇧|🇨🇦|🇦🇺|🇯🇵|🇨🇳|🇨🇭|🇷🇺/gu, "")
    .replace(/^(?:أمريكا|امريكا|إنكلترا|انكلترا|بريطانيا|كندا|أستراليا|استراليا|اليابان|الصين|سويسرا|روسيا)\s*[-–—]\s*/i, "")
    .trim();
}

function isBreakingHeaderOnlyLine(line) {
  const cleaned = normalizeTitleText(stripLeadingDecorations(line));
  if (!cleaned) {
    return true;
  }
  return isGenericTitle(cleaned);
}

function isCountryOnlyLine(cleaned) {
  const value = normalizeTitleText(cleaned).toLowerCase();
  if (!value) {
    return true;
  }
  return /^(?:أمريكا|امريكا|الولايات المتحدة|united states|usa|us|إنكلترا|انكلترا|بريطانيا|uk|كندا|canada|أستراليا|استراليا|australia|اليابان|japan|الصين|china)$/i.test(
    value
  );
}

function isLikelyStructuredReleaseTitle(cleaned, fullText = "") {
  const value = normalizeTitleText(cleaned);
  if (!value || isGenericTitle(value) || isCountryOnlyLine(value)) {
    return false;
  }

  const countryCode = extractCountryCode(fullText);
  const combined = `${value}\n${fullText}`;
  if (resolveEventTypeFromAliases(combined, { countryCode })) {
    return true;
  }

  const canonical = resolveCanonicalEventKey(combined, { countryCode });
  if (canonical?.eventKey) {
    return true;
  }

  return /مؤشر|pmi|purchasing managers|مديري المشتريات|jobless|claims|cpi|nfp|gdp|ppi|pce|fed|fomc|ism|retail sales|consumer confidence|michigan|industrial production|housing|trade balance|adp|jolts|average hourly|empire state|durable goods|factory orders|capacity utilization|minutes|محضr/i.test(
    value
  );
}

function scoreEventTitleCandidate(cleaned, fullText) {
  let score = Math.min(String(cleaned || "").length, 120);
  if (isCountryOnlyLine(cleaned)) {
    score -= 200;
  }
  if (isLikelyStructuredReleaseTitle(cleaned, fullText)) {
    score += 250;
  }
  return score;
}

function extractEventTitle(text) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let bestTitle = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const line of lines) {
    if (isBreakingHeaderOnlyLine(line)) {
      continue;
    }
    if (/السابق|المتوقع|التقدير|الحالي|النتيجة|actual|forecast|previous/i.test(line)) {
      continue;
    }
    if (/^[•▪️▫️⬅️👉📊💎🔵🔴]/.test(line)) {
      const cleanedDecorated = stripLeadingDecorations(line);
      if (cleanedDecorated.length >= 4 && cleanedDecorated.length <= 120 && !isGenericTitle(cleanedDecorated)) {
        const score = scoreEventTitleCandidate(cleanedDecorated, text);
        if (score > bestScore) {
          bestScore = score;
          bestTitle = cleanedDecorated;
        }
      }
      continue;
    }
    const cleaned = stripLeadingDecorations(line);
    if (cleaned.length >= 4 && cleaned.length <= 120 && !isGenericTitle(cleaned)) {
      const score = scoreEventTitleCandidate(cleaned, text);
      if (score > bestScore) {
        bestScore = score;
        bestTitle = cleaned;
      }
    }
  }

  if (bestTitle) {
    return bestTitle;
  }

  const inlineTitle = extractInlineEventTitle(text);
  if (inlineTitle) {
    return inlineTitle;
  }

  for (const line of lines) {
    const cleaned = stripLeadingDecorations(line);
    if (cleaned.length >= 4 && cleaned.length <= 120 && !isGenericTitle(cleaned)) {
      return cleaned;
    }
  }

  return lines[0]?.slice(0, 120) || null;
}

function resolveCanonicalForTelegram(text, options = {}) {
  const value = normalizeTextForMatching(text);
  const countryCode = options.countryCode || extractCountryCode(value);

  const aliasEventKey = resolveEventTypeFromAliases(value, { countryCode });
  if (aliasEventKey && CANONICAL_EVENT_DEFINITIONS[aliasEventKey]) {
    return {
      eventKey: aliasEventKey,
      country: countryCode || aliasEventKey.split("_")[0],
      ...CANONICAL_EVENT_DEFINITIONS[aliasEventKey],
    };
  }

  if (/s&p global|sp global|ratingdog|hsbc manufacturing|caixin pmi/i.test(value)) {
    const prefix = countryCode || "US";
    if (/services|الخدم/i.test(value)) {
      const key = `${prefix}_SP_GLOBAL_FLASH_SERVICES_PMI`;
      if (CANONICAL_EVENT_DEFINITIONS[key]) {
        return { eventKey: key, country: prefix, ...CANONICAL_EVENT_DEFINITIONS[key] };
      }
      if (prefix === "US") {
        return {
          eventKey: "US_SP_GLOBAL_FLASH_SERVICES_PMI",
          country: "US",
          ...CANONICAL_EVENT_DEFINITIONS.US_SP_GLOBAL_FLASH_SERVICES_PMI,
        };
      }
      const generic = `${prefix}_SERVICES_PMI`;
      if (CANONICAL_EVENT_DEFINITIONS[generic]) {
        return { eventKey: generic, country: prefix, ...CANONICAL_EVENT_DEFINITIONS[generic] };
      }
    }
    if (/manufacturing|الصناع|التصنيع/i.test(value)) {
      const key = `${prefix}_SP_GLOBAL_FLASH_MANUFACTURING_PMI`;
      if (CANONICAL_EVENT_DEFINITIONS[key]) {
        return { eventKey: key, country: prefix, ...CANONICAL_EVENT_DEFINITIONS[key] };
      }
      if (prefix === "US") {
        return {
          eventKey: "US_SP_GLOBAL_FLASH_MANUFACTURING_PMI",
          country: "US",
          ...CANONICAL_EVENT_DEFINITIONS.US_SP_GLOBAL_FLASH_MANUFACTURING_PMI,
        };
      }
      const generic = `${prefix}_MANUFACTURING_PMI`;
      if (CANONICAL_EVENT_DEFINITIONS[generic]) {
        return { eventKey: generic, country: prefix, ...CANONICAL_EVENT_DEFINITIONS[generic] };
      }
    }
    const composite = `${prefix}_SP_GLOBAL_PMI`;
    if (CANONICAL_EVENT_DEFINITIONS[composite]) {
      return { eventKey: composite, country: prefix, ...CANONICAL_EVENT_DEFINITIONS[composite] };
    }
    if (prefix === "US" && CANONICAL_EVENT_DEFINITIONS.US_SP_GLOBAL_PMI) {
      return {
        eventKey: "US_SP_GLOBAL_PMI",
        country: "US",
        ...CANONICAL_EVENT_DEFINITIONS.US_SP_GLOBAL_PMI,
      };
    }
  }

  return resolveCanonicalEventKey(value, { countryCode });
}

function detectExclusiveAnalysis(text) {
  return /تحليل\s*خاص|exclusive analysis|our view|we think|في رأينا|r\s*\/o\b|via\s*@/i.test(
    String(text || "")
  );
}

function extractEntities(text) {
  const entities = new Set();
  const patterns = [
    /\bfed\b|\bfomc\b|\bpowell\b|\becb\b|\bboe\b|\bboj\b|\bboc\b|\brba\b|\bsnb\b|\bcbr\b/gi,
    /\bgold\b|\bxau\b|الذهب/gi,
    /\bbitcoin\b|\bbtc\b|بيتكوين/gi,
    /\bnfp\b|\bcpi\b|\bppi\b|\bgdp\b/gi,
  ];
  for (const pattern of patterns) {
    const match = String(text || "").match(pattern);
    if (match) {
      entities.add(match[0].toLowerCase());
    }
  }
  return [...entities];
}

function buildFactualSummary(facts, detailLines) {
  const parts = [facts.title, facts.previous, facts.forecast, facts.actual, ...detailLines.slice(0, 3)]
    .filter(Boolean)
    .map((part) => String(part).trim());
  return parts.join(" | ").slice(0, 500);
}

function isStructuredEconomicRelease(text, canonical) {
  const previous = extractField(text, "previous");
  const forecast = extractField(text, "forecast");
  const actual = extractField(text, "actual");
  const hasAnyTriple = Boolean(previous || forecast || actual);
  if (canonical?.requiresTripleTemplate === false) {
    return false;
  }
  return hasAnyTriple || Boolean(canonical?.eventKey && canonical?.requiresTripleTemplate !== false);
}

function extractFactsFromTelegramPost(post) {
  const text = normalizeArabicIndicDigits(post.rawText || "");
  let previous = extractField(text, "previous");
  let forecast = extractField(text, "forecast");
  let actual = extractField(text, "actual");
  const revisedPrevious = extractField(text, "revisedPrevious");
  const countryCode = extractCountryCode(text);
  const country = extractCountry(text) || COUNTRY_DISPLAY[countryCode] || null;
  const title = extractEventTitle(text);
  const period = extractPeriod(text);
  const combined = `${title || ""} ${text}`;
  const canonical = resolveCanonicalForTelegram(combined, { countryCode });
  const resolvedEventKey =
    canonical.eventKey || resolveEventTypeFromAliases(combined, { countryCode });
  const rateDecision = isRateDecisionCanonical(canonical, resolvedEventKey);
  if (rateDecision && !actual) {
    actual = extractRateDecisionAction(text);
  }
  const isPlainFedNews =
    canonical.eventType === "plain_news" ||
    ["US_POWELL_SPEECH", "US_FED_STATEMENT", "US_FOMC_MINUTES"].includes(canonical.eventKey);
  const hasTripleFields = Boolean(previous || forecast || actual);
  const isStructuredTriple =
    !isPlainFedNews &&
    hasTripleFields &&
    (canonical.eventKey ? canonical.requiresTripleTemplate !== false : hasTripleFields);
  const isEconomic = isStructuredEconomicRelease(text, canonical);

  const detailLines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter(
      (line) =>
        !/^(?:السابق|المتوقع|التقدير|الحالي|النتيجة|actual|forecast|previous)\s*[:：]/i.test(line) &&
        !/^⬤|^📚|^Telegram|^Please open/i.test(line)
    );

  const numbers = [...new Set([previous, forecast, actual, revisedPrevious, ...extractNumbers(text)].filter(Boolean))];
  const importance = HIGH_IMPACT_KEYS.has(resolvedEventKey || canonical.eventKey) ? "high" : "normal";

  return {
    sourceChannel: post.sourceChannel,
    sourceMessageId: post.sourceMessageId,
    sourceUrl: post.sourceUrl,
    sourcePublishedAt: post.sourcePublishedAt,
    countryCode: countryCode || canonical.country || null,
    canonicalEventKey: resolvedEventKey || canonical.eventKey,
    title,
    country,
    eventType:
      resolvedEventKey ||
      (canonical.eventKey && !String(canonical.eventKey).endsWith("_CPI_GENERIC")
        ? canonical.eventKey
        : null) ||
      (isStructuredTriple ? "structured_release" : "general"),
    period,
    previous,
    revisedPrevious,
    forecast,
    actual,
    unit: null,
    importance,
    entities: extractEntities(text),
    numbers,
    rawNumbers: numbers,
    scheduledAt: post.sourcePublishedAt,
    factualSummary: buildFactualSummary({ title, previous, forecast, actual }, detailLines),
    exclusiveAnalysisDetected: detectExclusiveAnalysis(text),
    canonical,
    isEconomic,
    isStructuredTriple,
    isPlainFedNews,
    detailLines,
  };
}

module.exports = {
  extractFactsFromTelegramPost,
  extractField,
  extractCountry,
  extractCountryCode,
  isStructuredEconomicRelease,
  resolveCanonicalForTelegram,
  detectExclusiveAnalysis,
  COUNTRY_DISPLAY,
};
