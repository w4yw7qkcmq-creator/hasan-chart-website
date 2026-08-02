function resolveOpenAIImageSettings(options = {}) {
  const env = process.env;
  const model = options.model || env.NEWS_IMAGE_OPENAI_MODEL || "gpt-image-1";
  const size = options.size || env.NEWS_IMAGE_OPENAI_SIZE || "1536x1024";
  const quality = options.quality || env.NEWS_IMAGE_OPENAI_QUALITY || "low";
  const timeoutMs = Number(options.timeoutMs || env.NEWS_IMAGE_OPENAI_TIMEOUT_MS || 90000);

  return {
    model,
    size,
    quality,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 90000,
  };
}

module.exports = {
  resolveOpenAIImageSettings,
};
