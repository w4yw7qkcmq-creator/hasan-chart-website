import { verifyAdminSession } from "../../../../lib/admin-auth";
import { getAdminPartnerAnalytics } from "../../../../lib/partner-analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const adminCheck = await verifyAdminSession();

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
