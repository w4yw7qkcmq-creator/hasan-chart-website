import { requireAdminPermission } from "../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants";
import { getAdminPartnerAnalytics } from "../../../../lib/partner-analytics";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_ANALYTICS_READ, { request });

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const analytics = await getAdminPartnerAnalytics(adminCheck.supabase);

    return Response.json({ success: true, analytics });
  } catch (error) {
    console.error("ADMIN_PARTNER_ANALYTICS_API_ERROR");
    return Response.json(
      { success: false, error: "تعذر تحميل Partner Analytics" },
      { status: 500 }
    );
  }
}
