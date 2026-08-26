const ANALYSIS_PROMISE_PATTERNS = [
  /\btechnical analysis\b/i,
  /\btrading analysis\b/i,
  /\bsession outlook\b/i,
  /\bmarket outlook\b/i,
  /\btargets?\b/i,
  /\boutlook\b/i,
  /تحليل\s*فني/i,
  /نظرة\s*فنية/i,
  /توقعات\s*الجلسة/i,
  /أهداف\s*محتملة/i,
  /انطلاق\s*جلسة\s*التداول/i,
  /يقدم\s*التحليل\s*نظرة/i,
  /potential\s*targets?/i,
];

const SUBSTANTIVE_DELIVERABLE_PATTERNS = [
  /\b(?:support|resistance|target|breakout|breakdown|catalyst)\b/i,
  /\b(?:above|below|bullish|bearish|long|short)\b/i,
  /\$\d+(?:\.\d+)?|\d+(?:\.\d+)?%|\d{3,5}(?:\.\d+)?/,
  /(?:دعم|مقاومة|هدف|ارتفاع|انخفاض|صعود|هبوط|كسر|اختراق|فوق|تحت|صاعد|هابط)/u,
  /(?:EUR\/USD|USD\/JPY|GBP\/USD|XAU|WTI|Brent|Nasdaq|S&P|Dow)/i,
  /(?:قال|أعلن|ارتفع|انخفاض|سجل|بلغ|beat|miss|surge|drop|plunge|rally|cut|hike|decision|reported)/i,
];

function buildGateText(item = {}) {
  return `${item.title || ""} ${item.contentSnippet || ""} ${item.content || ""} ${item.summary || ""}`.trim();
}

function promisesAnalysisWithoutDeliverable(text = "") {
  const promises = ANALYSIS_PROMISE_PATTERNS.some((pattern) => pattern.test(text));
  if (!promises) {
    return false;
  }
  return !SUBSTANTIVE_DELIVERABLE_PATTERNS.some((pattern) => pattern.test(text));
}

function evaluateAnalysisDeliverableGate(item = {}) {
  const text = buildGateText(item);
  if (!text) {
    return { ok: true, reason: null };
  }
  if (promisesAnalysisWithoutDeliverable(text)) {
    return {
      ok: false,
      outcome: "SKIP_ANALYSIS_PROMISE_WITHOUT_DELIVERABLE",
      reason: "analysis_promise_without_deliverable",
    };
  }
  return { ok: true, reason: null };
}

module.exports = {
  ANALYSIS_PROMISE_PATTERNS,
  SUBSTANTIVE_DELIVERABLE_PATTERNS,
  buildGateText,
  promisesAnalysisWithoutDeliverable,
  evaluateAnalysisDeliverableGate,
};
