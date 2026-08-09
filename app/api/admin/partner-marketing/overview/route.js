import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import { getAdminMarketingOverview } from "../../../../../lib/partner-center/admin-marketing-service.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_MISSIONS_READ, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const url = new URL(request.url);
    const periodDays = Number(url.searchParams.get("periodDays") || 30);
    const overview = await getAdminMarketingOverview(adminCheck.supabase, { periodDays });

    return Response.json({ success: true, overview });
  } catch (error) {
    console.error("ADMIN_MARKETING_OVERVIEW_ERROR");
    return Response.json({ success: false, error: "تعذر تحميل نظرة التسويق" }, { status: 500 });
  }
}
