const { createImageProviderResult } = require("./image-provider-interface");
const {
  buildFallbackBackgroundSvg,
  buildReleaseSeed,
  resolveVisualCategory,
  WIDTH,
  HEIGHT,
} = require("./fallback-visual-themes");

function buildBackgroundPrompt(context = {}) {
  const category = resolveVisualCategory(context.eventKey);
  return [
    "Abstract professional macroeconomic backdrop",
    `visual family ${category}`,
    "dark cinematic lighting",
    "minimal composition",
    "no text",
    "no logos",
    "no numbers",
    "no people faces",
  ].join(", ");
}

function createFallbackImageProvider() {
  return {
    name: "fallback",

    async generateBackground(context = {}) {
      let sharp;
      try {
        sharp = require("sharp");
      } catch (_error) {
        throw new Error("sharp is required for FallbackImageProvider");
      }

      const themed = buildFallbackBackgroundSvg(context);
      const backgroundBuffer = await sharp(Buffer.from(themed.svg)).png().toBuffer();

      return createImageProviderResult({
        backgroundBuffer,
        provider: "fallback",
        cached: false,
        prompt: buildBackgroundPrompt(context),
        seed: themed.seed,
        seedSource: themed.seedSource,
        visualCategory: themed.visualCategory,
        gradientMode: themed.gradientMode,
      });
    },
  };
}

module.exports = {
  createFallbackImageProvider,
  buildBackgroundPrompt,
  buildReleaseSeed,
  resolveVisualCategory,
  WIDTH,
  HEIGHT,
};
