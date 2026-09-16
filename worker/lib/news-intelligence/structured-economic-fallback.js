const {
  assertStrictNumericEconomicField,
  validateStructuredNumericFacts,
} = require("../economic-releases/text-normalization");

const STRUCTURED_ECONOMIC_FALLBACK = "STRUCTURED_ECONOMIC_FALLBACK";
const FALLBACK_CANONICAL_STATUS = "UNMAPPED";

function hasValidStrictEconomicTriple(facts = {}) {
  if (facts.isStructuredTriple !== true) {
    return false;
  }
  const previous = facts.previous;
  const forecast = facts.forecast;
  const actual = facts.actual;
  if (!previous || !forecast || !actual) {
    return false;
  }
  if (facts.numericFieldValidation && facts.numericFieldValidation.ok === false) {
    return false;
  }
  for (const [field, value] of [
    ["previous", previous],
    ["forecast", forecast],
    ["actual", actual],
  ]) {
    const check = assertStrictNumericEconomicField(value, field, {});
    if (!check.ok) {
      return false;
    }
  }
  const structuredCheck = validateStructuredNumericFacts(
    {
      previous,
      forecast,
      actual,
      isStructuredTriple: true,
    },
    {}
  );
  return structuredCheck.ok === true;
}

function resolveStructuredFallbackDisplayTitle(facts = {}, candidate = {}) {
  const fromFacts =
    facts.canonicalDisplayName ||
    facts.sourceEventName ||
    facts.title ||
    candidate.resolvedTitle ||
    null;
  if (!fromFacts) {
    return null;
  }
  return String(fromFacts)
    .split("\n")[0]
    .trim()
    .slice(0, 120);
}

function isStructuredEconomicFallbackEventType(eventType) {
  return eventType === STRUCTURED_ECONOMIC_FALLBACK;
}

module.exports = {
  STRUCTURED_ECONOMIC_FALLBACK,
  FALLBACK_CANONICAL_STATUS,
  hasValidStrictEconomicTriple,
  resolveStructuredFallbackDisplayTitle,
  isStructuredEconomicFallbackEventType,
};
