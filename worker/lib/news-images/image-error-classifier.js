function classifyImageError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  const status = Number(error?.response?.status || error?.statusCode || 0);

  if (
    status === 401 ||
    status === 403 ||
    /authentication|unauthorized|invalid api key|incorrect api key/.test(message)
  ) {
    return { transient: false, reason: "AI_PROVIDER_ERROR", retryable: false };
  }

  if (
    status === 400 ||
    /invalid request|invalid prompt|unsupported model|content policy|content_policy|safety system/.test(
      message
    )
  ) {
    return { transient: false, reason: "AI_PROVIDER_ERROR", retryable: false };
  }

  if (/timeout|timed out|etimedout/.test(message)) {
    return { transient: true, reason: "AI_TIMEOUT", retryable: true };
  }

  if (status === 429 || /rate limit|too many requests/.test(message)) {
    return { transient: true, reason: "AI_PROVIDER_ERROR", retryable: true };
  }

  if (status >= 500 || /5\d\d|service unavailable|temporarily unavailable|econnreset|network/.test(message)) {
    return { transient: true, reason: "AI_PROVIDER_ERROR", retryable: true };
  }

  if (/typography|text_unsafe|output rejected|openai_background_text_unsafe/.test(message)) {
    return { transient: false, reason: "AI_OUTPUT_REJECTED", retryable: false };
  }

  return { transient: false, reason: "AI_PROVIDER_ERROR", retryable: false };
}

function isTransientImageError(error) {
  return classifyImageError(error).retryable;
}

module.exports = {
  classifyImageError,
  isTransientImageError,
};
