const {
  resolveCanonicalEventKey,
  CANONICAL_EVENT_DEFINITIONS,
} = require("../economic-releases/canonical-events");
const { resolveEventTypeFromAliases } = require("../news-intelligence/event-registry");
const { extractNumbers } = require("./fingerprint");
const { normalizeTitleText, isGenericTitle } = require("./editorial-title");

const FIELD_PATTERNS = {
  previous: [
    /(?:السابق|previous)\s*[:：]\s*([^\n]+)/i,
    /▪️\s*السابق\s*[:：]\s*([^\n]+)/i,
  ],
  forecast: [
    /(?:المتوقع|التقدير|forecast|consensus|expected)\s*[:：]\s*([^\n]+)/i,
    /▪️\s*(?:المتوقع|التقدير)\s*[:：]\s*([^\n]+)/i,
  ],
  actual: [
    /(?:الحالي|actual)\s*[:：]\s*([^\n]+)/i,
    /▫️\s*الحالي\s*[:：]\s*([^\n]+)/i,
  ],
  revisedPrevious: [/previous revised from\s+([^\n]+)/i, /تم revising.*?([0-9.%KMB]+)/i],
};

const HIGH_IMPACT_KEYS = new Set([
  "US_CPI_MOM",
  "US_CPI_YOY",
  "US_CORE_CPI_MOM",
  "US_CORE_CPI_YOY",
  "US_NFP",
  "US_FED_RATE_DECISION",
  "US_PPI_MOM",
  "US_PPI_YOY",
  "US_PCE",
  "US_CORE_PCE_MOM",
  "US_GDP_QOQ",
]);

function extractField(text, fieldName) {
  for (const pattern of FIELD_PATTERNS[fieldName] || []) {
    const match = String(text || "").match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return null;
}

function extractCountry(text) {
  const value = String(text || "");
  if (/🇺🇸|أمريكا|امريكا|الولايات المتحدة|united states|\bus\b/i.test(value)) {
    return "الولايات المتحدة";
  }
  if (/🇪🇺|أوروبا|euro area|ecb/i.test(value)) {
    return "منطقة اليورو";
  }
  if (/🇬🇧|بريطانيا|uk\b|bank of england/i.test(value)) {
    return "المملكة المتحدة";
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
    .replace(/🇺🇸|🇪🇺|🇬🇧/gu, "")
    .replace(/^(?:أمريكا|امريكا)\s*[-–—]\s*/i, "")
    .trim();
}

function isBreakingHeaderOnlyLine(line) {
  const cleaned = normalizeTitleText(stripLeadingDecorations(line));
  if (!cleaned) {
    return true;
  }
  return isGenericTitle(cleaned);
}

function extractEventTitle(text) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (isBreakingHeaderOnlyLine(line)) {
      continue;
    }
    if (/السابق|المتوقع|التقدير|الحالي|النتيجة|actual|forecast|previous/i.test(line)) {
      continue;
    }
    if (/^[•▪️▫️⬅️👉📊💎🔵]/.test(line)) {
      continue;
    }
    const cleaned = stripLeadingDecorations(line);
    if (cleaned.length >= 4 && cleaned.length <= 120 && !isGenericTitle(cleaned)) {
      return cleaned;
    }
  }

  for (const line of lines) {
    const cleaned = stripLeadingDecorations(line);
    if (cleaned.length >= 4 && cleaned.length <= 120 && !isGenericTitle(cleaned)) {
      return cleaned;
    }
  }

  return lines[0]?.slice(0, 120) || null;
}

function resolveCanonicalForTelegram(text) {
  const value = String(text || "");
  if (/s&p global|sp global|ratingdog|hsbc manufacturing|caixin pmi/i.test(value)) {
    return {
      eventKey: "US_SP_GLOBAL_PMI",
      arabicName: "مؤشر S&P Global PMI",
      requiresTripleTemplate: true,
      eventType: "structured_release",
    };
  }

  const aliasEventKey = resolveEventTypeFromAliases(value);
  if (aliasEventKey && CANONICAL_EVENT_DEFINITIONS[aliasEventKey]) {
    return {
      eventKey: aliasEventKey,
      ...CANONICAL_EVENT_DEFINITIONS[aliasEventKey],
    };
  }

  return resolveCanonicalEventKey(value);
}

function detectExclusiveAnalysis(text) {
  return /تحليل\s*خاص|exclusive analysis|our view|we think|في رأينا|r\s*\/o\b|via\s*@/i.test(
    String(text || "")
  );
}

function extractEntities(text) {
  const entities = new Set();
  const patterns = [
    /\bfed\b|\bfomc\b|\bpowell\b|\becb\b|\bboe\b/gi,
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
  const text = post.rawText || "";
  const previous = extractField(text, "previous");
  const forecast = extractField(text, "forecast");
  const actual = extractField(text, "actual");
  const revisedPrevious = extractField(text, "revisedPrevious");
  const country = extractCountry(text);
  const title = extractEventTitle(text);
  const period = extractPeriod(text);
  const canonical = resolveCanonicalForTelegram(`${title || ""} ${text}`);
  const resolvedEventKey = canonical.eventKey || resolveEventTypeFromAliases(`${title || ""} ${text}`);
  const isPlainFedNews =
    canonical.eventType === "plain_news" ||
    ["US_POWELL_SPEECH", "US_FED_STATEMENT"].includes(canonical.eventKey);
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
  const importance = HIGH_IMPACT_KEYS.has(canonical.eventKey) ? "high" : "normal";

  return {
    sourceChannel: post.sourceChannel,
    sourceMessageId: post.sourceMessageId,
    sourceUrl: post.sourceUrl,
    sourcePublishedAt: post.sourcePublishedAt,
    canonicalEventKey: resolvedEventKey || canonical.eventKey,
    title,
    country,
    eventType:
      resolvedEventKey ||
      (canonical.eventKey && canonical.eventKey !== "US_CPI_GENERIC" ? canonical.eventKey : null) ||
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
  isStructuredEconomicRelease,
  resolveCanonicalForTelegram,
  detectExclusiveAnalysis,
};
