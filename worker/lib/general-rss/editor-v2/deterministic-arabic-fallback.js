const { extractActionFromEvidence } = require("./action-resolution");
const { resolvePrimarySubject } = require("./primary-subject");
const { formatMaterialNumbers } = require("./numeric-semantics");
const { buildFallbackFromSemantics } = require("./fallback-templates");
const { isTechnicalAnalysisTitle } = require("./evidence-scope");

function isPredominantlyArabic(text = "") {
  const arabic = (String(text || "").match(/[\u0600-\u06FF]/g) || []).length;
  const latin = (String(text || "").match(/[A-Za-z]/g) || []).length;
  return arabic >= 12 && arabic >= latin;
}

function extractAttributionHint(evidence = {}) {
  const title = String(evidence.title || "");
  const combined = isTechnicalAnalysisTitle(title)
    ? title
    : [evidence.title, evidence.description, evidence.contentEncoded].filter(Boolean).join("\n");
  if (/\becb\s+sources?\b/i.test(combined)) {
    return { type: "ecb_sources", arabic: "مصادر في البنك المركزي الأوروبي" };
  }
  if (/\bsources?\s+report/i.test(combined)) {
    return { type: "sources", arabic: "مصادر" };
  }
  if (/\bpolicymakers\b/i.test(combined)) {
    return { type: "policymakers", arabic: "صناع السياسات" };
  }
  if (/\beconomists\b/i.test(combined)) {
    return { type: "economists", arabic: "اقتصاديون" };
  }
  if (/\brumou?rs?\b/i.test(combined)) {
    return { type: "rumors", arabic: "أنباء غير مؤكدة" };
  }
  return null;
}

function buildDeterministicArabicFallback(evidence = {}, facts = {}) {
  const title = String(evidence.title || "").trim();
  const snippet = String(evidence.description || evidence.contentEncoded || "").trim();
  if (!title || title.length < 10) {
    return {
      headline: "",
      body: "",
      usedFacts: [],
      usedEntities: [],
      confidence: "fallback_insufficient",
      insufficientEvidence: true,
      fallback: true,
    };
  }

  const action = extractActionFromEvidence(evidence);
  const subject = resolvePrimarySubject(evidence, facts, action);
  const numbers = formatMaterialNumbers(facts, evidence);
  const attribution = extractAttributionHint(evidence);

  const { headline, body } = buildFallbackFromSemantics({
    subject,
    action,
    numbers,
    evidence,
    facts,
  });

  let finalBody = body;
  if (attribution?.type === "ecb_sources" && action.actionClass === "RATE_HIKE") {
    finalBody = finalBody.replace("تشير التوقعات", attribution.arabic + " تشير");
  }

  if (!headline || finalBody.length < 20 || !isPredominantlyArabic(`${headline} ${finalBody}`)) {
    return {
      headline: "",
      body: "",
      usedFacts: [],
      usedEntities: [],
      confidence: "fallback_insufficient",
      insufficientEvidence: true,
      fallback: true,
    };
  }

  return {
    headline,
    body: finalBody,
    usedFacts: [title, snippet].filter(Boolean),
    usedEntities: [
      ...(facts.people || []).map((person) => person.name).filter(Boolean),
      subject.label,
      ...(subject.comparators || []).map((c) => c.label),
    ].filter(Boolean),
    confidence: "deterministic_arabic_fallback",
    insufficientEvidence: false,
    fallback: true,
    semanticMeta: {
      actionClass: action.actionClass,
      primarySubjectId: subject.id,
      primarySubjectLabel: subject.label,
      attribution: attribution?.type || null,
    },
  };
}

function needsDeterministicArabicFallback(editorial = {}, evidenceSufficiencyLevel = "") {
  const { isEvidenceSufficientForEditorial } = require("./evidence-sufficiency");
  if (!isEvidenceSufficientForEditorial(evidenceSufficiencyLevel)) return false;
  if (editorial.timeout) return false;
  if (!editorial.headline || !editorial.body) return true;
  if (editorial.insufficientEvidence) return true;
  if (["ai_invalid", "ai_failed", "ai_non_arabic"].includes(editorial.confidence)) return true;
  const arabic = (String(editorial.headline || "") + String(editorial.body || "")).match(/[\u0600-\u06FF]/g)?.length || 0;
  const latin = (String(editorial.headline || "") + String(editorial.body || "")).match(/[A-Za-z]/g)?.length || 0;
  if (latin > arabic * 1.2) return true;
  return false;
}

module.exports = {
  buildDeterministicArabicFallback,
  needsDeterministicArabicFallback,
  isPredominantlyArabic,
  extractAttributionHint,
};
