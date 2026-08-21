import { TELEGRAM_CONTENT_SECTIONS } from "./constants.js";

const PATH_SEGMENT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildTelegramContentStoragePath({ section, postId, sortOrder, extension }) {
  const normalizedSection = String(section || "").trim();
  const normalizedPostId = String(postId || "").trim();
  const normalizedSortOrder = Number(sortOrder);
  const ext = String(extension || "").trim().toLowerCase();

  if (!TELEGRAM_CONTENT_SECTIONS.includes(normalizedSection)) {
    throw Object.assign(new Error("Invalid section for storage path."), { status: 400 });
  }
  if (!PATH_SEGMENT_UUID.test(normalizedPostId)) {
    throw Object.assign(new Error("Invalid post id for storage path."), { status: 400 });
  }
  if (!Number.isInteger(normalizedSortOrder) || normalizedSortOrder < 0) {
    throw Object.assign(new Error("Invalid sort order for storage path."), { status: 400 });
  }
  if (!["jpg", "png", "webp"].includes(ext)) {
    throw Object.assign(new Error("Invalid image extension for storage path."), { status: 400 });
  }

  return `${normalizedSection}/${normalizedPostId}/${normalizedSortOrder}.${ext}`;
}

export function parseTelegramContentStoragePath(objectPath) {
  const normalized = String(objectPath || "").trim();
  const match = normalized.match(
    /^(daily_analysis|academy|result)\/([0-9a-f-]{36})\/(\d+)\.(jpg|png|webp)$/i
  );
  if (!match) return null;

  return {
    section: match[1],
    postId: match[2],
    sortOrder: Number(match[3]),
    extension: match[4].toLowerCase(),
  };
}
