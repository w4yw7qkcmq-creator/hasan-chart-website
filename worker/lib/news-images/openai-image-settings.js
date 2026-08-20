function resolveOpenAIImageSettings(options = {}) {
  const env = process.env;
  const model = options.model || env.NEWS_IMAGE_OPENAI_MODEL || "gpt-image-1";
  const size = options.size || env.NEWS_IMAGE_OPENAI_SIZE || "1536x1024";
  const quality = options.quality || env.NEWS_IMAGE_OPENAI_QUALITY || "low";
  const providerTimeoutMs = Number(
    options.providerTimeoutMs ||
      options.timeoutMs ||
      env.NEWS_IMAGE_OPENAI_PROVIDER_TIMEOUT_MS ||
      env.NEWS_IMAGE_OPENAI_TIMEOUT_MS ||
      28000
  );
  const downloadTimeoutMs = Number(
    options.downloadTimeoutMs || env.NEWS_IMAGE_OPENAI_DOWNLOAD_TIMEOUT_MS || 15000
  );
  const workflowBudgetMs = Number(options.workflowBudgetMs || env.NEWS_IMAGE_WORKFLOW_BUDGET_MS || 45000);

  return {
    model,
    size,
    quality,
    providerTimeoutMs:
      Number.isFinite(providerTimeoutMs) && providerTimeoutMs > 0 ? providerTimeoutMs : 28000,
    downloadTimeoutMs:
      Number.isFinite(downloadTimeoutMs) && downloadTimeoutMs > 0 ? downloadTimeoutMs : 15000,
    workflowBudgetMs:
      Number.isFinite(workflowBudgetMs) && workflowBudgetMs > 0 ? workflowBudgetMs : 45000,
    // Backward-compatible alias used by axios timeout on generation POST.
    timeoutMs:
      Number.isFinite(providerTimeoutMs) && providerTimeoutMs > 0 ? providerTimeoutMs : 28000,
  };
}

module.exports = {
  resolveOpenAIImageSettings,
};
