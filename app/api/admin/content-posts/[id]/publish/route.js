import { requireAdminPermission } from "../../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../../lib/iam/constants";
import { publishAdminContentPost } from "../../../../../../lib/content-posts-admin";

export const dynamic = "force-dynamic";

export async function POST(request, context) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.CONTENT_PUBLISH, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const params = await context.params;
    const post = await publishAdminContentPost(adminCheck.supabase, {
      id: params.id,
      adminUserId: adminCheck.user?.id,
      adminEmail: adminCheck.user?.email,
    });

    return Response.json({ success: true, post });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "تعذر نشر المنشور" },
      { status: error?.status || 500 }
    );
  }
}
