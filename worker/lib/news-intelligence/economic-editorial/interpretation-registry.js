const { CANONICAL_EVENT_DEFINITIONS } = require("../../economic-releases/canonical-events");
const { EVENT_FAMILIES } = require("../event-registry");
const { buildFullInterpretationRegistry } = require("./interpretation-catalog");

/** @typedef {'HIGHER'|'LOWER'|'CONTEXTUAL'|'RATE_POLICY'} BetterWhen */
/** @typedef {'HIGH'|'MEDIUM'|'LOW'} ImportanceLevel */
/** @typedef {'REQUIRED'|'OPTIONAL'|'NONE'} VisualPriority */

const INTERPRETATION_METADATA = buildFullInterpretationRegistry();

const FAMILY_METADATA = {
  US_WEEKLY_LABOR_CLAIMS: {
    headlineAr: "بيانات إعانات البطالة الأمريكية",
    countryLineAr: "الولايات المتحدة 🇺🇸",
    importance: "HIGH",
    visualPriority: "REQUIRED",
    expectedSiblings: ["US_INITIAL_JOBLESS_CLAIMS", "US_CONTINUING_JOBLESS_CLAIMS"],
    aggregationWindowMs: 6000,
  },
};

const IMAGE_REQUIRED_EVENTS = new Set(
  Object.entries(INTERPRETATION_METADATA)
    .filter(([, meta]) => meta.visualPriority === "REQUIRED" && meta.importance !== "LOW")
    .map(([key]) => key)
);

function getInterpretationMetadata(eventType) {
  return (
    INTERPRETATION_METADATA[eventType] || {
      betterWhen: "CONTEXTUAL",
      marketSensitivity: ["USD"],
      importance: "MEDIUM",
      visualPriority: "OPTIONAL",
    }
  );
}

function getFamilyMetadata(eventFamily) {
  return FAMILY_METADATA[eventFamily] || null;
}

function getEventArabicName(eventType) {
  const def = CANONICAL_EVENT_DEFINITIONS[eventType];
  return def?.arabicName || eventType;
}

function resolveVisualPriority(eventType, eventFamily = null) {
  if (eventFamily && FAMILY_METADATA[eventFamily]?.visualPriority) {
    return FAMILY_METADATA[eventFamily].visualPriority;
  }
  const meta = getInterpretationMetadata(eventType);
  if (meta.visualPriority) {
    return meta.visualPriority;
  }
  return IMAGE_REQUIRED_EVENTS.has(eventType) ? "REQUIRED" : "OPTIONAL";
}

function listRegisteredEventTypes() {
  return Object.keys(INTERPRETATION_METADATA);
}

function getFamilyMembers(eventFamily) {
  return EVENT_FAMILIES[eventFamily] ? [...EVENT_FAMILIES[eventFamily]] : [];
}

module.exports = {
  INTERPRETATION_METADATA,
  FAMILY_METADATA,
  IMAGE_REQUIRED_EVENTS,
  getInterpretationMetadata,
  getFamilyMetadata,
  getEventArabicName,
  resolveVisualPriority,
  listRegisteredEventTypes,
  getFamilyMembers,
};
