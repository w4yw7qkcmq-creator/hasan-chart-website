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
