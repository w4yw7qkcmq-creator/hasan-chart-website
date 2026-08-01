const { formatDisplayValue } = require("./normalize");

function getRequiredFieldsForEvent(canonical) {
  if (!canonical?.requiresTripleTemplate) {
    return [];
  }

  return ["previousOrRevised", "forecast", "actual"];
}

function hasPreviousOrRevised(event) {
  const previous = formatDisplayValue(event?.previous);
  const revised = formatDisplayValue(event?.revisedPrevious);
  return previous != null || revised != null;
}

function validateEconomicReleaseCompleteness(event, canonical = {}) {
  const requiredFields = getRequiredFieldsForEvent(canonical);
  const missingFields = [];

  if (!canonical.requiresTripleTemplate) {
    return {
      complete: true,
      missingFields: [],
      requiredFields: [],
      eventType: canonical.eventType || "plain_news",
      reason: "plain_news_event",
    };
  }

  for (const fieldName of requiredFields) {
    if (fieldName === "previousOrRevised") {
      if (!hasPreviousOrRevised(event)) {
        missingFields.push("previous");
      }
      continue;
    }

    const field = event?.[fieldName];
    const display = formatDisplayValue(field);
    if (display == null) {
      missingFields.push(fieldName);
    }
  }

  if (event?.sourceAgreement === false) {
    return {
      complete: false,
      missingFields,
      requiredFields,
      eventType: canonical.eventType || "structured_release",
      reason: "source_conflict",
    };
  }

  return {
    complete: missingFields.length === 0,
    missingFields,
    requiredFields,
    eventType: canonical.eventType || "structured_release",
    reason: missingFields.length ? "structured_data_incomplete" : "complete",
  };
}

module.exports = {
  getRequiredFieldsForEvent,
  hasPreviousOrRevised,
  validateEconomicReleaseCompleteness,
};
