const { CANONICAL_EVENT_DEFINITIONS } = require("../economic-releases/canonical-events");

const EVENT_FAMILIES = {
  US_WEEKLY_LABOR_CLAIMS: new Set(["US_INITIAL_JOBLESS_CLAIMS", "US_CONTINUING_JOBLESS_CLAIMS"]),
};

const FAMILY_PUBLICATION_EVENT_TYPES = new Set(["US_WEEKLY_LABOR_CLAIMS"]);

const ARABIC_ALIASES = {
  US_INITIAL_JOBLESS_CLAIMS: [
    /initial jobless claims/i,
    /initial claims/i,
    /(?<!continuing )jobless claims/i,
    /unemployment claims/i,
    /مطالبات البطالة/i,
    /طلبات إعانة البطالة/i,
    /طلبات البطالة/i,
    /معدلات الشكاوى من البطالة/i,
    /الشكاوى من البطالة/i,
    /إعانات البطالة/i,
  ],
  US_CONTINUING_JOBLESS_CLAIMS: [
    /continuing jobless claims/i,
    /continued claims/i,
    /continuing claims/i,
    /طلبات إعانة البطالة المستمرة/i,
    /المطالبات المستمرة/i,
  ],
  US_PHILADELPHIA_FED_MANUFACTURING: [
    /philadelphia fed(?:eral)?(?:\s+bank)?(?:\s+manufacturing|\s+business outlook|\s+index)?/i,
    /philly fed(?:eral)?(?:\s+manufacturing|\s+business outlook|\s+index)?/i,
    /philadelphia fed manufacturing index/i,
    /philly fed manufacturing index/i,
    /philadelphia fed business outlook/i,
    /philly fed index/i,
    /مؤشر فيلادلفيا/i,
    /فيلادلفيا للصناعات/i,
    /الصناعات التحويلية/i,
  ],
  US_SP_GLOBAL_FLASH_MANUFACTURING_PMI: [
    /s&p global.*(?:flash.*)?(?:us )?manufacturing pmi|sp global.*(?:flash.*)?(?:us )?manufacturing pmi/i,
    /flash manufacturing pmi|s&p global us manufacturing pmi|sp global us manufacturing pmi/i,
    /(?<!ism )(?<!ism\s)(?<!s&p global )(?<!sp global )manufacturing pmi(?![\s\S]*services)/i,
    /مؤشر مديري المشتريات الصناعي/i,
    /مؤشر مديري المشتريات التصنيعي/i,
    /مديري المشتريات الصناعي/i,
    /مديري المشتريات التصنيعي/i,
    /مؤشر مديري المشتريات للقطاع الصناعي/i,
    /مؤشر مديري المشتريات للقطاع التصنيعي/i,
  ],
  US_SP_GLOBAL_FLASH_SERVICES_PMI: [
    /s&p global.*(?:flash.*)?(?:us )?services pmi|sp global.*(?:flash.*)?(?:us )?services pmi/i,
    /flash services pmi|s&p global us services pmi|sp global us services pmi/i,
    /(?<!ism )(?<!ism\s)(?<!s&p global )(?<!sp global )services pmi/i,
    /مؤشر مديري المشتريات الخدمي/i,
    /مؤشر مديري المشتريات للخدمات/i,
    /مديري المشتريات الخدمي/i,
    /مديري المشتريات الخدماتي/i,
    /مؤشر مديري المشتريات للقطاع الخدمي/i,
    /مؤشر مديري المشتريات لقطاع الخدمات/i,
  ],
};

function normalizeAliasText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, " ")
    .replace(/[^\p{L}\p{N}%./+\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAlias(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function resolveEventTypeFromAliases(text) {
  const normalized = normalizeAliasText(text);
  for (const [eventType, patterns] of Object.entries(ARABIC_ALIASES)) {
    if (matchesAlias(normalized, patterns)) {
      return eventType;
    }
  }
  return null;
}

function getEventFamily(eventType) {
  for (const [family, members] of Object.entries(EVENT_FAMILIES)) {
    if (members.has(eventType)) {
      return family;
    }
  }
  return null;
}

function listNumericReleaseEventTypes() {
  return Object.entries(CANONICAL_EVENT_DEFINITIONS)
    .filter(([, def]) => def.requiresTripleTemplate === true)
    .map(([key]) => key);
}

function isFamilyPublicationEventType(eventType) {
  return FAMILY_PUBLICATION_EVENT_TYPES.has(eventType);
}

module.exports = {
  EVENT_FAMILIES,
  FAMILY_PUBLICATION_EVENT_TYPES,
  ARABIC_ALIASES,
  normalizeAliasText,
  resolveEventTypeFromAliases,
  getEventFamily,
  isFamilyPublicationEventType,
  listNumericReleaseEventTypes,
};
