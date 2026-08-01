const { createFallbackImageProvider } = require("./fallback-image-provider");
const { createOpenAIImageProvider } = require("./openai-image-provider");
const { createGeminiImageProvider } = require("./gemini-image-provider");
const { assertImageProvider } = require("./image-provider-interface");

function resolveImageProviderName(options = {}) {
  return String(options.provider || process.env.NEWS_IMAGE_PROVIDER || "fallback").trim().toLowerCase();
}

function createNewsImageProviderRegistry(options = {}) {
  const providers = {
    fallback: createFallbackImageProvider(options),
    openai: createOpenAIImageProvider(options),
    gemini: createGeminiImageProvider(options),
    ...(options.providers || {}),
  };

  function getProvider(name = resolveImageProviderName(options)) {
    const provider = providers[name] || providers.fallback;
    assertImageProvider(provider, `NewsImageProvider(${name})`);
    return provider;
  }

  return {
    getProvider,
    providers,
    resolveProviderName: resolveImageProviderName,
  };
}

module.exports = {
  createNewsImageProviderRegistry,
  resolveImageProviderName,
};
