const { recordEditorShadowOutcome } = require("./telemetry");
const { ISSUE_CODES } = require("./reason-codes");

const RSS_EDITOR_MODE = "SHADOW";

const SHADOW_ISSUE_FIELD = {
  [ISSUE_CODES.NUMERIC_MISMATCH]: "issueNumeric",
  [ISSUE_CODES.ENTITY_MISMATCH]: "issueEntity",
  [ISSUE_CODES.ROLE_MISMATCH]: "issueRole",
  [ISSUE_CODES.ATTRIBUTION_MISMATCH]: "issueAttribution",
  [ISSUE_CODES.QUOTE_MISMATCH]: "issueQuote",
  [ISSUE_CODES.UNCERTAINTY_UPGRADED]: "issueUncertainty",
  [ISSUE_CODES.HEADLINE_BODY_MISMATCH]: "issueHeadlineBody",
  [ISSUE_CODES.LANGUAGE_INVALID]: "issueLanguage",
  [ISSUE_CODES.UNSUPPORTED_CLAIM]: "issueLowInformation",
  [ISSUE_CODES.SOURCE_EVIDENCE_INSUFFICIENT]: "issueLowInformation",
};

function classifyShadowOutcome(review = {}) {
  if (review.metadata?.timeout) {
    return { wouldApprove: false, wouldRepair: false, wouldBlock: true, timeout: true };
  }
  if (!review.ok) {
    return { wouldApprove: false, wouldRepair: false, wouldBlock: true, timeout: false };
  }
  if (review.metadata?.repaired) {
    return { wouldApprove: false, wouldRepair: true, wouldBlock: false, timeout: false };
  }
  return { wouldApprove: true, wouldRepair: false, wouldBlock: false, timeout: false };
}

function collectShadowIssues(review = {}) {
  const issues = review.metadata?.issues || [];
  const fields = {};
  for (const issue of issues) {
    const field = SHADOW_ISSUE_FIELD[issue.code];
    if (field) fields[field] = true;
  }
  return fields;
}

async function reviewExternalNewsInShadowMode(input = {}, options = {}) {
  const { reviewExternalNewsBeforePublish } = require("./index");
  const source = input.item?.sourceName || input.source || "unknown";
  const startedAt = Date.now();
  let review;
  try {
    review = await reviewExternalNewsBeforePublish(input, options);
  } catch (error) {
    recordEditorShadowOutcome(source, {
      reviewed: true,
      wouldBlock: true,
      timeout: false,
      latencyMs: Date.now() - startedAt,
      error: error.message,
    });
    return {
      mode: RSS_EDITOR_MODE,
      reviewed: true,
      wouldApprove: false,
      wouldRepair: false,
      wouldBlock: true,
      error: error.message,
    };
  }

  const shadow = classifyShadowOutcome(review);
  recordEditorShadowOutcome(source, {
    reviewed: true,
    ...shadow,
    ...collectShadowIssues(review),
    latencyMs: Date.now() - startedAt,
    reasonCode: review.reasonCode || null,
  });

  return {
    mode: RSS_EDITOR_MODE,
    reviewed: true,
    ...shadow,
    reasonCode: review.reasonCode || null,
    latencyMs: Date.now() - startedAt,
  };
}

function scheduleExternalNewsShadowReview(input = {}, options = {}) {
  const timeoutMs = Math.max(250, Number(options.shadowTimeoutMs || options.editorTimeoutMs || 10000));
  const task = Promise.race([
    reviewExternalNewsInShadowMode(input, options),
    new Promise((resolve) => {
      setTimeout(
        () =>
          resolve({
            mode: RSS_EDITOR_MODE,
            reviewed: false,
            wouldApprove: false,
            wouldRepair: false,
            wouldBlock: false,
            timeout: true,
            skipped: true,
          }),
        timeoutMs
      );
    }),
  ]).catch((error) => ({
    mode: RSS_EDITOR_MODE,
    reviewed: false,
    wouldApprove: false,
    wouldRepair: false,
    wouldBlock: false,
    error: error.message,
  }));

  return task;
}

module.exports = {
  RSS_EDITOR_MODE,
  reviewExternalNewsInShadowMode,
  scheduleExternalNewsShadowReview,
};
