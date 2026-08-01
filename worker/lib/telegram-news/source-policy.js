const { resolveCanonicalForTelegram } = require("./extractor");
const { isStructuredTripleReleaseTitle } = require("../economic-releases/canonical-events");

const PLAIN_FED_EVENT_KEYS = new Set(["US_POWELL_SPEECH", "US_FED_STATEMENT"]);

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

  if (facts.canonicalEventKey === "US_FED_RATE_DECISION") {
    return facts.isStructuredTriple;
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
