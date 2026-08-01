const axios = require("axios");
const { createImageProviderResult } = require("./image-provider-interface");
const { buildBackgroundPrompt } = require("./fallback-image-provider");

function createOpenAIImageProvider(options = {}) {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  const model = options.model || process.env.NEWS_IMAGE_OPENAI_MODEL || "gpt-image-1";
  const httpClient = options.httpClient || axios;

  return {
    name: "openai",

    async generateBackground(context = {}) {
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is required for OpenAIImageProvider");
      }

      const prompt = [
        buildBackgroundPrompt(context),
        "ultra professional global news agency backdrop",
        "high contrast",
        "editorial macro finance mood",
        "leave clean negative space for headline overlay",
      ].join(". ");

      const response = await httpClient.post(
        "https://api.openai.com/v1/images/generations",
        {
          model,
          prompt,
          size: "1536x1024",
          quality: "medium",
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: options.timeoutMs || 60000,
        }
      );

      const item = response.data?.data?.[0];
      let backgroundBuffer = null;

      if (item?.b64_json) {
        backgroundBuffer = Buffer.from(item.b64_json, "base64");
      } else if (item?.url) {
        const imageResponse = await httpClient.get(item.url, {
          responseType: "arraybuffer",
          timeout: options.timeoutMs || 30000,
        });
        backgroundBuffer = Buffer.from(imageResponse.data);
      }

      if (!backgroundBuffer) {
        throw new Error("OpenAI image generation returned no image data");
      }

      return createImageProviderResult({
        backgroundBuffer,
        provider: "openai",
        cached: false,
        prompt,
      });
    },
  };
}

module.exports = {
  createOpenAIImageProvider,
};
