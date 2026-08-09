const { CONFIDENCE_POLICY } = require("./config");
const { REASON_CODES } = require("./reason-taxonomy");

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function computeConfidence(input = {}) {
  const dimensions = {
    eventIdentityConfidence: clamp(input.eventIdentityConfidence ?? 95),
    factExtractionConfidence: clamp(input.factExtractionConfidence ?? 95),
    editorialConfidence: clamp(input.editorialConfidence ?? 90),
    imageConfidence: clamp(input.imageConfidence ?? 85),
    sourceHealthConfidence: clamp(input.sourceHealthConfidence ?? 90),
    duplicateConfidence: clamp(input.duplicateConfidence ?? 95),
  };

  const weights = [0.2, 0.25, 0.15, 0.1, 0.15, 0.15];
  const values = Object.values(dimensions);
  const overallConfidence = clamp(
    values.reduce((sum, value, idx) => sum + value * weights[idx], 0)
  );

  return { ...dimensions, overallConfidence };
}

function evaluateConfidencePolicy(confidence = {}, context = {}) {
  const policy = { ...CONFIDENCE_POLICY, ...(context.policy || {}) };
  const hardBlock = context.hardBlockReason || null;

  if (hardBlock) {
    return {
      allowed: false,
      band: "HARD_BLOCK",
      reasonCode: hardBlock,
      overallConfidence: confidence.overallConfidence,
    };
  }

  if (context.structuredEconomic && confidence.factExtractionConfidence < policy.structuredEconomicMin) {
    return {
      allowed: false,
      band: "FACT_CONFIDENCE_LOW",
      reasonCode: REASON_CODES.PARSER_CONFIDENCE_LOW,
      overallConfidence: confidence.overallConfidence,
    };
  }

  if (confidence.overallConfidence >= policy.autoApproveMin) {
    return { allowed: true, band: "AUTO_APPROVED", overallConfidence: confidence.overallConfidence };
  }

  if (confidence.overallConfidence >= policy.degradedMin) {
    if (context.structuredEconomic && confidence.factExtractionConfidence >= policy.structuredEconomicMin) {
      return { allowed: true, band: "DEGRADED_CONFIDENCE", overallConfidence: confidence.overallConfidence };
    }
    return {
      allowed: false,
      band: "DEGRADED_BLOCKED",
      reasonCode: REASON_CODES.CONFIDENCE_BLOCKED,
      overallConfidence: confidence.overallConfidence,
    };
  }

  return {
    allowed: false,
    band: "BLOCKED",
    reasonCode: REASON_CODES.CONFIDENCE_BLOCKED,
    overallConfidence: confidence.overallConfidence,
  };
}

module.exports = {
  computeConfidence,
  evaluateConfidencePolicy,
};
