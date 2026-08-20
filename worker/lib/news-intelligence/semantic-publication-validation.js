const { normalizeTitleText, isGenericTitle } = require("../telegram-news/editorial-title");

const BLOCK_REASONS = {
  SEMANTIC_PUBLICATION_INVALID: "SEMANTIC_PUBLICATION_INVALID",
  EDITORIAL_FACTS_INSUFFICIENT: "EDITORIAL_FACTS_INSUFFICIENT",
};

const GENERIC_PRIMARY_LABEL = /الرقم الرئيسي\s*[:：]/gi;
const RETREAT_PATTERNS = [/يتراجع/i, /ينخفض/i, /تراجع/i, /انخفض/i, /هبط/i];
const RALLY_PATTERNS = [/يقفز/i, /يقفز/i, /يرتفع/i, /ارتفع/i, /يصعد/i, /قفز/i, /فوق/i];
const GENERIC_IMPACT_PATTERN =
  /قد تؤثر هذه التطورات على الدولار والذهب والنفط ومزاج المخاطر|قد تنعكس هذه التطورات على الدولار والذهب ومؤشرات الأسهم/i;

function extractHeadline(body = "") {
  const match = String(body || "").match(/^🚨\s*(.+?)(?:\n|$)/);
  return match ? normalizeTitleText(match[1]) : "";
}

function extractSummarySection(body = "") {
  const text = String(body || "");
  const parts = text.split("📊 التأثير المحتمل:");
  return parts[0] || text;
}

function countMatches(text, pattern) {
  const matches = String(text || "").match(pattern);
  return matches ? matches.length : 0;
}

function hasContradictoryMovement(text = "") {
  const value = String(text || "");
  const hasRetreat = RETREAT_PATTERNS.some((pattern) => pattern.test(value));
  const hasRally = RALLY_PATTERNS.some((pattern) => pattern.test(value));
  return hasRetreat && hasRally;
}

function hasDuplicateGenericPrimaryLabels(text = "") {
  return countMatches(text, GENERIC_PRIMARY_LABEL) > 1;
}

function hasMeaningfulSubject(headline = "", summary = "") {
  const combined = `${headline} ${summary}`.trim();
  if (!combined || isGenericTitle(combined)) {
    return false;
  }
  return /[A-Za-z\u0600-\u06FF]{6,}/.test(combined);
}

function hasClearPrimaryFact(summary = "", publication = {}) {
  const facts = publication.facts || {};
  const hasStructuredFacts = Boolean(facts.actual || facts.forecast || facts.previous);
  if (hasStructuredFacts) {
    return true;
  }

  const detailLines = publication.metadata?.candidate?.facts?.detailLines || [];
  const factualPoints = publication.metadata?.candidate?.facts?.factualSummary || "";
  const numericTokens = String(summary || "").match(/\d{3,5}(?:\.\d+)?/g) || [];
  const hasExplicitMove = /(?:إلى|عند|عند\s*مستوى|سعر|مستوى|دولار|الذهب)/i.test(summary);
  const hasNarrativeFact =
    detailLines.some((line) => String(line).trim().length >= 24) || String(factualPoints).length >= 24;

  if (numericTokens.length >= 1 && hasExplicitMove) {
    return true;
  }

  return hasNarrativeFact && numericTokens.length <= 2;
}

function isBoilerplateOnlyImpact(body = "", summary = "") {
  const impact = String(body || "").split("📊 التأثير المحتمل:")[1] || "";
  if (!impact.trim()) {
    return false;
  }
  if (!GENERIC_IMPACT_PATTERN.test(impact)) {
    return false;
  }
  const factLike = summary.replace(GENERIC_PRIMARY_LABEL, "").trim();
  return factLike.length < 50 || hasDuplicateGenericPrimaryLabels(summary);
}

function validateSemanticPublication(publication = {}, editorial = {}) {
  const body = String(editorial.body || publication.body || "").trim();
  const headline = extractHeadline(body) || normalizeTitleText(publication.title || "");
  const summary = extractSummarySection(body);
  const issues = [];

  if (!headline || isGenericTitle(headline)) {
    issues.push("generic_or_missing_headline");
  }

  if (!hasMeaningfulSubject(headline, summary)) {
    issues.push("missing_meaningful_subject");
  }

  if (hasDuplicateGenericPrimaryLabels(body)) {
    issues.push("duplicate_generic_primary_label");
  }

  if (hasContradictoryMovement(summary)) {
    issues.push("contradictory_movement_language");
  }

  if (!hasClearPrimaryFact(summary, publication)) {
    issues.push("missing_clear_primary_fact");
  }

  if (isBoilerplateOnlyImpact(body, summary)) {
    issues.push("boilerplate_only_impact");
  }

  const headlineNorm = normalizeTitleText(headline);
  const summaryNorm = normalizeTitleText(summary.replace(/^🚨\s*/u, "").split("\n")[0] || "");
  if (headlineNorm && summaryNorm && headlineNorm !== summaryNorm) {
    const headlineTokens = headlineNorm.split(/\s+/).filter((token) => token.length >= 3);
    const overlap = headlineTokens.filter((token) => summaryNorm.includes(token)).length;
    if (headlineTokens.length >= 3 && overlap === 0 && hasContradictoryMovement(`${headline} ${summary}`)) {
      issues.push("headline_body_semantic_mismatch");
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    reason: issues[0] || null,
    headline,
    summary,
  };
}

module.exports = {
  BLOCK_REASONS,
  validateSemanticPublication,
  extractHeadline,
  hasContradictoryMovement,
  hasDuplicateGenericPrimaryLabels,
};
