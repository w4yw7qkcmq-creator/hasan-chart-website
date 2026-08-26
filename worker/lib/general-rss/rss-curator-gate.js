const { evaluateAnalysisDeliverableGate } = require("./analysis-deliverable-gate");

const CURATOR_OUTCOMES = {
  PUBLISH: "PUBLISH",
  SKIP_LOW_VALUE: "SKIP_LOW_VALUE",
  SKIP_LISTICLE: "SKIP_LISTICLE",
  SKIP_PREVIEW: "SKIP_PREVIEW",
  SKIP_STALE_RECAP: "SKIP_STALE_RECAP",
  SKIP_GENERIC_WATCHLIST: "SKIP_GENERIC_WATCHLIST",
  SKIP_PERSONAL_FINANCE: "SKIP_PERSONAL_FINANCE",
  SKIP_NEWSLETTER: "SKIP_NEWSLETTER",
  SKIP_EVERGREEN: "SKIP_EVERGREEN",
  SKIP_ANALYSIS_PROMISE_WITHOUT_DELIVERABLE: "SKIP_ANALYSIS_PROMISE_WITHOUT_DELIVERABLE",
};

const LISTICLE_PATTERNS = [
  /\b\d+\s+(?:things?|points?|stocks?|ways?|reasons?|tips?|picks?|analysts?)\s+(?:to\s+)?(?:watch|know)\b/i,
  /\btop\s+\d+\s+(?:stocks?|picks?|analysts?|things?)\b/i,
  /\bwhat\s+to\s+watch\b/i,
  /أهم\s+\d+\s+(?:نقاط?|أشياء?|أسهم?|أسباب?)/i,
  /\d+\s+(?:أشياء?|نقاط?)\s+(?:يجب|ل)?(?:متابعتها|مراقبتها)/i,
  /(?:things?|points?)\s+to\s+watch/i,
  /stock\s+picks?\b/i,
  /analysts?\s+(?:like|pick|recommend)\b/i,
  /\branked\s+list\b/i,
];

