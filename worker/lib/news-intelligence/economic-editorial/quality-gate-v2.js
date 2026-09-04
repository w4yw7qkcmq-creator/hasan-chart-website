const { evaluateCopySimilarity } = require("../copy-similarity-guard");
const { validateFactIntegrity } = require("../editorial-guards");
const { validateNumericTokenIntegrity } = require("./numeric-integrity");
const { readingDirectionMatchesPublished } = require("../../telegram-news/source-reading");
const { getEventArabicName } = require("./interpretation-registry");

const BLOCK_REASONS = {
  QUALITY_GATE_BLOCKED: "QUALITY_GATE_BLOCKED",
  MISSING_HEADLINE: "MISSING_HEADLINE",
  MISSING_CANONICAL_EVENT: "MISSING_CANONICAL_EVENT",
  MISSING_ACTUAL: "MISSING_ACTUAL",
  MISSING_FACTS_BLOCK: "MISSING_FACTS_BLOCK",
  SOURCE_URL_PRESENT: "SOURCE_URL_PRESENT",
  COMPETITOR_CHANNEL_PRESENT: "COMPETITOR_CHANNEL_PRESENT",
  PROMOTIONAL_ARTIFACT_BLOCKED: "PROMOTIONAL_ARTIFACT_BLOCKED",
  EXTERNAL_MENTION_PRESENT: "EXTERNAL_MENTION_PRESENT",
  RAW_SOURCE_FRAGMENT: "RAW_SOURCE_FRAGMENT",
  PLACEHOLDER_PRESENT: "PLACEHOLDER_PRESENT",
  BROKEN_ARABIC: "BROKEN_ARABIC",
  DUPLICATE_PARAGRAPH: "DUPLICATE_PARAGRAPH",
  CONFLICTING_NUMBERS: "CONFLICTING_NUMBERS",
  IMPACT_CLAIMS_ACTUAL_MOVE: "IMPACT_CLAIMS_ACTUAL_MOVE",
  INVENTED_READING_PRESENT: "INVENTED_READING_PRESENT",
  READING_WITHOUT_SOURCE: "READING_WITHOUT_SOURCE",
  HEADLINE_IDENTITY_MISMATCH: "HEADLINE_IDENTITY_MISMATCH",
  BODY_TOO_LONG: "BODY_TOO_LONG",
  BODY_TOO_SHORT: "BODY_TOO_SHORT",
  IMAGE_REQUIRED_MISSING: "IMAGE_REQUIRED_MISSING",
  INTERPRETATION_DIRECTION_MISMATCH: "INTERPRETATION_DIRECTION_MISMATCH",
};

const COMPETITOR_PATTERNS = [
  /forexbreakingnews/i,
  /forexnewspaper/i,
  /https?:\/\/(?:www\.)?telegram\.me\/(?!EconomicNewsi\b)/i,
  /https?:\/\/t\.me\/(?!EconomicNewsi\b)/i,
  /@[Ff]orex[Bb]reaking[Nn]ews\b/,
  /@[Ff]orex[Nn]ewspaper\b/,
  /لمتابعة[^\n]{0,120}(?:انضم|إنضم|اشترك)/iu,
  /(?:انضم|إنضم)\s*(?:لل)?(?:قناة|القناة)/iu,
];

const PLACEHOLDER_PATTERNS = [/\bundefined\b/i, /\bnull\b/i, /\[object Object\]/i, /غير متوفر/i];

const INVENTED_READING_PATTERNS = [
  /تعذر\s*تحديد\s*المقارنة\s*مع\s*التوقعات/iu,
  /تأثير\s*محدود\s*مبدئ/i,
  /قد\s*تؤثر\s*هذه\s*القراءة\s*على\s*توقعات\s*الفائدة/iu,
  /قد\s*تنعكس\s*هذه\s*التطورات\s*على\s*الدولار/iu,
  /•\s*الدولار:/iu,
  /•\s*الذهب:/iu,
  /•\s*الأسهم:/iu,
  /•\s*العملات\s*الرقمية:/iu,
];

const OFFICIAL_CHANNEL_FOOTER_PATTERN =
  /\n\n📢 قناة الأخبار الرسمية:\nhttps?:\/\/t\.me\/EconomicNewsi\/?\s*$/i;

function stripOfficialFooter(body) {
  return String(body || "").replace(OFFICIAL_CHANNEL_FOOTER_PATTERN, "").trim();
}

const ACTUAL_MOVE_PATTERNS = [
  /ارتفع الدولار/i,
  /انخفض الدولار/i,
  /الدولار ارتفع/i,
  /الدولار انخفض/i,
  /الذهب ارتفع/i,
  /الذهب انخفض/i,
  /the dollar rose/i,
  /the dollar fell/i,
];

