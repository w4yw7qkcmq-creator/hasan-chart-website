import { requireAdminPermission } from "../../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../../lib/iam/constants";
import { enforceRateLimit } from "../../../../../../lib/enforce-rate-limit";
import { adminMutationLimiter } from "../../../../../../lib/rate-limit";
import { completeContentPostImageUpload } from "../../../../../../lib/content-posts-admin";
import { parseContentImageObjectPath } from "../../../../../../lib/content-image-storage";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.CONTENT_MANAGE, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const rateLimited = await enforceRateLimit(
      adminMutationLimiter,
      String(adminCheck.user?.email || "admin").toLowerCase()
    );
    if (rateLimited) return rateLimited;

    const body = await request.json().catch(() => ({}));
    const postId = String(body?.post_id || "").trim();
    const objectPath = String(body?.object_path || "").trim();
    const mimeType = String(body?.mime_type || "").trim().toLowerCase() || null;

    if (!postId || !objectPath) {
      return Response.json({ success: false, error: "معرف المنشور ومسار الصورة مطلوبان" }, { status: 400 });
    }

    const parsed = parseContentImageObjectPath(objectPath);
    if (!parsed || parsed.postId !== postId) {
      return Response.json({ success: false, error: "مسار الصورة غير صالح" }, { status: 400 });
    }

    const post = await completeContentPostImageUpload(adminCheck.supabase, {
      postId,
      objectPath,
      mimeType,
      adminUserId: adminCheck.user?.id,
      adminEmail: adminCheck.user?.email,
    });

    return Response.json({ success: true, post });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "تعذر إتمام رفع الصورة" },
      { status: error?.status || 500 }
    );
  }
}
