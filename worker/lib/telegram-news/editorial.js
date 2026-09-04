const { normalizeSentence, uniqueNonEmpty } = require("./repetition");
const { resolveEditorialTitle, buildEconomicEditorialTitle } = require("./editorial-title");
const {
  buildConciseStructuredFallback,
  buildMinimalStructuredFallback,
} = require("./concise-editorial");

const CHANNEL_NAME_PATTERN = /forexbreakingnews|forexnewspaper|ForexBreakingNews|ForexNewspaper/i;
const PROMO_URL_PATTERN = /https?:\/\/(?:one\.)?exness|t\.me\/(?:Forex|joinchat|\+)/i;

function createEditorialMetrics() {
  return {
    aiEditorialAccepted: 0,
    aiEditorialRetryAccepted: 0,
    aiEditorialTooSimilar: 0,
    structuredFallbackUsed: 0,
    structuredFallbackRejected: 0,
  };
}

function buildStructuredFactsForEditorial(facts, post, classification = {}) {
  const preEvent = classification.preEvent || null;
  return {
    category: facts.isStructuredTriple
      ? "economic_release"
      : classification.classification || "market_update",
    eventType: facts.canonicalEventKey || facts.eventKey || null,
    titleFact: facts.title || null,
    country: facts.country || null,
    organization: facts.entities?.[0] || null,
    officials: (facts.entities || []).filter((e) => /powell|trump|ترامب|logan|لوغان|fed/i.test(e)),
    companies: (facts.entities || []).filter((e) => /apple|tesla|nvidia|amazon|microsoft/i.test(e)),
    previous: facts.previous || facts.revisedPrevious || null,
    forecast: facts.forecast || null,
    actual: facts.actual || null,
    unit: facts.unit || null,
    keyNumbers: uniqueNonEmpty([...(facts.numbers || []), ...(facts.rawNumbers || [])]),
    factualPoints: uniqueNonEmpty(facts.detailLines || []),
    isPreEventAlert: classification.classification === "pre_event_alert",
    preEventMinutes: preEvent?.minutes || null,
    preEventEventName: preEvent?.eventName || null,
    sourcePublishedAt: post.sourcePublishedAt || null,
    isPlainFedNews: facts.isPlainFedNews === true,
    isStructuredTriple: facts.isStructuredTriple === true,
  };
}

function buildRuleBasedEditorialDraft(structuredFacts, facts = {}) {
  if (structuredFacts.isPreEventAlert) {
    const minutes = structuredFacts.preEventMinutes || 5;
    const eventName = structuredFacts.preEventEventName || structuredFacts.titleFact;
    if (!eventName) {
      return { ok: false, reason: "PRE_EVENT_ALERT_MISSING_EVENT_NAME" };
    }
    return {
      ok: true,
      template: "pre_event",
      headline: `بعد ${minutes} دقائق`,
      summary: `يصدر ${eventName}.`,
      bullets: ["الدولار", "الذهب", "مؤشرات الأسهم", "العملات الرقمية"],
      impact: "",
    };
  }

  if (structuredFacts.isStructuredTriple) {
    const titleResult = resolveEditorialTitle(facts, structuredFacts.eventType, structuredFacts.titleFact);
    const headline =
      facts.canonicalDisplayName ||
      buildEconomicEditorialTitle(facts, structuredFacts.eventType) ||
      titleResult.title ||
      "إصدار اقتصادي أمريكي";
    const impact =
      facts.publishedReading || facts.sourceReading?.normalizedText
        ? facts.publishedReading || facts.sourceReading.normalizedText
        : "";
    return {
      ok: true,
      template: "economic",
      headline,
      country: structuredFacts.country || "الولايات المتحدة",
      previous: structuredFacts.previous,
      forecast: structuredFacts.forecast,
      actual: structuredFacts.actual,
      impact,
      titleResult,
    };
  }

  return buildConciseStructuredFallback(structuredFacts, facts);
}

