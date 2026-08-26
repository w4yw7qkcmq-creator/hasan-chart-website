const {
  stripOfficialChannelFooter,
  normalizeHeadlineComparable,
  splitEditorialSections,
} = require("./publication-format");
const { hasClearDevelopment, hasIdentifiableSubject } = require("./editor-v2/evidence-sufficiency");
const { evaluateAnalysisDeliverableGate } = require("./analysis-deliverable-gate");

const REASON_CODES = {
  RSS_MINIMUM_INFORMATION_FAILED: "RSS_MINIMUM_INFORMATION_FAILED",
  RSS_GENERIC_BREAKING_OUTPUT: "RSS_GENERIC_BREAKING_OUTPUT",
  RSS_LOW_INFORMATION_VALUE: "RSS_LOW_INFORMATION_VALUE",
};

const GENERIC_HEADLINE_PATTERNS = [
  /^خبر\s+عاجل$/i,
  /^تطور\s+مهم$/i,
  /^عاجل\s*[:：]?$/i,
  /^breaking\s+news$/i,
  /^news\s+alert$/i,
  /^update$/i,
  /^alert$/i,
];

const GENERIC_BODY_PATTERNS = [
  /^الأسواق\s+تترقب\.?$/i,
  /^تطور\s+مهم\s+في\s+الأسواق\.?$/i,
  /^خبر\s+عاجل\.?$/i,
  /^تطور\s+مهم\.?$/i,
];

const LISTICLE_HEADLINE_PATTERNS = [
  /أهم\s+\d+\s+(?:نقاط?|أشياء?)/i,
  /\d+\s+(?:things?|points?)\s+to\s+watch/i,
  /what\s+to\s+watch/i,
];

const ENTITY_PATTERN =
  /(?:nvidia|apple|tesla|microsoft|amazon|meta|google|alphabet|bitcoin|btc|ethereum|eth|gold|silver|oil|crude|brent|wti|fed|fomc|powell|warsh|kashkari|iran|israel|ukraine|russia|china|treasury|nasdaq|dow|s&p|dollar|yen|euro|opec|hormuz|gaza|tehran|trump|biden|paramount|warner|lakers|ellison|bessent|mufg|coinbase|kospi|boj|pboc|ecb|jackson|korea|japan|iran|nvidia|إنفيديا|انفيديا|آبل|ابل|تسلا|بيتكوين|البيتكوين|الذهب|النفط|برنت|الفيدرالي|باول|وارش|كاشkari|كاشكاري|إيران|ايران|إسرائيل|اسرائيل|أوكرانيا|اوكرانيا|روسيا|الصين|هرمز|غزة|طهران|ترامب|بايدen|ناسdaq|ناسداك|داو|دولار|ين|يورو|أوبك|اوبك|باراماونt|باراماونت|كوريا|اليابان|المحكمة|الخزانة|العائد|سندات|فائدة|مركزي|مصرف|بنك|كوينبيس|ستاندرد)/i;

const ARABIC_EVENT_PATTERN =
  /(?:يتوقع|يُتوقع|أعلن|اعلن|قال|تقول|صر[ّ]?ح|أكد|اكد|رفض|وافق|ارتفع|انخفض|هبط|قفز|تراجع|تصعد|صعد|فرض|رفع|خفض|قرر|حذر|أشار|اشار|كشف|أصدر|اصدر|أطلق|اطلق|أغلق|اغلق|فتح|أوقف|اوقف|انقسم|سجل|شهد|تواجه|تسعى|تطلق|أطلقت|تُبقي|يبقي|أبقى|أظهر|بلغ|وصل|تجاوز|ألغى|استحوذ|باع|اشترى|تقدم|انسحب|ثبت|استقر|واجه|واجهت|فرضت|رفعت|خفضت|أبقت|تم|تـ?م)/u;

const EVENT_VERB_PATTERN =
  /(?:قال|أعلن|اعلن|صر[ّ]?ح|أكد|اكد|رفض|وافق|ارتفع|انخفض|هبط|قفز|تراجع|تصعد|ضرب|فرض|رفع|خفض|قرر|أبلغ|ابلغ|حذر|أشار|اشار|كشف|أصدر|اصدر|أطلق|اطلق|أغلق|اغلق|فتح|أوقف|اوقف|beat|miss|surge|jump|fall|drop|plunge|rally|warn|say|said|announce|report|confirm|deny|approve|reject|raise|cut|lower|boost|slash|impose|lift|close|reopen|attack|strike|sanction|tariff|deal|launch|fire|explode|negotiate|agree|warns|announces|reports|confirms|escalates|threatens|imposes|closes|reopens|blocks|launches|fires|explodes|negotiates|agrees|sue|sues|cancel|cancels|debut|debuts|hit|hits|split|investigate|investigates|kick|kicks|back|backing|withhold|withholds|withheld)/i;

