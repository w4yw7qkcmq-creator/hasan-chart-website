import { requireAdminPermission } from "../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants";
import { CACHE_NO_STORE } from "../../../../lib/api-response";
import { normalizeContentType } from "../../../../lib/content-post-validation";
import {
  createAdminContentPost,
  listAdminContentPosts,
} from "../../../../lib/content-posts-admin";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.CONTENT_READ, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const contentType = normalizeContentType(searchParams.get("type"));
    if (!contentType) {
      return Response.json({ success: false, error: "نوع المحتوى مطلوب" }, { status: 400 });
    }

    const payload = await listAdminContentPosts(adminCheck.supabase, {
      contentType,
      status: searchParams.get("status") || null,
      search: searchParams.get("search") || null,
      page: Number(searchParams.get("page") || 1),
      pageSize: Number(searchParams.get("pageSize") || 20),
    });

    return Response.json({ success: true, ...payload }, {
      headers: { "Cache-Control": CACHE_NO_STORE },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "تعذر تحميل المنشورات" },
      { status: error?.status || 500 }
    );
  }
}

export async function POST(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.CONTENT_MANAGE, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = await request.json().catch(() => ({}));
    const contentType = normalizeContentType(body?.content_type);
    if (!contentType) {
      return Response.json({ success: false, error: "نوع المحتوى مطلوب" }, { status: 400 });
    }

    const post = await createAdminContentPost(adminCheck.supabase, {
      contentType,
      payload: body,
      adminUserId: adminCheck.user?.id,
      adminEmail: adminCheck.user?.email,
    });

    return Response.json({ success: true, post });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || "تعذر إنشاء المنشور",
        errors: error?.errors || undefined,
      },
      { status: error?.status || 500 }
    );
  }
}
