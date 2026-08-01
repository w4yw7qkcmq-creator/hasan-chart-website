const { normalizeSentence, uniqueNonEmpty } = require("./repetition");
const { resolveEditorialTitle, isGenericTitle, normalizeTitleText, buildLocalizedSummary } = require("./editorial-title");

function stripBulletPrefix(line) {
  return String(line || "")
    .replace(/^[•▪️▫️📰🏛️🛡️🤝⚠️🔺🗳️🇺🇸⚔️]+\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPrimaryFact(structuredFacts = {}) {
  const officials = structuredFacts.officials || [];
  const points = uniqueNonEmpty(structuredFacts.factualPoints || []).map(stripBulletPrefix);

  for (const point of points) {
    if (point.length >= 24 && !isGenericTitle(point)) {
      return point.length > 180 ? `${point.slice(0, 177)}…` : point;
    }
  }

  if (officials.length && points[0]) {
    return points[0].length > 180 ? `${points[0].slice(0, 177)}…` : points[0];
  }

  return null;
}

function extractSupportingFacts(structuredFacts = {}, primaryFact = "") {
  const primaryNorm = normalizeSentence(primaryFact);
  return uniqueNonEmpty(structuredFacts.factualPoints || [])
    .map(stripBulletPrefix)
    .filter((line) => line.length >= 18)
    .filter((line) => !isGenericTitle(line))
    .filter((line) => {
      const norm = normalizeSentence(line);
      return norm !== primaryNorm && !norm.startsWith(primaryNorm) && !primaryNorm.includes(norm);
    })
    .slice(0, 3)
    .map((line) => (line.length > 110 ? `${line.slice(0, 107)}…` : line));
}

function buildMarketImpactSentence(structuredFacts = {}, primaryFact = "") {
  const text = `${primaryFact} ${(structuredFacts.factualPoints || []).join(" ")}`.toLowerCase();
  if (/fed|fomc|فائدة|fedwatch|powell|لوغان|logan/i.test(text)) {
    return "قد ينعكس ذلك على توقعات الفائدة الأمريكية والدولار والعوائد والذهب.";
  }
  if (/trump|ترامب|iran|إيران|war|حرب|oil|نفط/i.test(text)) {
    return "قد تؤثر هذه التطورات على الدولار والذهب والنفط ومزاج المخاطر في الأسواق.";
  }
  if (/gold|الذهب|bitcoin|btc|nasdaq|dow|أسهم/i.test(text)) {
    return "قد تنعكس الحركة على الذهب والدولار ومؤشرات الأسهم خلال الجلسة.";
  }
  return "قد تنعكس هذه التطورات على الدولار والذهب ومؤشرات الأسهم وفق حساسية السوق الحالية.";
}

function buildConciseEditorialMessage(structuredFacts = {}, facts = {}, options = {}) {
  const titleResult = resolveEditorialTitle(
    facts,
    structuredFacts.eventType || facts.canonicalEventKey,
    structuredFacts.titleFact
  );

  if (titleResult.rejected) {
    return { ok: false, reason: titleResult.reason || "GENERIC_TITLE_REJECTED", titleResult };
  }

  const primaryFact = extractPrimaryFact(structuredFacts);
  if (!primaryFact) {
    return { ok: false, reason: "GENERIC_TITLE_REJECTED", titleResult };
  }

  const supportingFacts = extractSupportingFacts(structuredFacts, primaryFact);
  const marketImpact = buildMarketImpactSentence(structuredFacts, primaryFact);
  const primaryNorm = normalizeSentence(primaryFact);

  const summary =
    buildLocalizedSummary(titleResult.title, primaryFact, supportingFacts) ||
    (normalizeSentence(titleResult.title) === primaryNorm
      ? primaryFact.split(/[.!؟?]/)[0]?.trim() || primaryFact
      : primaryFact);

  return {
    ok: true,
    template: "general",
    headline: titleResult.title,
    summary: summary.length > 200 ? `${summary.slice(0, 197)}…` : summary,
    bullets: supportingFacts,
    impact: marketImpact,
    titleResult,
    primaryFact,
    supportingFacts,
    marketImpact,
  };
}

function buildConciseStructuredFallback(structuredFacts = {}, facts = {}, options = {}) {
  const concise = buildConciseEditorialMessage(structuredFacts, facts, options);
  if (!concise.ok) {
    return concise;
  }

  if (options.reorder === true) {
    const bullets = concise.bullets.slice().reverse();
    return {
      ok: true,
      template: "general",
      headline: concise.headline,
      summary: concise.summary,
      bullets,
      impact: concise.impact,
      titleResult: concise.titleResult,
    };
  }

  return {
    ok: true,
    template: concise.template,
    headline: concise.headline,
    summary: concise.summary,
    bullets: concise.bullets,
    impact: concise.impact,
    titleResult: concise.titleResult,
  };
}

function buildMinimalStructuredFallback(structuredFacts = {}, facts = {}) {
  const titleResult = resolveEditorialTitle(
    facts,
    structuredFacts.eventType || facts.canonicalEventKey,
    structuredFacts.titleFact
  );
  if (titleResult.rejected) {
    return { ok: false, reason: titleResult.reason || "GENERIC_TITLE_REJECTED" };
  }

  const primaryFact = extractPrimaryFact(structuredFacts);
  const numbers = (structuredFacts.keyNumbers || []).slice(0, 2);
  const bullets = numbers.length
    ? numbers.map((num) => `الرقم الرئيسي: ${num}`)
    : extractSupportingFacts(structuredFacts, primaryFact).slice(0, 2);

  return {
    ok: true,
    template: "general",
    headline: titleResult.title,
    summary: primaryFact || titleResult.title,
    bullets,
    impact: buildMarketImpactSentence(structuredFacts, primaryFact || titleResult.title),
    titleResult,
  };
}

module.exports = {
  buildConciseEditorialMessage,
  buildConciseStructuredFallback,
  buildMinimalStructuredFallback,
  extractPrimaryFact,
  extractSupportingFacts,
  buildMarketImpactSentence,
};