const FACTUAL_CLAUSE_PATTERN =
  /(?:قال|أعلن|اعلن|صر[ّ]?ح|أكد|اكد|رفض|وافق|ارتفع|انخفض|هبط|قفز|تراجع|تصعد|فرض|رفع|خفض|قرر|حذر|أشار|اشار|كشف|أصدر|اصدر|أطلق|اطلق|أغلق|اغلق|فتح|أوقف|اوقف|beat|miss|surge|jump|fall|drop|plunge|rally|warn|announce|report|confirm|deny|approve|reject|raise|cut|lower|boost|slash|impose|lift|close|reopen|attack|strike|sanction|tariff|deal|launch|fire|explode|negotiate|agree|\d+(?:\.\d+)?%|\$\d|€\d|£\d)/i;

function hasSufficientArabicContent(text = "", minimum = 10) {
  return (String(text || "").match(/[\u0600-\u06FF]/gu) || []).length >= minimum;
}

function stripPresentationNoise(value = "") {
  return String(value || "")
    .replace(/[\s🚨📌📈📉🔥⚡🛢️💰🇺🇸🇮🇷🔴🟢🟡🎯📊📰⚠️]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGenericHeadline(headline = "") {
  const normalized = normalizeHeadlineComparable(headline);
  if (!normalized || normalized.length < 8) {
    return true;
  }
  return GENERIC_HEADLINE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function extractEditorialContent(presentation = {}) {
  const telegramSections = splitEditorialSections(presentation.telegramMessage || "");
  const siteBody = stripOfficialChannelFooter(presentation.siteContent || "");
  const headline = presentation.canonicalHeadline || stripPresentationNoise(telegramSections.headlineLine);
  const body = siteBody || telegramSections.bodyText || "";
  return { headline, body, combined: `${headline}\n${body}`.trim() };
}

function hasSpecificSubject(combined = "", context = {}) {
  if (ENTITY_PATTERN.test(combined)) {
    return true;
  }

  const sourceTitle = String(context.sourceTitle || "").trim();
  if (ENTITY_PATTERN.test(sourceTitle) && combined.length >= 24 && hasSufficientArabicContent(combined, 10)) {
    return true;
  }

  const titleTokens = sourceTitle.match(/\b[A-Za-z][A-Za-z0-9&'.-]{2,}\b/g) || [];
  for (const token of titleTokens) {
    if (token.length >= 4 && combined.toLowerCase().includes(token.toLowerCase())) {
      return true;
    }
  }

  const knownEntities = [
    ...(context.knownEntities || []),
    ...(context.organizations || []),
    ...(context.people || []).map((person) => person.name || person.canonicalName).filter(Boolean),
    ...(context.instruments || []),
  ];
  for (const entity of knownEntities) {
    const normalized = String(entity || "").trim();
    if (normalized.length >= 3 && combined.toLowerCase().includes(normalized.toLowerCase())) {
      return true;
    }
  }

  return false;
}

function hasStructuredFactBackedSubject(context = {}, combined = "") {
  if (hasSpecificSubject(combined, context)) return true;
  const sourceTitle = String(context.sourceTitle || "").trim();
  if (hasIdentifiableSubject(sourceTitle) && combined.length >= 24 && hasSufficientArabicContent(combined, 10)) {
    return true;
  }
  const facts = context.structuredFacts || {};
  return Boolean(
    (facts.people || []).length ||
      (facts.organizations || []).length ||
      (facts.instruments || []).length
  );
}

function hasStructuredFactBackedDevelopment(context = {}, combined = "") {
  const facts = context.structuredFacts || {};
  const sourceTitle = String(context.sourceTitle || "");
  const sourceCombined = [sourceTitle, ...(facts.numbers || []).map((entry) => entry.raw || entry)]
    .filter(Boolean)
    .join(" ");

  if (
    EVENT_VERB_PATTERN.test(combined) ||
    ARABIC_EVENT_PATTERN.test(combined) ||
    FACTUAL_CLAUSE_PATTERN.test(combined)
  ) {
    return true;
  }

  if ((facts.numbers || []).length && /\d/.test(combined)) {
    return true;
  }

  if ((facts.quotes || []).length && (facts.attributions || []).length) {
    return true;
  }

  if (hasClearDevelopment(sourceTitle)) return true;

  return EVENT_VERB_PATTERN.test(sourceCombined) || /(?:rate|hike|decline|surge|merger|earnings|sanction|tariff|buyback|split|investigate|debut|launch)/i.test(sourceTitle);
}

function hasStandaloneFactCommunication(headline = "", body = "", context = {}) {
  const combined = `${headline}\n${body}`.trim();
  if (isGenericHeadline(headline)) return false;
  if (GENERIC_BODY_PATTERNS.some((pattern) => pattern.test(stripPresentationNoise(body)))) return false;
  if (combined.replace(/[^\u0600-\u06FFa-z0-9]/gi, "").length < 20) return false;

  const sourceTitle = String(context.sourceTitle || "");
  if (
    hasStructuredFactBackedSubject(context, combined) &&
    hasClearDevelopment(sourceTitle) &&
    body.length >= 28
  ) {
    return true;
  }

  if (
    ENTITY_PATTERN.test(sourceTitle) &&
    hasClearDevelopment(sourceTitle) &&
    body.length >= 28 &&
    hasSufficientArabicContent(body, 12)
  ) {
    return true;
  }

  return hasStructuredFactBackedSubject(context, combined) && hasStructuredFactBackedDevelopment(context, combined);
}

function validateRssMinimumInformation(presentation = {}, context = {}) {
  const { headline, body, combined } = extractEditorialContent(presentation);
  const editorialOnly = stripOfficialChannelFooter(combined);

  const analysisGate = evaluateAnalysisDeliverableGate({
    title: headline,
    contentSnippet: body,
    content: body,
    summary: combined,
  });
  if (!analysisGate.ok) {
    return {
      ok: false,
      reason: analysisGate.outcome,
      issue: analysisGate.reason,
    };
  }

  if (!editorialOnly || editorialOnly.replace(/[^\u0600-\u06FFa-z0-9]/gi, "").length < 12) {
    return { ok: false, reason: REASON_CODES.RSS_MINIMUM_INFORMATION_FAILED, issue: "empty_editorial_content" };
  }

  if (context.structuredFacts && hasStandaloneFactCommunication(headline, body, context)) {
    return { ok: true, reason: null };
  }

  if (isGenericHeadline(headline)) {
    return { ok: false, reason: REASON_CODES.RSS_GENERIC_BREAKING_OUTPUT, issue: "generic_headline_only" };
  }

  if (LISTICLE_HEADLINE_PATTERNS.some((pattern) => pattern.test(headline)) && !FACTUAL_CLAUSE_PATTERN.test(body)) {
    return { ok: false, reason: REASON_CODES.RSS_LOW_INFORMATION_VALUE, issue: "listicle_without_factual_body" };
  }

  const normalizedBody = stripPresentationNoise(body);
  if (!normalizedBody || GENERIC_BODY_PATTERNS.some((pattern) => pattern.test(normalizedBody))) {
    if (!FACTUAL_CLAUSE_PATTERN.test(combined)) {
      return { ok: false, reason: REASON_CODES.RSS_GENERIC_BREAKING_OUTPUT, issue: "generic_body_only" };
    }
  }

  const hasEntity = hasSpecificSubject(combined, context);
  const hasEvent =
    EVENT_VERB_PATTERN.test(combined) ||
    ARABIC_EVENT_PATTERN.test(combined) ||
    FACTUAL_CLAUSE_PATTERN.test(body || headline);
  const hasFactualClause =
    FACTUAL_CLAUSE_PATTERN.test(body) ||
    (FACTUAL_CLAUSE_PATTERN.test(headline) && body.length >= 20) ||
    (hasEntity && body.length >= 35 && ARABIC_EVENT_PATTERN.test(body));

  if (!hasEntity) {
    return { ok: false, reason: REASON_CODES.RSS_MINIMUM_INFORMATION_FAILED, issue: "missing_specific_subject" };
  }

  if (!hasEvent) {
    return { ok: false, reason: REASON_CODES.RSS_MINIMUM_INFORMATION_FAILED, issue: "missing_specific_event" };
  }

  if (!hasFactualClause) {
    return { ok: false, reason: REASON_CODES.RSS_LOW_INFORMATION_VALUE, issue: "missing_factual_clause" };
  }

  return { ok: true, reason: null };
}

module.exports = {
  REASON_CODES,
  validateRssMinimumInformation,
  extractEditorialContent,
  isGenericHeadline,
  hasSpecificSubject,
  hasStructuredFactBackedSubject,
  hasStructuredFactBackedDevelopment,
  hasStandaloneFactCommunication,
  hasSufficientArabicContent,
};
