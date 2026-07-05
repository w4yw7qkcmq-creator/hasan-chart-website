import { verifyAdminSession } from "../../../../lib/admin-auth";
import { listAdminPartnerWithdrawals } from "../../../../lib/partner-admin-server";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await verifyAdminSession();

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "all";
    const network = searchParams.get("network") || "all";
    const search = searchParams.get("search") || "";
    const withdrawals = await listAdminPartnerWithdrawals(adminCheck.supabase, {
      status,
      network,
      search,
    });

    return Response.json({
      success: true,
      withdrawals,
    });
  } catch (error) {
    console.error("ADMIN_PARTNER_WITHDRAWALS_API_ERROR");
    return Response.json(
      { success: false, error: "تعذر تحميل طلبات السحب" },
      { status: 500 }
    );
  }
}
