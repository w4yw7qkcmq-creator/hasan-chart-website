import { requireAdminPermission } from "../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants";
import { runPartnerUpgradeBatch } from "../../../../lib/partner-automation";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_JOBS_RUN, { request });

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const body = await request.json().catch(() => ({}));
    const result = await runPartnerUpgradeBatch(adminCheck.supabase, {
      partnerId: body?.partnerId,
      force: Boolean(body?.force),
    });

    return Response.json({
      success: true,
      result,
      message: `تم تشغيل الترقية التلقائية — ${result.count || 0} ترقية`,
    });
  } catch (error) {
    console.error("ADMIN_RUN_PARTNER_UPGRADE_ERROR");
    return Response.json(
      { success: false, error: "تعذر تشغيل الترقية التلقائية" },
      { status: 500 }
    );
  }
}
