const { CANONICAL_EVENT_DEFINITIONS, patternMatchLength, resolveBestEventMatch } = require("../economic-releases/canonical-events");
const { normalizeTextForMatching } = require("../economic-releases/text-normalization");
const { countryCodeFromOptions, eventKeyMatchesCountry } = require("../economic-releases/country-resolver");
const { ARABIC_ALIASES } = require("./alias-catalog");

const EVENT_FAMILIES = {
  US_WEEKLY_LABOR_CLAIMS: new Set(["US_INITIAL_JOBLESS_CLAIMS", "US_CONTINUING_JOBLESS_CLAIMS"]),
};

const FAMILY_PUBLICATION_EVENT_TYPES = new Set(["US_WEEKLY_LABOR_CLAIMS"]);

function normalizeAliasText(value) {
  return normalizeTextForMatching(value);
}

function resolveEventTypeMatch(text, options = {}) {
  const normalized = normalizeAliasText(text);
  const countryCode = countryCodeFromOptions(options, normalized);

  if (/\bism\b/i.test(normalized)) {
    return { eventKey: null, ambiguous: false };
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

  const outcome = resolveBestEventMatch(matched, { countryCode });
  if (outcome.ambiguous) {
    return { eventKey: null, ambiguous: true };
  }
  return { eventKey: outcome.match?.eventKey || null, ambiguous: false };
}

function resolveEventTypeFromAliases(text, options = {}) {
  return resolveEventTypeMatch(text, options).eventKey;
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
  resolveEventTypeMatch,
  resolveEventTypeFromAliases,
  getEventFamily,
  isFamilyPublicationEventType,
  listNumericReleaseEventTypes,
  countAliasCoverage,
};