const PREVIEW_PATTERNS = [
  /\b(?:week|day|session)\s+(?:ahead|preview|outlook|guide)\b/i,
  /\bwhat\s+to\s+expect\b/i,
  /\b(?:monday|tuesday|wednesday|thursday|friday|weekend)\s+(?:open|preview|outlook)\b/i,
  /\bday-ahead\s+look\b/i,
  /\bwhat(?:'s| is)\s+next\?\b/i,
  /(?:معاينة|نظرة|توقعات)\s+(?:الأسبوع|اليوم|الجلسة)/i,
];

const STALE_RECAP_PATTERNS = [
  /\b(?:week|day|session)\s+(?:in\s+review|recap|wrap(?:-?up)?|roundup)\b/i,
  /\bmarket\s+wrap\b/i,
  /(?:ملخص|تغطية)\s+(?:الأسبوع|اليوم|الجلسة)/i,
];

const GENERIC_WATCHLIST_PATTERNS = [
  /\bmarkets?\s+to\s+watch\b/i,
  /\bwhat\s+investors?\s+should\s+watch\b/i,
  /(?:الأسواق|السوق)\s+تترقب\b/i,
];

const NEWSLETTER_PATTERNS = [
  /\bnewsletter\b/i,
  /\bthe\s+[\w\s'-]+\s+newsletter\b/i,
  /\bmorning\s+(?:brief|newsletter|note)\b/i,
  /\bevening\s+(?:brief|newsletter|note)\b/i,
  /\bthe china connection\b/i,
];

const PERSONAL_FINANCE_PATTERNS = [
  /\b(?:my|our)\s+(?:friend|father-in-law|mother-in-law|wife|husband|son|daughter|brother|sister)\b/i,
  /\bdo i evict\b/i,
  /\bwhat should i do\b/i,
  /\bhow can (?:she|he|they|i|we)\b/i,
  /\bcobra\b/i,
  /\bhealth insurance\b/i,
  /\binheritance\b/i,
  /\btenant(?:s)?\b/i,
  /\blandlord\b/i,
  /\bretirement\s+(?:advice|planning|savings|fund)\b/i,
  /\blaid off\b/i,
  /\baffordable coverage\b/i,
  /\bfinancial guidance\b/i,
  /\bhousehold financial\b/i,
  /\bwhat should (?:i|we|they)\b/i,
  /[''']she looked into[''']/i,
  /\bpassed away, leaving a house\b/i,
];

const EVERGREEN_PATTERNS = [
  /\b(?:what is|why you should|how to|guide to|explainer|everything you need to know)\b/i,
  /\b(?:beginner'?s guide|step-by-step)\b/i,
  /\bnew buzzword\b/i,
  /\bhere'?s how\b/i,
  /\bhow overvalued\b/i,
  /\bhow (?:much|far|long)\b/i,
  /\bit'?s time to bet\b/i,
  /\bsays this analyst\b/i,
];

const CAREER_ADVICE_PATTERNS = [
  /\bcareer\s+(?:advice|tips?)\b/i,
  /\bhow\s+to\s+(?:invest|trade|retire)\b/i,
];

const MATERIAL_EVENT_PATTERN =
  /\b(?:surge|jump|fall|drop|plunge|rally|selloff|attack|strike|sanction|tariff|approval|decision|earnings|beat|miss|guidance|rate cut|rate hike|liquidation|deal|ceasefire|warns|announces|reports|confirms|escalat|threaten|impose|close|reopen|block|launch|fire|explod|war|negotiat|talks|agreement|fine|probe|resign|appoint|vote|approve|deny|halt|suspend|resume|cut|raise|lower|boost|slash|freeze|deploy|withdraw|invade|evacuat|outage|hack|breach|leak|cpi|ppi|nfp|gdp|pmi|fomc|jobless|payroll|inflation|recession|default|bankruptcy|ipo|merger|acquisition|downgrade|upgrade|bailout|stimulus|embargo|blockade|missile|drone|airstrike|pipeline|refinery|port|shipping|tanker|hormuz|strait|closure|walkout|layoff|hiring|buyback|hike odds|rate call|keynote speech|gained up to)\b|هبوط|ارتفاع|تصعيد|عقوب|قرار|إعلان|تأكيد|رفض|موافقة|إغلاق|فتح|هجوم|ضرب|صاروخ|مفاوضات|اتفاق|أرباح|إيرادات|تصفية|انهيار|تصحيح/i;

function buildCuratorText(item = {}) {
  return `${item.title || ""} ${item.contentSnippet || ""} ${item.content || ""} ${item.summary || ""}`.trim();
}

function matchesAny(text, patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

function hasMaterialNewEvent(text = "") {
  return MATERIAL_EVENT_PATTERN.test(text);
}

function evaluateRssCuratorGate(item = {}) {
  const text = buildCuratorText(item);
  const title = String(item.title || "").trim();
  if (!text) {
    return { ok: false, outcome: CURATOR_OUTCOMES.SKIP_LOW_VALUE, reason: "empty_source_text" };
  }

  const analysisGate = evaluateAnalysisDeliverableGate(item);
  if (!analysisGate.ok) {
    return {
      ok: false,
      outcome: CURATOR_OUTCOMES.SKIP_ANALYSIS_PROMISE_WITHOUT_DELIVERABLE,
      reason: analysisGate.reason,
    };
  }

  if (matchesAny(title, NEWSLETTER_PATTERNS)) {
    return { ok: false, outcome: CURATOR_OUTCOMES.SKIP_NEWSLETTER, reason: "newsletter_product" };
  }

  if (matchesAny(title, PERSONAL_FINANCE_PATTERNS)) {
    return { ok: false, outcome: CURATOR_OUTCOMES.SKIP_PERSONAL_FINANCE, reason: "personal_finance_advice" };
  }

  if (matchesAny(title, EVERGREEN_PATTERNS) && !hasMaterialNewEvent(title)) {
    return { ok: false, outcome: CURATOR_OUTCOMES.SKIP_EVERGREEN, reason: "evergreen_without_new_event" };
  }

  if (matchesAny(title, CAREER_ADVICE_PATTERNS)) {
    return { ok: false, outcome: CURATOR_OUTCOMES.SKIP_LOW_VALUE, reason: "career_advice" };
  }

  if (matchesAny(title, LISTICLE_PATTERNS) && !hasMaterialNewEvent(title)) {
    return { ok: false, outcome: CURATOR_OUTCOMES.SKIP_LISTICLE, reason: "listicle_without_new_event" };
  }

  if (matchesAny(title, PREVIEW_PATTERNS) && !hasMaterialNewEvent(title)) {
    return { ok: false, outcome: CURATOR_OUTCOMES.SKIP_PREVIEW, reason: "preview_without_new_event" };
  }

  if (matchesAny(title, STALE_RECAP_PATTERNS) && !hasMaterialNewEvent(title)) {
    return { ok: false, outcome: CURATOR_OUTCOMES.SKIP_STALE_RECAP, reason: "stale_recap_without_new_event" };
  }

  if (matchesAny(title, GENERIC_WATCHLIST_PATTERNS) && !hasMaterialNewEvent(title)) {
    return { ok: false, outcome: CURATOR_OUTCOMES.SKIP_GENERIC_WATCHLIST, reason: "generic_watchlist" };
  }

  return { ok: true, outcome: CURATOR_OUTCOMES.PUBLISH, reason: null };
}

module.exports = {
  CURATOR_OUTCOMES,
  evaluateRssCuratorGate,
  buildCuratorText,
};
