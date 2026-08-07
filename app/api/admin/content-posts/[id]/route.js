import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import { CACHE_NO_STORE } from "../../../../../lib/api-response";
import { enforceRateLimit } from "../../../../../lib/enforce-rate-limit";
import { adminMutationLimiter, adminReadLimiter } from "../../../../../lib/rate-limit";
import {
  getAdminContentPostById,
  softDeleteAdminContentPost,
  updateAdminContentPost,
} from "../../../../../lib/content-posts-admin";

export const dynamic = "force-dynamic";

export async function GET(request, context) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.CONTENT_READ, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const rateLimited = await enforceRateLimit(
      adminReadLimiter,
      String(adminCheck.user?.email || "admin").toLowerCase()
    );
    if (rateLimited) return rateLimited;

    const params = await context.params;
    const post = await getAdminContentPostById(adminCheck.supabase, params.id);

    return Response.json({ success: true, post }, {
      headers: { "Cache-Control": CACHE_NO_STORE },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "تعذر تحميل المنشور" },
      { status: error?.status || 500 }
    );
  }
}

export async function PATCH(request, context) {
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

    const params = await context.params;
    const body = await request.json().catch(() => ({}));

    const post = await updateAdminContentPost(adminCheck.supabase, {
      id: params.id,
      payload: body,
      adminUserId: adminCheck.user?.id,
      adminEmail: adminCheck.user?.email,
    });

    return Response.json({ success: true, post });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || "تعذر تحديث المنشور",
        errors: error?.errors || undefined,
      },
      { status: error?.status || 500 }
    );
  }
}

export async function DELETE(request, context) {
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

    const params = await context.params;
    const post = await softDeleteAdminContentPost(adminCheck.supabase, {
      id: params.id,
      adminUserId: adminCheck.user?.id,
      adminEmail: adminCheck.user?.email,
    });

    return Response.json({ success: true, post });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "تعذر حذف المنشور" },
      { status: error?.status || 500 }
    );
  }
}
