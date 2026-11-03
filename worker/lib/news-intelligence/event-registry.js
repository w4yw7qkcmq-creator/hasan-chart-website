const { CANONICAL_EVENT_DEFINITIONS, patternMatchLength, selectBestMatchedEvent } = require("../economic-releases/canonical-events");
const { normalizeTextForMatching } = require("../economic-releases/text-normalization");
const { resolveCountryCode, eventKeyMatchesCountry } = require("../economic-releases/country-resolver");
const { ARABIC_ALIASES } = require("./alias-catalog");

const EVENT_FAMILIES = {
  US_WEEKLY_LABOR_CLAIMS: new Set(["US_INITIAL_JOBLESS_CLAIMS", "US_CONTINUING_JOBLESS_CLAIMS"]),
};

const FAMILY_PUBLICATION_EVENT_TYPES = new Set(["US_WEEKLY_LABOR_CLAIMS"]);

function normalizeAliasText(value) {
  return normalizeTextForMatching(value);
}

function resolveEventTypeFromAliases(text, options = {}) {
  const normalized = normalizeAliasText(text);
  const countryCode = options.countryCode || resolveCountryCode(normalized) || null;

  if (/\bism\b/i.test(normalized)) {
    return null;
  }

  const matched = [];
  Object.entries(ARABIC_ALIASES).forEach(([eventType, patterns], index) => {
    if (countryCode && !eventKeyMatchesCountry(eventType, countryCode)) {
      return;
    }
    if (
      !countryCode &&
      /^(?!US_).+_(MANUFACTURING_PMI|SERVICES_PMI|COMPOSITE_PMI|PMI)$/.test(eventType)
    ) {
      return;
    }
    const matchLength = patternMatchLength(normalized, patterns);
    if (matchLength < 0) return;
    matched.push({
      eventKey: eventType,
      priority: CANONICAL_EVENT_DEFINITIONS[eventType]?.priority ?? 100,
      matchLength,
      index,
    });
  });

  return selectBestMatchedEvent(matched)?.eventKey || null;
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

function countAliasCoverage() {
  return Object.keys(ARABIC_ALIASES).length;
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
  countAliasCoverage,
};
