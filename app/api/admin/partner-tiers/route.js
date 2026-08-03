import { requireAdminPermission } from "../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants";
import { listPartnerTiers } from "../../../../lib/partner-admin-server";

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

    const tiers = await listPartnerTiers(adminCheck.supabase);

    return Response.json({
      success: true,
      tiers,
    });
  } catch (error) {
    console.error("ADMIN_PARTNER_TIERS_API_ERROR");
    return Response.json(
      { success: false, error: "تعذر تحميل مستويات الشركاء" },
      { status: 500 }
    );
  }
}
