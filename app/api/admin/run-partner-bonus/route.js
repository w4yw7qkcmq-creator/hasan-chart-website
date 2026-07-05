import { verifyAdminSession } from "../../../../lib/admin-auth";
import { runMonthlyPartnerBonuses } from "../../../../lib/partner-automation";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const adminCheck = await verifyAdminSession();

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const body = await request.json().catch(() => ({}));
    const result = await runMonthlyPartnerBonuses(adminCheck.supabase, {
      period: body?.period,
      partnerId: body?.partnerId,
      force: Boolean(body?.force),
    });

    return Response.json({
      success: true,
      result,
      message: `تم تشغيل المكافآت الشهرية — ${result.grants?.length || 0} مكافأة`,
    });
  } catch (error) {
    console.error("ADMIN_RUN_PARTNER_BONUS_ERROR");
    return Response.json(
      { success: false, error: "تعذر تشغيل المكافآت الشهرية" },
      { status: 500 }
    );
  }
}
