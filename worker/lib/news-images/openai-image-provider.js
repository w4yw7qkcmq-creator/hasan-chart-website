const axios = require("axios");
const { createImageProviderResult } = require("./image-provider-interface");
const { buildOpenAIImagePrompt } = require("./openai-prompt-builder");
const { resolveOpenAIImageSettings } = require("./openai-image-settings");

function createOpenAIImageProvider(options = {}) {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  const httpClient = options.httpClient || axios;
  const settings = resolveOpenAIImageSettings(options);

  return {
    name: "openai",
    settings,

    async generateBackground(context = {}) {
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is required for OpenAIImageProvider");
      }

      const promptBundle = buildOpenAIImagePrompt(context);
      const prompt = promptBundle.prompt;

      let response;
      try {
        response = await httpClient.post(
          "https://api.openai.com/v1/images/generations",
          {
            model: settings.model,
            prompt,
            size: settings.size,
            quality: settings.quality,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            timeout: settings.timeoutMs,
          }
        );
      } catch (error) {
        const apiMessage =
          error.response?.data?.error?.message ||
          error.response?.data?.message ||
          error.message ||
          "OpenAI image generation failed";
        throw new Error(`OpenAIImageProvider failed: ${apiMessage}`);
      }

      const item = response.data?.data?.[0];
      let backgroundBuffer = null;

      if (item?.b64_json) {
        backgroundBuffer = Buffer.from(item.b64_json, "base64");
      } else if (item?.url) {
        const imageResponse = await httpClient.get(item.url, {
          responseType: "arraybuffer",
          timeout: Math.min(settings.timeoutMs, 45000),
        });
        backgroundBuffer = Buffer.from(imageResponse.data);
      }

      if (!backgroundBuffer || backgroundBuffer.length === 0) {
        throw new Error("OpenAI image generation returned no image data");
      }

      return createImageProviderResult({
        backgroundBuffer,
        provider: "openai",
        cached: false,
        prompt,
        visualCategory: promptBundle.visualCategory,
        seed: promptBundle.seed,
        seedSource: promptBundle.releaseSeed,
        displayTitle: promptBundle.displayTitle,
        overlayPlacement: promptBundle.overlayPlacement,
        titlePlacement: promptBundle.titlePlacement,
        model: settings.model,
        size: settings.size,
        quality: settings.quality,
      });
    },
  };
}

module.exports = {
  createOpenAIImageProvider,
  resolveOpenAIImageSettings,
};
