import { requireAdminPermission } from "../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants";
import { getPartnerHealthSnapshot } from "../../../../lib/partner-monitoring";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_READ, { request });

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const health = await getPartnerHealthSnapshot(adminCheck.supabase);

    return Response.json({ success: true, health });
  } catch (error) {
    console.error("ADMIN_PARTNER_HEALTH_API_ERROR");
    return Response.json(
      { success: false, error: "تعذر فحص صحة نظام الشركاء" },
      { status: 500 }
    );
  }
}