function sentenceOverlapRatio(sourceText, draftText) {
  const sourceSentences = String(sourceText || "")
    .split(/[.!?\n]+/)
    .map(normalizeSentence)
    .filter((s) => s.length > 18);
  const draftSentences = String(draftText || "")
    .split(/[.!?\n]+/)
    .map(normalizeSentence)
    .filter((s) => s.length > 18);

  if (!sourceSentences.length || !draftSentences.length) {
    return 0;
  }

  let matches = 0;
  for (const draft of draftSentences) {
    if (sourceSentences.some((src) => src === draft || src.includes(draft) || draft.includes(src))) {
      matches += 1;
    }
  }

  return matches / draftSentences.length;
}

function validateEditorialDraft(finalDraft, sourceText, facts, structuredFacts = {}) {
  const draft = String(finalDraft || "");
  const issues = [];

  if (!draft || draft.length < 40) {
    issues.push("draft_too_short");
  }

  if (CHANNEL_NAME_PATTERN.test(draft)) {
    issues.push("channel_name_leak");
  }
  if (PROMO_URL_PATTERN.test(draft)) {
    issues.push("promo_link_leak");
  }
  if (/غير\s*متوفر|not available|n\/a/i.test(draft)) {
    issues.push("placeholder_text");
  }

  const allNumbers = [...(structuredFacts.keyNumbers || []), ...(facts.numbers || []), ...(facts.rawNumbers || [])]
    .map((n) => String(n).replace(/[^\d.%\-]/g, ""))
    .filter((n) => n.length >= 2);

  const draftNumbers = (draft.match(/-?\d+(?:\.\d+)?%?/g) || []).map((n) => n.replace(/[^\d.%\-]/g, ""));
  for (const num of draftNumbers) {
    if (num.length < 2) {
      continue;
    }
    const found = allNumbers.some((src) => src.includes(num) || num.includes(src));
    if (!found && !/202[0-9]|201[0-9]/.test(num)) {
      issues.push(`unknown_number:${num}`);
    }
  }

  const overlap = sentenceOverlapRatio(sourceText, draft);
  if (overlap >= 0.55) {
    issues.push("AI_EDITORIAL_DRAFT_TOO_SIMILAR");
  }

  return {
    ok: issues.length === 0,
    issues,
    overlap,
    reason: issues[0] || null,
  };
}

function resolveDraftWithSimilarityRetry(structuredFacts, facts, sourceText, metrics = createEditorialMetrics()) {
  const attempts = [
    () => buildRuleBasedEditorialDraft(structuredFacts, facts),
    () => buildConciseStructuredFallback(structuredFacts, facts, { reorder: true }),
    () => buildMinimalStructuredFallback(structuredFacts, facts),
  ];

  let lastCheck = null;
  for (let index = 0; index < attempts.length; index += 1) {
    const draft = attempts[index]();
    if (!draft.ok) {
      if (index === attempts.length - 1) {
        metrics.structuredFallbackRejected += 1;
        return { draft: null, metrics, reason: draft.reason };
      }
      continue;
    }

    lastCheck = { draft, index };
    if (index === 0) {
      metrics.aiEditorialAccepted += 1;
    } else if (index === 1) {
      metrics.aiEditorialRetryAccepted += 1;
      metrics.structuredFallbackUsed += 1;
    } else {
      metrics.structuredFallbackUsed += 1;
    }

    return { draft, metrics, attempt: index };
  }

  return { draft: null, metrics, reason: lastCheck?.draft?.reason || "GENERIC_TITLE_REJECTED" };
}

async function buildEditorialDraft(structuredFacts, options = {}) {
  const metrics = options.metrics || createEditorialMetrics();
  const facts = options.facts || {};
  const resolved = resolveDraftWithSimilarityRetry(structuredFacts, facts, options.sourceText || "", metrics);
  if (!resolved.draft) {
    return { draft: null, aiUsed: false, aiResult: "rejected", reason: resolved.reason, metrics };
  }

  return {
    draft: resolved.draft,
    aiUsed: false,
    aiResult: resolved.attempt === 0 ? "structured_fallback" : "structured_retry",
    metrics,
  };
}

module.exports = {
  buildStructuredFactsForEditorial,
  buildRuleBasedEditorialDraft,
  buildEditorialDraft,
  validateEditorialDraft,
  sentenceOverlapRatio,
  createEditorialMetrics,
  resolveDraftWithSimilarityRetry,
};
