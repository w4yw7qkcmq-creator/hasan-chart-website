const EDITORIAL_CHAT_MODEL = "gpt-5.6-luna";
const EDITORIAL_REASONING_EFFORT = "none";

const OPENAI_FAILURE_REASONS = Object.freeze({
  AUTH: "OPENAI_AUTH_ERROR",
  MODEL_UNAVAILABLE: "OPENAI_MODEL_UNAVAILABLE",
  QUOTA: "OPENAI_QUOTA_ERROR",
  RATE_LIMIT: "OPENAI_RATE_LIMIT",
  TIMEOUT: "OPENAI_TIMEOUT",
  RESPONSE_INVALID: "OPENAI_RESPONSE_INVALID",
});

const OPENAI_FAILURE_REASON_SET = new Set(Object.values(OPENAI_FAILURE_REASONS));
const TRANSPORT_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "ECONNREFUSED",
]);

function editorialChatRequestFields(model = EDITORIAL_CHAT_MODEL) {
  return {
    model,
    reasoning_effort: EDITORIAL_REASONING_EFFORT,
  };
}

function isOpenAiFailureReason(reason) {
  return OPENAI_FAILURE_REASON_SET.has(reason);
}

function classifyOpenAiChatFailure(error = {}) {
  const status = Number(error.response?.status) || null;
  const apiError = error.response?.data?.error || {};
  const apiCode = String(apiError.code || "");
  const message = String(apiError.message || "");
  const transportCode = String(error.code || "");
  const transportMessage = String(error.message || "");

  if (transportCode === "ECONNABORTED" || transportCode === "ETIMEDOUT" || /timeout/i.test(transportMessage)) {
    return OPENAI_FAILURE_REASONS.TIMEOUT;
  }

  if (
    apiCode === "model_not_found"
    || status === 404
    || /has been deprecated/i.test(message)
    || /model .+ does not exist/i.test(message)
  ) {
    return OPENAI_FAILURE_REASONS.MODEL_UNAVAILABLE;
  }

  if (
    apiCode === "insufficient_quota"
    || /insufficient_quota|billing_hard_limit|exceeded your current quota/i.test(`${apiCode} ${message}`)
  ) {
    return OPENAI_FAILURE_REASONS.QUOTA;
  }

  if (status === 429 || apiCode === "rate_limit_exceeded") {
    return OPENAI_FAILURE_REASONS.RATE_LIMIT;
  }

  if (status === 401 || status === 403 || apiCode === "invalid_api_key") {
    return OPENAI_FAILURE_REASONS.AUTH;
  }

  if (status || error.response || error.isAxiosError || TRANSPORT_ERROR_CODES.has(transportCode)) {
    return OPENAI_FAILURE_REASONS.RESPONSE_INVALID;
  }

  return null;
}

function logOpenAiChatFailure(reason, error = {}) {
  const apiError = error.response?.data?.error || {};
  console.error("AI_EDITORIAL_FAILED", JSON.stringify({
    reason,
    status: error.response?.status || null,
    type: apiError.type || null,
    code: apiError.code || (TRANSPORT_ERROR_CODES.has(String(error.code || "")) ? error.code : null),
  }));
}

module.exports = {
  EDITORIAL_CHAT_MODEL,
  EDITORIAL_REASONING_EFFORT,
  OPENAI_FAILURE_REASONS,
  editorialChatRequestFields,
  isOpenAiFailureReason,
  classifyOpenAiChatFailure,
  logOpenAiChatFailure,
};
