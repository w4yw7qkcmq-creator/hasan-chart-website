import { requireAdminPermission } from "../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants";
import { getAdminTopPartners } from "../../../../lib/partner-analytics";

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

    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") || 10);

    const partners = await getAdminTopPartners(adminCheck.supabase, { limit });

    return Response.json({ success: true, partners });
  } catch (error) {
    console.error("ADMIN_TOP_PARTNERS_API_ERROR");
    return Response.json(
      { success: false, error: "تعذر تحميل أفضل الشركاء" },
      { status: 500 }
    );
  }
}
