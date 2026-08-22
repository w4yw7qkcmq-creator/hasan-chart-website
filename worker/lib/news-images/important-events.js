const { CANONICAL_EVENT_DEFINITIONS } = require("../economic-releases/canonical-events");

const PREMIUM_IMAGE_EVENT_KEYS = new Set([
  "US_FED_RATE_DECISION",
  "US_POWELL_SPEECH",
  "US_FED_STATEMENT",
  "US_CPI_MOM",
  "US_CPI_YOY",
  "US_CPI_GENERIC",
  "US_CORE_CPI_MOM",
  "US_CORE_CPI_YOY",
  "US_PPI",
  "US_PPI_MOM",
  "US_PPI_YOY",
  "US_NFP",
  "US_UNEMPLOYMENT_RATE",
  "US_GDP_QOQ",
  "US_RETAIL_SALES",
  "US_CORE_RETAIL_SALES",
  "US_PCE",
  "US_CORE_PCE_MOM",
  "US_CORE_PCE_YOY",
  "US_ISM_MANUFACTURING",
  "US_ISM_SERVICES",
  "US_SP_GLOBAL_FLASH_MANUFACTURING_PMI",
  "US_SP_GLOBAL_FLASH_SERVICES_PMI",
  "US_ADP",
  "US_INITIAL_JOBLESS_CLAIMS",
  "US_CONTINUING_JOBLESS_CLAIMS",
]);

const DISPLAY_NAME_OVERRIDES = {
  US_FED_RATE_DECISION: "Federal Reserve Interest Rate Decision",
  US_POWELL_SPEECH: "Federal Reserve Press Conference",
  US_FED_STATEMENT: "FOMC Statement",
  US_CPI_MOM: "US CPI",
  US_CPI_YOY: "US CPI",
  US_CPI_GENERIC: "US CPI",
  US_CORE_CPI_MOM: "Core CPI",
  US_CORE_CPI_YOY: "Core CPI",
  US_PPI: "US PPI",
  US_PPI_MOM: "US PPI",
  US_PPI_YOY: "US PPI",
  US_NFP: "Non Farm Payrolls",
  US_UNEMPLOYMENT_RATE: "US Unemployment Rate",
  US_GDP_QOQ: "US GDP",
  US_RETAIL_SALES: "US Retail Sales",
  US_CORE_RETAIL_SALES: "US Core Retail Sales",
  US_PCE: "US PCE",
  US_CORE_PCE_MOM: "Core PCE",
  US_CORE_PCE_YOY: "Core PCE",
  US_ISM_MANUFACTURING: "ISM Manufacturing",
  US_ISM_SERVICES: "ISM Services",
  US_SP_GLOBAL_FLASH_MANUFACTURING_PMI: "S&P Global Flash Manufacturing PMI",
  US_SP_GLOBAL_FLASH_SERVICES_PMI: "S&P Global Flash Services PMI",
  US_ADP: "ADP Employment Report",
  US_INITIAL_JOBLESS_CLAIMS: "Initial Jobless Claims",
  US_CONTINUING_JOBLESS_CLAIMS: "Continuing Jobless Claims",
};

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
    country: release.country || "US",
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
    country: facts.country || "US",
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
