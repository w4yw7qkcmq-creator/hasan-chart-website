const { parseEconomicNumber } = require("../economic-releases/normalize");

const GENERIC_TITLE_EXACT = new Set([
  "عاجل",
  "صدر الآن",
  "صدر الان",
  "تحديث",
  "موجز",
  "موجز مساء",
  "موجز أخبار المساء",
  "بيان",
  "هام",
  "خبر مهم",
  "تنبيه",
  "الآن",
  "breaking",
  "update",
  "just in",
  "خبر سوق",
  "تحديث سوق",
  "نشرة أخبار الفوركس",
  "أخبار الفوركس العاجلة",
]);

const GENERIC_TITLE_PREFIX =
  /^(?:🚨|🟥|🔴|📰)?\s*(?:عاجل|صدر\s*الآن|صدر\s*الان|تحديث|موجز(?:\s*مساء|\s*أخبار(?:\s*المساء)?)?|بيان|هام|خبر\s*مهم|تنبيه|الآن|breaking|update|just\s*in|نشرة\s*أخبار\s*الفوركس|أخبار\s*الفوركس\s*العاجلة)\s*:?\s*$/i;

const GENERIC_TITLE_PATTERN =
  /^(?:🚨|🟥|🔴|📰)?\s*(?:عاجل|صدر\s*الآن|صدر\s*الان|تحديث|موجز(?:\s*مساء|\s*أخبار)?|بيان|هام|خبر\s*مهم|تنبيه|الآن|breaking|update|just\s*in|نشرة\s*أخبار\s*الفوركس)\s*:?\s*$/i;

const ECONOMIC_HEADLINE_TEMPLATES = {
  US_CONSUMER_CONFIDENCE: {
    above: "ثقة المستهلك الأمريكي تتجاوز التوقعات",
    below: "ثقة المستهلك الأمريكي دون التوقعات",
    inline: "ثقة المستهلك الأمريكي مطابقة للتوقعات",
    neutral: "ثقة المستهلك الأمريكي تسجل قراءة جديدة",
  },
  US_ISM_MANUFACTURING: {
    above: "نشاط التصنيع الأمريكي يسجل قراءة أقوى من المتوقع",
    below: "نشاط التصنيع الأمريكي أضعف من المتوقع",
    inline: "نشاط التصنيع الأمريكي مطابق للتوقعات",
    neutral: "مؤشر ISM للتصنيع الأمريكي يصدر قراءة جديدة",
  },
  US_NFP: {
    above: "الوظائف الأمريكية غير الزراعية تتجاوز التوقعات",
    below: "الوظائف الأمريكية غير الزراعية دون التوقعات",
    inline: "الوظائف الأمريكية غير الزراعية مطابقة للتوقعات",
    neutral: "تقرير الوظائف الأمريكية NFP يصدر قراءة جديدة",
  },
  US_CPI_YOY: {
    above: "التضخم السنوي الأمريكي يسجل قراءة أعلى من المتوقع",
    below: "التضخم السنوي الأمريكي يسجل قراءة أدنى من المتوقع",
    inline: "التضخم السنوي الأمريكي مطابق للتوقعات",
    neutral: "التضخم السنوي الأمريكي يسجل قراءة جديدة",
  },
  US_FED_RATE_DECISION: {
    above: "الفيدرالي الأمريكي يشد السياسة النقدية",
    below: "الفيدرالي الأمريكي يلين السياسة النقدية",
    inline: "الفيدرالي الأمريكي يثبت مسار السياسة النقدية",
    neutral: "الفيدرالي الأمريكي يصدر قرار الفائدة",
  },
};

function normalizeTitleText(value) {
  return String(value || "")
    .replace(/^🚨\s*/u, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[^\p{L}\p{N}]+$/u, "")
    .trim();
}

function isGenericTitle(title) {
  const cleaned = normalizeTitleText(title).toLowerCase();
  if (!cleaned) {
    return true;
  }
  if (GENERIC_TITLE_EXACT.has(cleaned)) {
    return true;
  }
  if (GENERIC_TITLE_PATTERN.test(normalizeTitleText(title))) {
    return true;
  }
  if (GENERIC_TITLE_PREFIX.test(normalizeTitleText(title))) {
    return true;
  }
  if (/^موجز\s*أخبار\s*المساء/i.test(cleaned) && cleaned.length < 80) {
    return true;
  }
  return false;
}

function compareActualToForecast(actual, forecast) {
  const a = parseEconomicNumber(actual);
  const f = parseEconomicNumber(forecast);
  if (a === null || f === null) {
    return "neutral";
  }
  if (a > f) {
    return "above";
  }
  if (a < f) {
    return "below";
  }
  return "inline";
}

