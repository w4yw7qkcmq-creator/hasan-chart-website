import { assertTelegramContentBotTokenConfigured } from "./webhook-verify.js";
import { TELEGRAM_CONTENT_MAX_BYTES } from "./constants.js";

const TELEGRAM_API_BASE = "https://api.telegram.org";

export async function telegramGetFile(token, fileId, { fetchImpl = fetch } = {}) {
  const url = `${TELEGRAM_API_BASE}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`;
  const response = await fetchImpl(url, { method: "GET" });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok || !payload?.result?.file_path) {
    throw Object.assign(new Error("Telegram getFile failed."), {
      status: 502,
      code: "TELEGRAM_GET_FILE_FAILED",
    });
  }

  const fileSize = Number(payload.result.file_size || 0);
  if (fileSize > TELEGRAM_CONTENT_MAX_BYTES) {
    throw Object.assign(new Error("Telegram file exceeds local size limit."), {
      status: 413,
      code: "TELEGRAM_FILE_TOO_LARGE",
      fileSize,
    });
  }

  return payload.result;
}

export async function telegramDownloadFile(token, filePath, { fetchImpl = fetch } = {}) {
  const url = `${TELEGRAM_API_BASE}/file/bot${token}/${filePath}`;
  const response = await fetchImpl(url, { method: "GET" });
  if (!response.ok) {
    throw Object.assign(new Error("Telegram file download failed."), {
      status: 502,
      code: "TELEGRAM_DOWNLOAD_FAILED",
    });
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length > TELEGRAM_CONTENT_MAX_BYTES) {
    throw Object.assign(new Error("Downloaded Telegram file exceeds local size limit."), {
      status: 413,
      code: "TELEGRAM_DOWNLOAD_TOO_LARGE",
    });
  }

  return buffer;
}

export async function downloadTelegramPhotoBuffer(fileId, { env = process.env, fetchImpl = fetch } = {}) {
  const token = assertTelegramContentBotTokenConfigured(env);
  const fileMeta = await telegramGetFile(token, fileId, { fetchImpl });
  return telegramDownloadFile(token, fileMeta.file_path, { fetchImpl });
}
