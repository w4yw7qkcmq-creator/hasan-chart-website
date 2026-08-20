const axios = require("axios");
const { createImageProviderResult } = require("./image-provider-interface");
const { buildOpenAIImagePrompt } = require("./openai-prompt-builder");
const { resolveOpenAIImageSettings } = require("./openai-image-settings");

function createEmptyProviderTimings() {
  return {
    providerRequestMs: 0,
    providerResponseDecodeMs: 0,
    providerAssetDownloadMs: 0,
  };
}

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
      const timings = createEmptyProviderTimings();
      const workflowStartedAt = Date.now();

      let response;
      const requestStartedAt = Date.now();
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
            timeout: settings.providerTimeoutMs,
            validateStatus: () => true,
          }
        );
      } catch (error) {
        timings.providerRequestMs = Date.now() - requestStartedAt;
        const apiMessage =
          error.response?.data?.error?.message ||
          error.response?.data?.message ||
          error.message ||
          "OpenAI image generation failed";
        const wrapped = new Error(`OpenAIImageProvider failed: ${apiMessage}`);
        wrapped.statusCode = error.response?.status || null;
        wrapped.timings = timings;
        throw wrapped;
      }

      timings.providerRequestMs = Date.now() - requestStartedAt;

      if (response.status >= 400) {
        const apiMessage =
          response.data?.error?.message || response.data?.message || `HTTP ${response.status}`;
        const wrapped = new Error(`OpenAIImageProvider failed: ${apiMessage}`);
        wrapped.statusCode = response.status;
        wrapped.timings = timings;
        throw wrapped;
      }

      const item = response.data?.data?.[0];
      let backgroundBuffer = null;

      if (item?.b64_json) {
        const decodeStartedAt = Date.now();
        backgroundBuffer = Buffer.from(item.b64_json, "base64");
        timings.providerResponseDecodeMs = Date.now() - decodeStartedAt;
      } else if (item?.url) {
        const downloadStartedAt = Date.now();
        const imageResponse = await httpClient.get(item.url, {
          responseType: "arraybuffer",
          timeout: settings.downloadTimeoutMs,
        });
        timings.providerAssetDownloadMs = Date.now() - downloadStartedAt;
        backgroundBuffer = Buffer.from(imageResponse.data);
      }

      if (!backgroundBuffer || backgroundBuffer.length === 0) {
        const wrapped = new Error("OpenAI image generation returned no image data");
        wrapped.timings = timings;
        throw wrapped;
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
        timings,
        totalProviderMs: Date.now() - workflowStartedAt,
        httpStatus: response.status,
      });
    },
  };
}

module.exports = {
  createOpenAIImageProvider,
  createEmptyProviderTimings,
  resolveOpenAIImageSettings,
};
