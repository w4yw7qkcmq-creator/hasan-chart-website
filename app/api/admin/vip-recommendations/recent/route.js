import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import { enforceRateLimit } from "../../../../../lib/enforce-rate-limit";
import { adminReadLimiter } from "../../../../../lib/rate-limit";
import { listRecentVipRecommendations } from "../../../../../lib/vip-recommendation-status-dispatch.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.RECOMMENDATIONS_STATUS_READ, {
      request,
    });

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const rateLimited = await enforceRateLimit(
      adminReadLimiter,
      String(adminCheck.user?.email || "admin").toLowerCase()
    );
    if (rateLimited) return rateLimited;

    const result = await listRecentVipRecommendations(adminCheck.supabase, { limit: 3 });

    if (!result.ok) {
      return Response.json({ success: false, error: result.error }, { status: 500 });
    }

    return Response.json({ success: true, items: result.items });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Internal error" },
      { status: 500 }
    );
  }
}
