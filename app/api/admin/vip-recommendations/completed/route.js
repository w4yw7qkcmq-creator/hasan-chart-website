import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import { enforceRateLimit } from "../../../../../lib/enforce-rate-limit";
import { adminReadLimiter } from "../../../../../lib/rate-limit";
import { listCompletedVipRecommendations } from "../../../../../lib/vip-recommendation-status-dispatch.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.RECOMMENDATIONS_STATUS_READ, {
      request,
    });

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status, headers: NO_CACHE_HEADERS }
      );
    }

    const rateLimited = await enforceRateLimit(
      adminReadLimiter,
      String(adminCheck.user?.email || "admin").toLowerCase()
    );
    if (rateLimited) return rateLimited;

    const result = await listCompletedVipRecommendations(adminCheck.supabase);

    if (!result.ok) {
      return Response.json(
        { success: false, error: result.error },
        { status: 500, headers: NO_CACHE_HEADERS }
      );
    }

    return Response.json(
      { success: true, items: result.items },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Internal error" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
