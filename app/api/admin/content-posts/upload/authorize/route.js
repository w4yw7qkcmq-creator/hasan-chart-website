import { requireAdminPermission } from "../../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../../lib/iam/constants";
import { normalizeContentType } from "../../../../../../lib/content-post-validation";
import { getAdminContentPostById } from "../../../../../../lib/content-posts-admin";
import {
  buildContentImageObjectPath,
  createContentImageSignedUploadUrl,
  generateContentImageNonce,
} from "../../../../../../lib/content-image-storage";
import { validateAllowedImageMimeType } from "../../../../../../lib/upload-validation";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.CONTENT_MANAGE, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = await request.json().catch(() => ({}));
    const postId = String(body?.post_id || "").trim();
    const mimeType = String(body?.mime_type || "").trim().toLowerCase();
    const contentType = normalizeContentType(body?.content_type);

    if (!postId || !contentType) {
      return Response.json({ success: false, error: "معرف المنشور ونوع المحتوى مطلوبان" }, { status: 400 });
    }

    if (!validateAllowedImageMimeType(mimeType)) {
      return Response.json({ success: false, error: "نوع الملف غير مدعوم" }, { status: 400 });
    }

    const post = await getAdminContentPostById(adminCheck.supabase, postId);
    if (post.content_type !== contentType) {
      return Response.json({ success: false, error: "نوع المحتوى لا يطابق المنشور" }, { status: 400 });
    }

    const nonce = generateContentImageNonce();
    const objectPath = buildContentImageObjectPath({
      contentType,
      postId,
      nonce,
      mimeType,
    });

    const signed = await createContentImageSignedUploadUrl(adminCheck.supabase, objectPath);

    return Response.json({
      success: true,
      upload: {
        ...signed,
        objectPath,
        bucket: "content-images",
      },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "تعذر تجهيز رفع الصورة" },
      { status: error?.status || 500 }
    );
  }
}