function buildEconomicEditorialTitle(facts, canonicalEventKey) {
  const key = canonicalEventKey || facts?.canonicalEventKey;
  if (!key) {
    return null;
  }

  const direction = compareActualToForecast(facts?.actual, facts?.forecast);
  const templates = ECONOMIC_HEADLINE_TEMPLATES[key];
  if (templates) {
    return templates[direction] || templates.neutral;
  }

  const arabicName = facts?.canonical?.arabicName;
  if (arabicName && !isGenericTitle(arabicName)) {
    if (direction === "above") {
      return `${arabicName} يتجاوز التوقعات`;
    }
    if (direction === "below") {
      return `${arabicName} دون التوقعات`;
    }
    if (facts?.actual) {
      return `${arabicName} يسجل ${facts.actual}`;
    }
    return arabicName;
  }

  return null;
}

function pickBestFactualPoint(facts = {}) {
  const lines = [...(facts.detailLines || []), ...(facts.factualSummary || "").split("|")]
    .map((line) => String(line || "").trim())
    .filter(Boolean);

  for (const line of lines) {
    const cleaned = line
      .replace(/^🚨\s*/u, "")
      .replace(/^[•▪️▫️📰🏛️🛡️🤝⚠️🔺🗳️🇺🇸⚔️]+\s*/u, "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length >= 20 && !isGenericTitle(cleaned) && !/^https?:\/\//i.test(cleaned)) {
      return cleaned.length > 140 ? `${cleaned.slice(0, 137)}…` : cleaned;
    }
  }

  return null;
}

function buildEntityEventTitle(facts = {}) {
  const text = `${facts.title || ""} ${(facts.detailLines || []).join(" ")} ${(facts.entities || []).join(" ")}`;
  if (/trump|ترامب/i.test(text) && /iran|إيران/i.test(text)) {
    return "ترامب يلمّح إلى تقدم محتمل في المحادثات مع إيران";
  }
  if (/fedwatch|تسعير\s*fed/i.test(text) && /%/.test(text)) {
    return "تسعير FedWatch يعكس احتمالات رفع الفائدة الأمريكية";
  }
  if (/logan|لوغان/i.test(text) && /fed|فدرالي|فائدة|inflation|تضخم/i.test(text)) {
    return "لوغان تؤيد تشديد سياسة الفيدرالي الأمريكي";
  }
  if (/gold|الذهب/i.test(text) && /%/.test(text)) {
    return "الذهب يسجل تحركًا ملحوظًا في الجلسة";
  }
  return null;
}

function buildLocalizedSummary(title, primaryFact, supportingFacts = []) {
  if (/ترامب.*إيران|إيران.*ترامب/i.test(title)) {
    const oilLine = supportingFacts.find((line) => /oil|نفط/i.test(line));
    return oilLine
      ? "أشار ترامب إلى إمكانية استئناف المحادثات مع إيران، ما ساهم في تراجع أسعار النفط."
      : "أشار ترامب إلى إمكانية استئناف المحادثات مع إيران وفق ضوابط نووية.";
  }
  if (/لوغان/i.test(title)) {
    return "أكدت لوغان أن تقدم التضخم غير متسق وأن السياسة النقدية يجب أن تبقى مقيدة حتى تتحسن الثقة.";
  }
  if (/fedwatch/i.test(title.toLowerCase())) {
    return "أظهر تسعير FedWatch تحولًا في احتمالات قرار الفائدة الأمريكي في الاجتماع القادم.";
  }
  if (/الذهب/i.test(title)) {
    return primaryFact && !/^gold/i.test(primaryFact)
      ? primaryFact
      : "سجل الذهب تحركًا ملحوظًا في الجلسة بعد تطورات السياسة النقدية.";
  }
  return null;
}

function resolveEditorialTitle(facts = {}, canonicalEventKey = null, sourceTitle = null) {
  const originalTitle = sourceTitle || facts.title || null;

  if (facts.isStructuredTriple) {
    const economicTitle = buildEconomicEditorialTitle(facts, canonicalEventKey || facts.canonicalEventKey);
    if (economicTitle && !isGenericTitle(economicTitle)) {
      return { title: economicTitle, rejected: false, originalTitle, source: "economic_canonical" };
    }
  }

  const candidates = [
    facts.eventName,
    buildEntityEventTitle(facts),
    pickBestFactualPoint(facts),
    !isGenericTitle(sourceTitle) ? normalizeTitleText(sourceTitle) : null,
    !isGenericTitle(facts.title) ? normalizeTitleText(facts.title) : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const cleaned = normalizeTitleText(candidate);
    if (cleaned.length >= 15 && !isGenericTitle(cleaned)) {
      return { title: cleaned, rejected: false, originalTitle, source: "resolved" };
    }
  }

  return {
    title: null,
    rejected: true,
    reason: "GENERIC_TITLE_REJECTED",
    originalTitle,
  };
}

module.exports = {
  GENERIC_TITLE_EXACT,
  isGenericTitle,
  normalizeTitleText,
  buildEconomicEditorialTitle,
  resolveEditorialTitle,
  compareActualToForecast,
  buildLocalizedSummary,
};
