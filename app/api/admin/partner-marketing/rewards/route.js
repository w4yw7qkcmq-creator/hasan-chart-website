import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import { adminListRewards, adminListAuditLog } from "../../../../../lib/partner-center/admin-marketing-service.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_REWARDS_READ, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const limit = Number(url.searchParams.get("limit") || 50);
    const offset = Number(url.searchParams.get("offset") || 0);

    const rewards = await adminListRewards(adminCheck.supabase, { status, limit, offset });
    return Response.json({ success: true, ...rewards });
  } catch (error) {
    console.error("ADMIN_REWARDS_GET_ERROR");
    return Response.json({ success: false, error: "تعذر تحميل المكافآت" }, { status: 500 });
  }
}
