const {
  stripOfficialChannelFooter,
  normalizeHeadlineComparable,
  splitEditorialSections,
} = require("./publication-format");

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
  /(?:nvidia|apple|tesla|microsoft|amazon|meta|google|alphabet|bitcoin|btc|ethereum|eth|gold|silver|oil|crude|brent|wti|fed|fomc|powell|warsh|iran|israel|ukraine|russia|china|treasury|nasdaq|dow|s&p|dollar|yen|euro|opec|hormuz|gaza|tehran|trump|biden|إنفيديا|انفيديا|آبل|ابل|تسلا|بيتكوين|البيتكوين|الذهب|النفط|برنت|الفيدرالي|باول|وارش|إيران|ايران|إسرائيل|اسرائيل|أوكرانيا|اوكرانيا|روسيا|الصين|هرمز|غزة|طهران|ترامب|بايدن|ناسداك|داو|دولار|ين|يورو|أوبك|اوبك)/i;

const EVENT_VERB_PATTERN =
  /(?:قال|أعلن|اعلن|صر[ّ]?ح|أكد|اكد|رفض|وافق|ارتفع|انخفض|هبط|قفز|تراجع|تصعد|ضرب|فرض|رفع|خفض|قرر|أبلغ|ابلغ|حذر|أشار|اشار|كشف|أصدر|اصدر|أطلق|اطلق|أغلق|اغلق|فتح|أوقف|اوقف|beat|miss|surge|jump|fall|drop|plunge|rally|warn|say|said|announce|report|confirm|deny|approve|reject|raise|cut|lower|boost|slash|impose|lift|close|reopen|attack|strike|sanction|tariff|deal|launch|fire|explode|negotiate|agree|warns|announces|reports|confirms|escalates|threatens|imposes|closes|reopens|blocks|launches|fires|explodes|negotiates|agrees)/i;

const FACTUAL_CLAUSE_PATTERN =
  /(?:قال|أعلن|اعلن|صر[ّ]?ح|أكد|اكد|رفض|وافق|ارتفع|انخفض|هبط|قفز|تراجع|تصعد|فرض|رفع|خفض|قرر|حذر|أشار|اشار|كشف|أصدر|اصدر|أطلق|اطلق|أغلق|اغلق|فتح|أوقف|اوقف|beat|miss|surge|jump|fall|drop|plunge|rally|warn|announce|report|confirm|deny|approve|reject|raise|cut|lower|boost|slash|impose|lift|close|reopen|attack|strike|sanction|tariff|deal|launch|fire|explode|negotiate|agree|\d+(?:\.\d+)?%|\$\d|€\d|£\d)/i;

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

function validateRssMinimumInformation(presentation = {}) {
  const { headline, body, combined } = extractEditorialContent(presentation);
  const editorialOnly = stripOfficialChannelFooter(combined);

  if (!editorialOnly || editorialOnly.replace(/[^\u0600-\u06FFa-z0-9]/gi, "").length < 12) {
    return { ok: false, reason: REASON_CODES.RSS_MINIMUM_INFORMATION_FAILED, issue: "empty_editorial_content" };
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

  const hasEntity = ENTITY_PATTERN.test(combined);
  const hasEvent = EVENT_VERB_PATTERN.test(combined) || FACTUAL_CLAUSE_PATTERN.test(body || headline);
  const hasFactualClause = FACTUAL_CLAUSE_PATTERN.test(body) || (FACTUAL_CLAUSE_PATTERN.test(headline) && body.length >= 20);

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
};
