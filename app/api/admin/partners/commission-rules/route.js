import { verifyAdminSession } from "../../../../../lib/admin-auth";
import { listPartnerCommissionRules } from "../../../../../lib/partner-admin-server";

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

    const rules = await listPartnerCommissionRules(adminCheck.supabase);

    return Response.json({
      success: true,
      rules,
    });
  } catch (error) {
    console.error("ADMIN_PARTNER_COMMISSION_RULES_API_ERROR");
    return Response.json(
      { success: false, error: "تعذر تحميل قواعد العمولات" },
      { status: 500 }
    );
  }
}
