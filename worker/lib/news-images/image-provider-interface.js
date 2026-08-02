function createImageProviderResult({ backgroundBuffer, provider, cached = false, prompt = null, ...meta }) {
  if (!backgroundBuffer || !Buffer.isBuffer(backgroundBuffer)) {
    throw new Error("ImageProvider must return a background Buffer");
  }

  return {
    backgroundBuffer,
    provider: provider || "unknown",
    cached,
    prompt: prompt || null,
    ...meta,
  };
}

function assertImageProvider(provider, label = "ImageProvider") {
  if (!provider || typeof provider.generateBackground !== "function") {
    throw new Error(`${label} must implement generateBackground(context)`);
  }
  if (typeof provider.name !== "string") {
    throw new Error(`${label} must expose a string name`);
  }
}

module.exports = {
  createImageProviderResult,
  assertImageProvider,
};
