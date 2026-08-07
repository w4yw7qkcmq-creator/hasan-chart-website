import { recordAdminAction } from "./admin-audit-log.js";

export async function logContentPostAudit(
  supabase,
  {
    adminUserId,
    adminEmail,
    action,
    postId,
    contentType,
    title,
    statusBefore = null,
    statusAfter = null,
  }
) {
  return recordAdminAction(supabase, {
    adminId: adminUserId,
    adminEmail,
    action,
    targetTable: "content_posts",
    targetId: postId,
    details: {
      content_type: contentType || null,
      post_id: postId || null,
      title: title ? String(title).slice(0, 200) : null,
      status_before: statusBefore,
      status_after: statusAfter,
    },
  });
}
