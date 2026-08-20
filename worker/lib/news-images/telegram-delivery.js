const fs = require("fs");
const { createEmptyImageTelemetry } = require("./image-telemetry");

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

async function deliverTelegramNewsWithOptionalPhoto({
  message,
  candidate,
  sendTelegramPhoto,
  sendTelegramMessage,
  imageResult = null,
  options = {},
}) {
  if (!message || typeof sendTelegramMessage !== "function") {
    throw new Error("deliverTelegramNewsWithOptionalPhoto requires message and sendTelegramMessage");
  }

  if (options.skipPremiumImage !== true && candidate && !imageResult) {
    throw new Error("deliverTelegramNewsWithOptionalPhoto requires pre-resolved imageResult; inline generation is disabled");
  }

  const resolvedImageResult = imageResult || null;
  let delivery = "text";

  try {
    if (resolvedImageResult?.filePath && typeof sendTelegramPhoto === "function") {
      await sendTelegramPhoto(message, resolvedImageResult.filePath, { skipTextFallback: true });
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
    if (resolvedImageResult?.filePath) {
      cleanupTempImageFile(resolvedImageResult.filePath, options);
    }
  }

  return {
    delivery,
    premiumImage: Boolean(resolvedImageResult?.filePath),
    provider: resolvedImageResult?.provider || null,
    fallbackFrom: resolvedImageResult?.fallbackFrom || null,
    eventName: candidate?.facts?.title || null,
    telemetry: options.telemetry || createEmptyImageTelemetry(),
  };
}

module.exports = {
  cleanupTempImageFile,
  deliverTelegramNewsWithOptionalPhoto,
};
