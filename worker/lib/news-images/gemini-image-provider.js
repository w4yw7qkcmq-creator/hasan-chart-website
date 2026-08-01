const { createImageProviderResult } = require("./image-provider-interface");

function createGeminiImageProvider(_options = {}) {
  return {
    name: "gemini",

    async generateBackground(_context = {}) {
      throw new Error("GeminiImageProvider is not configured yet");
    },
  };
}

module.exports = {
  createGeminiImageProvider,
};
