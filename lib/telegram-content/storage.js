import { TELEGRAM_CONTENT_BUCKET } from "./constants.js";
import { buildTelegramContentStoragePath } from "./storage-path.js";

export async function uploadTelegramContentImage(supabase, {
  section,
  postId,
  sortOrder,
  extension,
  buffer,
  contentType,
}) {
  const objectPath = buildTelegramContentStoragePath({
    section,
    postId,
    sortOrder,
    extension,
  });

  const { error } = await supabase.storage.from(TELEGRAM_CONTENT_BUCKET).upload(objectPath, buffer, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw Object.assign(new Error("Failed to upload Telegram content image."), {
      status: 502,
      code: "STORAGE_UPLOAD_FAILED",
      cause: error,
      objectPath,
    });
  }

  return objectPath;
}

export async function removeTelegramContentStoragePaths(supabase, paths = []) {
  const normalized = [...new Set((paths || []).map((item) => String(item || "").trim()).filter(Boolean))];
  if (!normalized.length) {
    return { removed: [], errors: [] };
  }

  const { data, error } = await supabase.storage.from(TELEGRAM_CONTENT_BUCKET).remove(normalized);
  if (error) {
    return {
      removed: [],
      errors: [{ message: error.message || "storage remove failed", paths: normalized }],
    };
  }

  return {
    removed: data?.map((item) => item.name) || normalized,
    errors: [],
  };
}

export async function compensateOrphanStoragePaths(supabase, paths = []) {
  const result = await removeTelegramContentStoragePaths(supabase, paths);
  return {
    ok: result.errors.length === 0,
    ...result,
  };
}
