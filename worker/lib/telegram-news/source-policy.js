const { resolveCanonicalForTelegram } = require("./extractor");
const { isStructuredTripleReleaseTitle } = require("../economic-releases/canonical-events");

const PLAIN_FED_EVENT_KEYS = new Set(["US_POWELL_SPEECH", "US_FED_STATEMENT"]);

const RATE_DECISION_EVENT_KEYS = new Set([
  "US_FED_RATE_DECISION",
  "UK_BOE_RATE_DECISION",
  "EZ_ECB_RATE_DECISION",
  "EZ_ECB_DEPOSIT_RATE",
  "EZ_ECB_MAIN_REFINANCING_RATE",
  "CA_BOC_RATE_DECISION",
  "AU_RBA_RATE_DECISION",
  "JP_BOJ_RATE_DECISION",
  "CH_SNB_RATE_DECISION",
  "RU_CBR_RATE_DECISION",
]);

const EXTRA_OFFICIAL_PATTERNS = [/beige book/i, /\badp\b(?:\s+nonfarm|\s+employment|\s+payroll)?/i];

function isFedWatchOrProbabilityPricing(text) {
  return /fedwatch|fed watch|probability|probabilities|احتمال|تسعير/i.test(String(text || ""));
}

function isFedStatementText(text) {
  return /fomc statement|fed statement|بيان الفيدرالي/i.test(String(text || ""));
}

function matchesExtraOfficialRelease(text) {
  return EXTRA_OFFICIAL_PATTERNS.some((pattern) => pattern.test(String(text || "")));
}

function isOfficialHighImpactTelegramPost(classification = {}) {
  const facts = classification.facts;
  if (!facts) {
    return false;
  }

  const text = `${facts.title || ""} ${classification.cleanedText || ""}`;

  if (isFedWatchOrProbabilityPricing(text)) {
    return false;
  }

  if (facts.isPlainFedNews && facts.canonicalEventKey && PLAIN_FED_EVENT_KEYS.has(facts.canonicalEventKey)) {
    return true;
  }

  if (isFedStatementText(text)) {
    return true;
  }

  if (facts.canonicalEventKey && RATE_DECISION_EVENT_KEYS.has(facts.canonicalEventKey)) {
    return facts.isStructuredTriple || Boolean(facts.actual);
  }

  if (facts.isStructuredTriple) {
    return true;
  }

  if (classification.classification === "pre_event_alert" && classification.preEvent?.eventName) {
    const eventName = classification.preEvent.eventName;
    const canonical = resolveCanonicalForTelegram(eventName);
    return Boolean(canonical.eventKey) || isStructuredTripleReleaseTitle(eventName);
  }

  return false;
}

module.exports = {
  isOfficialHighImpactTelegramPost,
};
