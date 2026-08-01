const { createImageProviderResult } = require("./image-provider-interface");

const WIDTH = 1200;
const HEIGHT = 675;

function hashSeed(value) {
  let hash = 0;
  const text = String(value || "economic");
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildBackgroundPrompt(context = {}) {
  const eventName = context.eventName || "Macro Economic Release";
  return [
    "Abstract professional macroeconomic backdrop",
    `theme for ${eventName}`,
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

      const seed = hashSeed(`${context.eventKey}:${context.eventName}:${context.releaseTime}`);
      const hue = seed % 360;
      const svg = `
        <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="hsl(${hue}, 42%, 8%)"/>
              <stop offset="55%" stop-color="hsl(${(hue + 40) % 360}, 36%, 14%)"/>
              <stop offset="100%" stop-color="hsl(${(hue + 90) % 360}, 28%, 6%)"/>
            </linearGradient>
            <radialGradient id="glow" cx="50%" cy="35%" r="60%">
              <stop offset="0%" stop-color="rgba(255,210,120,0.18)"/>
              <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#bg)"/>
          <rect width="100%" height="100%" fill="url(#glow)"/>
          <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.18)"/>
        </svg>`;

      const backgroundBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
      return createImageProviderResult({
        backgroundBuffer,
        provider: "fallback",
        cached: false,
        prompt: buildBackgroundPrompt(context),
      });
    },
  };
}

module.exports = {
  createFallbackImageProvider,
  buildBackgroundPrompt,
  WIDTH,
  HEIGHT,
};