function validateQualityGateV2(input = {}) {
  const {
    structured,
    body,
    structuredEvent,
    deterministic,
    rawSourceText,
    isFamily = false,
    telegramStructuredEconomic = false,
  } = input;
  const gateBody = stripOfficialFooter(body);

  if (!structured?.headline) {
    return fail(BLOCK_REASONS.MISSING_HEADLINE);
  }

  if (!structuredEvent?.eventType && !structuredEvent?.eventFamily) {
    return fail(BLOCK_REASONS.MISSING_CANONICAL_EVENT);
  }

  if (telegramStructuredEconomic && !isFamily) {
    if (!structuredEvent.actual && !structuredEvent.canonicalFacts?.actual) {
      return fail(BLOCK_REASONS.MISSING_ACTUAL);
    }
    const expectedHeadline = structuredEvent.canonicalDisplayName || getEventArabicName(structuredEvent.eventType);
    if (expectedHeadline && structured.headline !== expectedHeadline) {
      return fail(BLOCK_REASONS.HEADLINE_IDENTITY_MISMATCH);
    }
  }

  if (!isFamily && !structured.factsBlock) {
    return fail(BLOCK_REASONS.MISSING_FACTS_BLOCK);
  }

  if (isFamily && (!structured.children || !structured.children.length)) {
    return fail(BLOCK_REASONS.MISSING_FACTS_BLOCK);
  }

  if (!gateBody || gateBody.length < 40) {
    return fail(BLOCK_REASONS.BODY_TOO_SHORT);
  }

  if (gateBody.length > 3500) {
    return fail(BLOCK_REASONS.BODY_TOO_LONG);
  }

  for (const pattern of COMPETITOR_PATTERNS) {
    if (pattern.test(gateBody)) {
      return fail(BLOCK_REASONS.PROMOTIONAL_ARTIFACT_BLOCKED);
    }
  }

  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(gateBody)) {
      return fail(BLOCK_REASONS.PLACEHOLDER_PRESENT);
    }
  }

  if (/[\u0300-\u036f]{3,}/.test(gateBody)) {
    return fail(BLOCK_REASONS.BROKEN_ARABIC);
  }

  const paragraphs = gateBody.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const uniqueParagraphs = new Set(paragraphs);
  if (uniqueParagraphs.size !== paragraphs.length) {
    return fail(BLOCK_REASONS.DUPLICATE_PARAGRAPH);
  }

  for (const pattern of ACTUAL_MOVE_PATTERNS) {
    if (pattern.test(gateBody)) {
      return fail(BLOCK_REASONS.IMPACT_CLAIMS_ACTUAL_MOVE);
    }
  }

  if (telegramStructuredEconomic && !isFamily) {
    const hasReadingSection = /📊\s*القراءة:/u.test(body);
    const sourceReading = structuredEvent.sourceReading || null;
    if (hasReadingSection && !sourceReading?.raw) {
      return fail(BLOCK_REASONS.READING_WITHOUT_SOURCE);
    }
    if (!hasReadingSection && structured.interpretation) {
      return fail(BLOCK_REASONS.INVENTED_READING_PRESENT);
    }
    if (hasReadingSection) {
      for (const pattern of INVENTED_READING_PATTERNS) {
        if (pattern.test(gateBody)) {
          return fail(BLOCK_REASONS.INVENTED_READING_PRESENT);
        }
      }
      if (!readingDirectionMatchesPublished(sourceReading, structured.interpretation)) {
        return fail(BLOCK_REASONS.INTERPRETATION_DIRECTION_MISMATCH);
      }
    }
    if (!hasReadingSection) {
      for (const pattern of INVENTED_READING_PATTERNS) {
        if (pattern.test(gateBody)) {
          return fail(BLOCK_REASONS.INVENTED_READING_PRESENT);
        }
      }
    }
  }

  if (rawSourceText) {
    const copyCheck = evaluateCopySimilarity(gateBody, rawSourceText);
    if (!copyCheck.ok) {
      return fail(copyCheck.reason);
    }
  }

  if (!isFamily && structuredEvent.canonicalFacts) {
    const factCheck = validateFactIntegrity(structuredEvent.canonicalFacts, {
      actual: extractFieldFromBody(body, "الحالي"),
      forecast: extractFieldFromBody(body, "المتوقع"),
      previous: extractFieldFromBody(body, "السابق"),
    });
    if (!factCheck.ok) {
      return fail(BLOCK_REASONS.CONFLICTING_NUMBERS, factCheck);
    }
  }

  if (deterministic?.familyUsdBias === "MIXED" && /إيجابي للدولار|positive for the dollar/i.test(gateBody)) {
    return fail(BLOCK_REASONS.INTERPRETATION_DIRECTION_MISMATCH);
  }

  if (structured.visualPriority === "REQUIRED" && input.imageRequired && !input.imageResolved) {
    return fail(BLOCK_REASONS.IMAGE_REQUIRED_MISSING);
  }

  return { ok: true, reason: null };
}

function extractFieldFromBody(body, label) {
  const match = String(body || "").match(new RegExp(`${label}\\s*[:：]\\s*([^\\n]+)`, "i"));
  return match ? match[1].replace(/\u2066|\u2069/g, "").trim() : null;
}

function fail(reason, detail = null) {
  return {
    ok: false,
    reason: BLOCK_REASONS.QUALITY_GATE_BLOCKED,
    detail: reason,
    subReason: detail,
  };
}

module.exports = {
  BLOCK_REASONS,
  validateQualityGateV2,
};
