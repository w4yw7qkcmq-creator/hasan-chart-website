const { CANONICAL_EVENT_DEFINITIONS } = require("../economic-releases/canonical-events");
const { buildFullInterpretationRegistry } = require("../news-intelligence/economic-editorial/interpretation-catalog");

const interpretationRegistry = buildFullInterpretationRegistry();

const PREMIUM_IMAGE_EVENT_KEYS = new Set(
  Object.entries(interpretationRegistry)
    .filter(([, meta]) => meta.importance === "HIGH" || meta.visualPriority === "REQUIRED")
    .map(([key]) => key)
    .concat(["US_CPI_GENERIC", "UK_CPI_GENERIC", "EZ_CPI_GENERIC"])
);

const DISPLAY_NAME_OVERRIDES = Object.fromEntries(
  Object.entries(CANONICAL_EVENT_DEFINITIONS).map(([key, def]) => [key, def.arabicName || key.replace(/^US_/, "").replace(/_/g, " ")])
);

DISPLAY_NAME_OVERRIDES.US_ADP_EMPLOYMENT = "ADP Employment Report";
DISPLAY_NAME_OVERRIDES.US_CPI_GENERIC = "US CPI";
DISPLAY_NAME_OVERRIDES.UK_CPI_GENERIC = "UK CPI";
DISPLAY_NAME_OVERRIDES.EZ_CPI_GENERIC = "Eurozone CPI";

function normalizeEventKey(value) {
  return String(value || "").trim().toUpperCase();
}

function isPremiumImageEvent(eventKey) {
  return PREMIUM_IMAGE_EVENT_KEYS.has(normalizeEventKey(eventKey));
}

function getPremiumEventDisplayName(eventKey, canonical = null) {
  const key = normalizeEventKey(eventKey);
  if (DISPLAY_NAME_OVERRIDES[key]) {
    return DISPLAY_NAME_OVERRIDES[key];
  }
  if (canonical?.arabicName) {
    return canonical.arabicName;
  }
  const definition = CANONICAL_EVENT_DEFINITIONS[key];
  if (definition?.arabicName) {
    return definition.arabicName;
  }
  return key.replace(/^US_/, "").replace(/_/g, " ");
}

function buildPremiumImageContextFromRelease(result = {}) {
  const eventKey = result.canonical?.eventKey || result.eventKey || null;
  if (!eventKey || !isPremiumImageEvent(eventKey)) {
    return null;
  }

  const release = result.structuredRelease || result.merged || {};
  return {
    eventKey,
    eventName: getPremiumEventDisplayName(eventKey, result.canonical),
    country: release.country || result.canonical?.country || "US",
    releaseTime: release.scheduledAt || result.scheduledAt || new Date().toISOString(),
    brandName: "Economic Newsi",
  };
}

function buildPremiumImageContextFromCandidate(candidate = {}) {
  const facts = candidate.facts || {};
  const eventKey = facts.canonicalEventKey || facts.canonical?.eventKey || null;
  if (!eventKey || !isPremiumImageEvent(eventKey)) {
    return null;
  }

  return {
    eventKey,
    eventName: getPremiumEventDisplayName(eventKey, facts.canonical),
    country: facts.countryCode || facts.country || "US",
    releaseTime: candidate.post?.sourcePublishedAt || new Date().toISOString(),
    brandName: "Economic Newsi",
  };
}

module.exports = {
  PREMIUM_IMAGE_EVENT_KEYS,
  DISPLAY_NAME_OVERRIDES,
  isPremiumImageEvent,
  getPremiumEventDisplayName,
  buildPremiumImageContextFromRelease,
  buildPremiumImageContextFromCandidate,
};
