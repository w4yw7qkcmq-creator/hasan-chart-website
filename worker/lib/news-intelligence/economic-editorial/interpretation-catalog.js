const { CANONICAL_EVENT_DEFINITIONS } = require("../../economic-releases/canonical-events");

const CURRENCY_MAP = {
  US: ["USD", "GOLD", "RATES", "EQUITIES"],
  UK: ["GBP", "GOLD", "RATES", "EQUITIES"],
  EZ: ["EUR", "GOLD", "RATES", "EQUITIES"],
  CA: ["CAD", "GOLD", "RATES", "EQUITIES"],
  AU: ["AUD", "GOLD", "RATES", "EQUITIES"],
  JP: ["JPY", "GOLD", "RATES", "EQUITIES"],
  CH: ["CHF", "GOLD", "RATES", "EQUITIES"],
  RU: ["RUB", "GOLD", "RATES", "EQUITIES"],
};

const HIGH_IMPORTANCE = new Set([
  "US_CPI_MOM",
  "US_CPI_YOY",
  "US_CORE_CPI_MOM",
  "US_CORE_CPI_YOY",
  "US_NFP",
  "US_ADP_EMPLOYMENT",
  "US_UNEMPLOYMENT_RATE",
  "US_FED_RATE_DECISION",
  "US_GDP_QOQ",
  "US_PCE",
  "US_INITIAL_JOBLESS_CLAIMS",
  "US_CONTINUING_JOBLESS_CLAIMS",
  "US_ISM_MANUFACTURING",
  "US_ISM_SERVICES",
  "US_SP_GLOBAL_FLASH_MANUFACTURING_PMI",
  "US_SP_GLOBAL_FLASH_SERVICES_PMI",
  "US_PHILADELPHIA_FED_MANUFACTURING",
  "UK_CPI",
  "UK_GDP",
  "UK_BOE_RATE_DECISION",
  "UK_CORE_RETAIL_SALES",
  "EZ_CPI",
  "EZ_ECB_RATE_DECISION",
  "EZ_ECB_DEPOSIT_RATE",
  "EZ_ECB_MAIN_REFINANCING_RATE",
  "EZ_CORE_CPI",
  "EZ_GDP",
  "EZ_UNEMPLOYMENT",
  "CH_CPI",
  "CH_SNB_RATE_DECISION",
  "CH_GDP",
  "RU_CPI",
  "RU_CBR_RATE_DECISION",
  "RU_GDP",
  "CA_CPI",
  "CA_BOC_RATE_DECISION",
  "AU_CPI",
  "AU_RBA_RATE_DECISION",
  "JP_CPI",
  "JP_BOJ_RATE_DECISION",
  "CN_CPI",
  "CN_GDP",
]);

function inferBetterWhen(eventKey) {
  const key = String(eventKey || "");
  if (/RATE_DECISION/.test(key)) return "RATE_POLICY";
  if (/CPI|PPI|PCE|INFLATION/.test(key)) return "CONTEXTUAL";
  if (/UNEMPLOYMENT|JOBLESS|CLAIMS/.test(key)) return "LOWER";
  if (/NFP|ADP|EMPLOYMENT_CHANGE|JOLTS|RETAIL|GDP|INDUSTRIAL|DURABLE|FACTORY|HOUSING|TRADE|CAPACITY/.test(key)) {
    return "HIGHER";
  }
  if (/PMI|ISM|EMPIRE|PHILADELPHIA|CONFIDENCE|SENTIMENT/.test(key)) return "HIGHER";
  if (/POWELL|SPEECH|STATEMENT|MINUTES|LAGARDE|MONETARY_POLICY|SNB|CBR|ECB/.test(key)) return "CONTEXTUAL";
  return "CONTEXTUAL";
}

function inferPmiThreshold(eventKey) {
  if (/PHILADELPHIA|EMPIRE/.test(eventKey)) return 0;
  if (/PMI|ISM/.test(eventKey)) return 50;
  return null;
}

function buildInterpretationMetadata(eventKey) {
  const country = eventKey.split("_")[0];
  const meta = {
    betterWhen: inferBetterWhen(eventKey),
    marketSensitivity: CURRENCY_MAP[country] || ["USD"],
    importance: HIGH_IMPORTANCE.has(eventKey) ? "HIGH" : "MEDIUM",
    visualPriority: "REQUIRED",
  };
  const threshold = inferPmiThreshold(eventKey);
  if (threshold != null) {
    meta.pmiThreshold = threshold;
  }
  if (eventKey === "US_INITIAL_JOBLESS_CLAIMS") {
    meta.childLabelAr = "طلبات الإعانة الأولية";
  }
  if (eventKey === "US_CONTINUING_JOBLESS_CLAIMS") {
    meta.childLabelAr = "طلبات الإعانة المستمرة";
  }
  return meta;
}

function buildFullInterpretationRegistry() {
  const registry = {};
  for (const eventKey of Object.keys(CANONICAL_EVENT_DEFINITIONS)) {
    registry[eventKey] = buildInterpretationMetadata(eventKey);
  }
  return registry;
}

module.exports = {
  CURRENCY_MAP,
  HIGH_IMPORTANCE,
  buildInterpretationMetadata,
  buildFullInterpretationRegistry,
};
