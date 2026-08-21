import { compensateOrphanStoragePaths } from "./storage.js";
import { TELEGRAM_CONTENT_RETENTION_LIMIT } from "./constants.js";

export async function enforceTelegramSectionRetention(supabase, section, {
  limit = TELEGRAM_CONTENT_RETENTION_LIMIT,
} = {}) {
  const { data, error } = await supabase.rpc("enforce_telegram_section_retention", {
    p_section: section,
    p_limit: limit,
  });

  if (error) {
    throw error;
  }

  const victims = Array.isArray(data) ? data : [];
  const results = [];

  for (const victim of victims) {
    const postId = victim.deleted_post_id || victim.deletedPostId;
    const storagePaths = victim.storage_paths || victim.storagePaths || [];

    const storageResult = await compensateOrphanStoragePaths(supabase, storagePaths);
    if (!storageResult.ok) {
      results.push({
        postId,
        deleted: false,
        reason: "storage_delete_failed",
        storageResult,
      });
      continue;
    }

    const { error: deleteError } = await supabase
      .from("telegram_content_posts")
      .delete()
      .eq("id", postId);

    if (deleteError) {
      results.push({
        postId,
        deleted: false,
        reason: "db_delete_failed",
        deleteError,
      });
      continue;
    }

    results.push({ postId, deleted: true, storagePaths });
  }

  return {
    victims: victims.length,
    deletedCount: results.filter((item) => item.deleted).length,
    results,
  };
}
