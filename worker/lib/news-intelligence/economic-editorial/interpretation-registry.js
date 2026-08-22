const { CANONICAL_EVENT_DEFINITIONS } = require("../../economic-releases/canonical-events");
const { EVENT_FAMILIES } = require("../event-registry");

/** @typedef {'HIGHER'|'LOWER'|'CONTEXTUAL'|'RATE_POLICY'} BetterWhen */
/** @typedef {'HIGH'|'MEDIUM'|'LOW'} ImportanceLevel */
/** @typedef {'REQUIRED'|'OPTIONAL'|'NONE'} VisualPriority */

const INTERPRETATION_METADATA = {
  US_INITIAL_JOBLESS_CLAIMS: {
    betterWhen: "LOWER",
    marketSensitivity: ["USD", "GOLD", "RATES"],
    importance: "HIGH",
    visualPriority: "REQUIRED",
    childLabelAr: "طلبات الإعانة الأولية",
  },
  US_CONTINUING_JOBLESS_CLAIMS: {
    betterWhen: "LOWER",
    marketSensitivity: ["USD", "GOLD", "RATES"],
    importance: "HIGH",
    visualPriority: "REQUIRED",
    childLabelAr: "طلبات الإعانة المستمرة",
  },
  US_NFP: {
    betterWhen: "HIGHER",
    marketSensitivity: ["USD", "GOLD", "EQUITIES", "RATES"],
    importance: "HIGH",
    visualPriority: "REQUIRED",
  },
  US_UNEMPLOYMENT_RATE: {
    betterWhen: "LOWER",
    marketSensitivity: ["USD", "GOLD", "RATES"],
    importance: "HIGH",
    visualPriority: "REQUIRED",
  },
  US_CPI_MOM: {
    betterWhen: "CONTEXTUAL",
    marketSensitivity: ["USD", "GOLD", "RATES", "EQUITIES"],
    importance: "HIGH",
    visualPriority: "REQUIRED",
  },
  US_CPI_YOY: {
    betterWhen: "CONTEXTUAL",
    marketSensitivity: ["USD", "GOLD", "RATES", "EQUITIES"],
    importance: "HIGH",
    visualPriority: "REQUIRED",
  },
  US_CORE_CPI_MOM: {
    betterWhen: "CONTEXTUAL",
    marketSensitivity: ["USD", "GOLD", "RATES"],
    importance: "HIGH",
    visualPriority: "REQUIRED",
  },
  US_CORE_CPI_YOY: {
    betterWhen: "CONTEXTUAL",
    marketSensitivity: ["USD", "GOLD", "RATES"],
    importance: "HIGH",
    visualPriority: "REQUIRED",
  },
  US_PPI_MOM: {
    betterWhen: "CONTEXTUAL",
    marketSensitivity: ["USD", "GOLD", "RATES"],
    importance: "MEDIUM",
    visualPriority: "REQUIRED",
  },
  US_GDP_QOQ: {
    betterWhen: "HIGHER",
    marketSensitivity: ["USD", "GOLD", "EQUITIES"],
    importance: "HIGH",
    visualPriority: "REQUIRED",
  },
  US_RETAIL_SALES: {
    betterWhen: "HIGHER",
    marketSensitivity: ["USD", "GOLD", "EQUITIES"],
    importance: "HIGH",
    visualPriority: "REQUIRED",
  },
  US_CORE_RETAIL_SALES: {
    betterWhen: "HIGHER",
    marketSensitivity: ["USD", "GOLD", "EQUITIES"],
    importance: "MEDIUM",
    visualPriority: "REQUIRED",
  },
  US_ISM_MANUFACTURING: {
    betterWhen: "HIGHER",
    marketSensitivity: ["USD", "EQUITIES"],
    importance: "HIGH",
    visualPriority: "REQUIRED",
    pmiThreshold: 50,
  },
  US_SP_GLOBAL_FLASH_MANUFACTURING_PMI: {
    betterWhen: "HIGHER",
    marketSensitivity: ["USD", "EQUITIES"],
    importance: "HIGH",
    visualPriority: "REQUIRED",
    pmiThreshold: 50,
  },
  US_PHILADELPHIA_FED_MANUFACTURING: {
    betterWhen: "HIGHER",
    marketSensitivity: ["USD", "EQUITIES"],
    importance: "HIGH",
    visualPriority: "REQUIRED",
    pmiThreshold: 0,
  },
  US_ISM_SERVICES: {
    betterWhen: "HIGHER",
    marketSensitivity: ["USD", "EQUITIES"],
    importance: "HIGH",
    visualPriority: "REQUIRED",
    pmiThreshold: 50,
  },
  US_SP_GLOBAL_FLASH_SERVICES_PMI: {
    betterWhen: "HIGHER",
    marketSensitivity: ["USD", "EQUITIES"],
    importance: "HIGH",
    visualPriority: "REQUIRED",
    pmiThreshold: 50,
  },
  US_FED_RATE_DECISION: {
    betterWhen: "RATE_POLICY",
    marketSensitivity: ["USD", "GOLD", "RATES", "EQUITIES"],
    importance: "HIGH",
    visualPriority: "REQUIRED",
  },
  US_POWELL_SPEECH: {
    betterWhen: "CONTEXTUAL",
    marketSensitivity: ["USD", "GOLD", "RATES", "EQUITIES"],
    importance: "HIGH",
    visualPriority: "REQUIRED",
  },
};

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

const IMAGE_REQUIRED_EVENTS = new Set([
  "US_FED_RATE_DECISION",
  "US_FED_STATEMENT",
  "US_POWELL_SPEECH",
  "US_CPI_MOM",
  "US_CPI_YOY",
  "US_CORE_CPI_MOM",
  "US_CORE_CPI_YOY",
  "US_NFP",
  "US_UNEMPLOYMENT_RATE",
  "US_INITIAL_JOBLESS_CLAIMS",
  "US_CONTINUING_JOBLESS_CLAIMS",
  "US_GDP_QOQ",
  "US_WEEKLY_LABOR_CLAIMS",
  "US_SP_GLOBAL_FLASH_MANUFACTURING_PMI",
  "US_SP_GLOBAL_FLASH_SERVICES_PMI",
]);

function getInterpretationMetadata(eventType) {
  return INTERPRETATION_METADATA[eventType] || {
    betterWhen: "CONTEXTUAL",
    marketSensitivity: ["USD"],
    importance: "MEDIUM",
    visualPriority: "OPTIONAL",
  };
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
