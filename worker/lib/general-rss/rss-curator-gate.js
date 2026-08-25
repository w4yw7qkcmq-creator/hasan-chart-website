const CURATOR_OUTCOMES = {
  PUBLISH: "PUBLISH",
  SKIP_LOW_VALUE: "SKIP_LOW_VALUE",
  SKIP_LISTICLE: "SKIP_LISTICLE",
  SKIP_PREVIEW: "SKIP_PREVIEW",
  SKIP_STALE_RECAP: "SKIP_STALE_RECAP",
  SKIP_GENERIC_WATCHLIST: "SKIP_GENERIC_WATCHLIST",
};

const LISTICLE_PATTERNS = [
  /\b\d+\s+(?:things?|points?|stocks?|ways?|reasons?|tips?|picks?|analysts?)\s+(?:to\s+)?watch\b/i,
  /\btop\s+\d+\s+(?:stocks?|picks?|analysts?|things?)\b/i,
  /\bwhat\s+to\s+watch\b/i,
  /أهم\s+\d+\s+(?:نقاط?|أشياء?|أسهم?|أسباب?)/i,
  /\d+\s+(?:أشياء?|نقاط?)\s+(?:يجب|ل)?(?:متابعتها|مراقبتها)/i,
  /(?:things?|points?)\s+to\s+watch/i,
  /stock\s+picks?\b/i,
  /analysts?\s+(?:like|pick|recommend)/i,
];

const PREVIEW_PATTERNS = [
  /\b(?:week|day|session)\s+(?:ahead|preview|outlook|guide)\b/i,
  /\bwhat\s+to\s+expect\b/i,
  /\b(?:monday|tuesday|wednesday|thursday|friday|weekend)\s+(?:open|preview|outlook)\b/i,
  /(?:معاينة|نظرة|توقعات)\s+(?:الأسبوع|اليوم|الجلسة)/i,
];

const STALE_RECAP_PATTERNS = [
  /\b(?:week|day|session)\s+(?:in\s+review|recap|wrap(?:-?up)?|roundup)\b/i,
  /\bmarket\s+wrap\b/i,
  /(?:ملخص|تغطية)\s+(?:الأسبوع|اليوم|الجلسة)/i,
];

const GENERIC_WATCHLIST_PATTERNS = [
  /\bmarkets?\s+to\s+watch\b/i,
  /(?:الأسواق|السوق)\s+تترقب\b/i,
];

const CAREER_ADVICE_PATTERNS = [
  /\bcareer\s+(?:advice|tips?)\b/i,
  /\bhow\s+to\s+(?:invest|trade|retire)\b/i,
];

const MATERIAL_EVENT_PATTERN =
  /\b(?:surge|jump|fall|drop|plunge|rally|selloff|attack|strike|sanction|tariff|approval|decision|earnings|beat|miss|guidance|rate cut|rate hike|liquidation|deal|ceasefire|warns|announces|reports|confirms|escalat|threaten|impose|close|reopen|block|launch|fire|explod|war|negotiat|talks|agreement|fine|probe|resign|appoint|vote|approve|deny|halt|suspend|resume|cut|raise|lower|boost|slash|freeze|deploy|withdraw|invade|evacuat|outage|hack|breach|leak|cpi|ppi|nfp|gdp|pmi|fomc|jobless|payroll|inflation|recession|default|bankruptcy|ipo|merger|acquisition|downgrade|upgrade|bailout|stimulus|embargo|blockade|missile|drone|airstrike|pipeline|refinery|port|shipping|tanker|hormuz|strait|closure|walkout|layoff|hiring)\b|هبوط|ارتفاع|تصعيد|عقوب|قرار|إعلان|تأكيد|رفض|موافقة|إغلاق|فتح|هجوم|ضرب|صاروخ|مفاوضات|اتفاق|أرباح|إيرادات|تصفية|انهيار|تصحيح/i;

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

  if (matchesAny(text, CAREER_ADVICE_PATTERNS)) {
    return { ok: false, outcome: CURATOR_OUTCOMES.SKIP_LOW_VALUE, reason: "career_advice" };
  }

  if (matchesAny(title, LISTICLE_PATTERNS) && !hasMaterialNewEvent(title)) {
    return { ok: false, outcome: CURATOR_OUTCOMES.SKIP_LISTICLE, reason: "listicle_without_new_event" };
  }

  if (matchesAny(title, PREVIEW_PATTERNS) && !hasMaterialNewEvent(text)) {
    return { ok: false, outcome: CURATOR_OUTCOMES.SKIP_PREVIEW, reason: "preview_without_new_event" };
  }

  if (matchesAny(title, STALE_RECAP_PATTERNS) && !hasMaterialNewEvent(text)) {
    return { ok: false, outcome: CURATOR_OUTCOMES.SKIP_STALE_RECAP, reason: "stale_recap_without_new_event" };
  }

  if (matchesAny(title, GENERIC_WATCHLIST_PATTERNS) && !hasMaterialNewEvent(text)) {
    return { ok: false, outcome: CURATOR_OUTCOMES.SKIP_GENERIC_WATCHLIST, reason: "generic_watchlist" };
  }

  return { ok: true, outcome: CURATOR_OUTCOMES.PUBLISH, reason: null };
}

module.exports = {
  CURATOR_OUTCOMES,
  evaluateRssCuratorGate,
  buildCuratorText,
};
