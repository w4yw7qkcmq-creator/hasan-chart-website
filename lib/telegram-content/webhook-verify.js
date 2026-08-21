import crypto from "node:crypto";

export function timingSafeSecretEqual(provided, expected) {
  const providedRaw = String(provided || "");
  const expectedRaw = String(expected || "");
  if (!providedRaw || !expectedRaw) return false;

  const providedBuffer = Buffer.from(providedRaw);
  const expectedBuffer = Buffer.from(expectedRaw);
  if (providedBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

export function verifyTelegramContentWebhookSecret(request, env = process.env) {
  const configured = String(env.TELEGRAM_CONTENT_WEBHOOK_SECRET || "").trim();
  if (!configured) {
    return {
      ok: false,
      status: 503,
      error: "Telegram content webhook secret is not configured.",
    };
  }

  const provided = String(request.headers.get("x-telegram-bot-api-secret-token") || "").trim();
  if (!timingSafeSecretEqual(provided, configured)) {
    return { ok: false, status: 401, error: "Invalid webhook secret." };
  }

  return { ok: true };
}

export function getTelegramContentBotToken(env = process.env) {
  return String(env.TELEGRAM_CONTENT_BOT_TOKEN || "").trim();
}

export function assertTelegramContentBotTokenConfigured(env = process.env) {
  const token = getTelegramContentBotToken(env);
  if (!token) {
    throw Object.assign(new Error("Telegram content bot token is not configured."), {
      status: 503,
      code: "TELEGRAM_CONTENT_BOT_TOKEN_MISSING",
    });
  }
  return token;
}
