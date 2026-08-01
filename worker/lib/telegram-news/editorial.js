const { normalizeSentence, uniqueNonEmpty } = require("./repetition");

const CHANNEL_NAME_PATTERN = /forexbreakingnews|forexnewspaper|ForexBreakingNews|ForexNewspaper/i;
const PROMO_URL_PATTERN = /https?:\/\/(?:one\.)?exness|t\.me\/(?:Forex|joinchat|\+)/i;

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

function buildRuleBasedEditorialDraft(structuredFacts) {
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
    const headline =
      String(structuredFacts.titleFact || "")
        .replace(/^صدر\s*الآن\s*:?\s*/i, "")
        .trim() || "إصدار اقتصادي أمريكي";
    const impact =
      structuredFacts.actual && structuredFacts.forecast
        ? `القراءة الفعلية ${structuredFacts.actual} مقابل توقع ${structuredFacts.forecast} قد تؤثر على توقعات الفائدة وحركة الدولار والذهب خلال الجلسة.`
        : "قد تؤثر هذه القراءة على توقعات الفائدة وحركة الدولار والذهب خلال الجلسة.";
    return {
      ok: true,
      template: "economic",
      headline,
      country: structuredFacts.country || "الولايات المتحدة",
      previous: structuredFacts.previous,
      forecast: structuredFacts.forecast,
      actual: structuredFacts.actual,
      impact,
    };
  }

  const headline = structuredFacts.titleFact || structuredFacts.factualPoints[0] || "تحديث سوق";
  const points = uniqueNonEmpty(structuredFacts.factualPoints).filter(
    (line) => normalizeSentence(line) !== normalizeSentence(headline)
  );
  const summary = points.slice(0, 2).join(" ") || headline;
  const bullets = points.slice(2, 5);
  const impact = "قد تنعكس هذه التطورات على الدولار والذهب ومؤشرات الأسهم والعملات الرقمية وفق حساسية السوق الحالية.";

  return {
    ok: true,
    template: "general",
    headline,
    summary,
    bullets,
    impact,
  };
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

async function buildEditorialDraft(structuredFacts, options = {}) {
  const ruleDraft = buildRuleBasedEditorialDraft(structuredFacts);
  if (!ruleDraft.ok) {
    return { draft: null, aiUsed: false, aiResult: "skipped", reason: ruleDraft.reason };
  }

  if (options.disableAi === true) {
    return { draft: ruleDraft, aiUsed: false, aiResult: "rule_based" };
  }

  // AI path reserved — rule-based editorial is default; similarity retry uses stronger rule template
  return { draft: ruleDraft, aiUsed: false, aiResult: "rule_based" };
}

module.exports = {
  buildStructuredFactsForEditorial,
  buildRuleBasedEditorialDraft,
  buildEditorialDraft,
  validateEditorialDraft,
  sentenceOverlapRatio,
};
