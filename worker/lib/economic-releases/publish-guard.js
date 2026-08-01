const { containsForbiddenPlaceholder } = require("./normalize");

function canPublishStructuredRelease(validation, message) {
  if (!validation?.complete) {
    return {
      allowed: false,
      reason: validation?.reason || "structured_data_incomplete",
      missingFields: validation?.missingFields || [],
    };
  }

  if (!message || typeof message !== "string" || !message.trim()) {
    return {
      allowed: false,
      reason: "empty_message",
      missingFields: validation?.missingFields || [],
    };
  }

  if (containsForbiddenPlaceholder(message)) {
    return {
      allowed: false,
      reason: "forbidden_placeholder_in_message",
      missingFields: [],
    };
  }

  return {
    allowed: true,
    reason: "complete",
    missingFields: [],
  };
}

function logEconomicReleaseDroppedIncomplete(entry, validation) {
  console.log(
    "ECONOMIC_RELEASE_DROPPED_INCOMPLETE",
    JSON.stringify({
      idempotencyKey: entry?.idempotencyKey || null,
      eventKey: entry?.canonical?.eventKey || null,
      title: entry?.title || null,
      attempt: entry?.attempt ?? null,
      missingFields: validation?.missingFields || entry?.validation?.missingFields || [],
      reason: validation?.reason || entry?.validation?.reason || "structured_data_incomplete",
    })
  );
}

module.exports = {
  canPublishStructuredRelease,
  logEconomicReleaseDroppedIncomplete,
};
