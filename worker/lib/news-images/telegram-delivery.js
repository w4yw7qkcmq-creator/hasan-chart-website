const fs = require("fs");
const { buildPremiumImageContextFromCandidate } = require("./important-events");
const { generatePremiumNewsImage } = require("./index");

function cleanupTempImageFile(filePath, options = {}) {
  if (!filePath || options.keepFile) {
    return;
  }
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_error) {
    // best-effort cleanup only
  }
}

async function resolvePremiumImageForCandidate(candidate, options = {}) {
  const context = buildPremiumImageContextFromCandidate(candidate);
  if (!context) {
    return null;
  }

  const baseOptions = {
    ...options,
    forceEnabled: options.forceEnabled || undefined,
  };

  try {
    const result = await generatePremiumNewsImage(context, baseOptions);
    if (result?.filePath) {
      return { ...result, context };
    }
  } catch (primaryError) {
    if (options.provider === "fallback") {
      throw primaryError;
    }
  }

  const fallbackResult = await generatePremiumNewsImage(context, {
    ...baseOptions,
    provider: "fallback",
    forceEnabled: true,
  });

  if (!fallbackResult?.filePath) {
    return null;
  }

  return { ...fallbackResult, context, fallbackFrom: options.provider || "primary" };
}

async function deliverTelegramNewsWithOptionalPhoto({ message, candidate, sendTelegramPhoto, sendTelegramMessage, options = {} }) {
  if (!message || typeof sendTelegramMessage !== "function") {
    throw new Error("deliverTelegramNewsWithOptionalPhoto requires message and sendTelegramMessage");
  }

  let imageResult = null;
  let delivery = "text";

  if (candidate && !options.skipPremiumImage) {
    try {
      imageResult = await resolvePremiumImageForCandidate(candidate, options);
    } catch (error) {
      console.error("⚠️ Premium news image generation failed:", error.message);
    }
  }

  try {
    if (imageResult?.filePath && typeof sendTelegramPhoto === "function") {
      await sendTelegramPhoto(message, imageResult.filePath, { skipTextFallback: true });
      delivery = "photo";
    } else {
      await sendTelegramMessage(message);
      delivery = "text";
    }
  } catch (photoError) {
    console.error("⚠️ Telegram photo delivery failed, falling back to text:", photoError.message);
    await sendTelegramMessage(message);
    delivery = "text_after_photo_error";
  } finally {
    if (imageResult?.filePath) {
      cleanupTempImageFile(imageResult.filePath, options);
    }
  }

  return {
    delivery,
    premiumImage: Boolean(imageResult?.filePath),
    provider: imageResult?.provider || null,
    fallbackFrom: imageResult?.fallbackFrom || null,
    eventName: imageResult?.eventName || imageResult?.context?.eventName || null,
  };
}

module.exports = {
  cleanupTempImageFile,
  resolvePremiumImageForCandidate,
  deliverTelegramNewsWithOptionalPhoto,
};
