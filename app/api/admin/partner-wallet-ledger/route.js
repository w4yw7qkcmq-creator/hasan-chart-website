import { verifyAdminSession } from "../../../../lib/admin-auth";
import { listAdminPartnerWalletLedger } from "../../../../lib/partner-admin-server";

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
    const partnerId = searchParams.get("partnerId") || undefined;
    const limit = Number(searchParams.get("limit") || 200);

    const ledger = await listAdminPartnerWalletLedger(adminCheck.supabase, {
      partnerId,
      limit: Number.isFinite(limit) ? limit : 200,
    });

    return Response.json({
      success: true,
      ledger,
    });
  } catch (error) {
    console.error("ADMIN_PARTNER_WALLET_LEDGER_API_ERROR");
    return Response.json(
      { success: false, error: "تعذر تحميل سجل المحفظة" },
      { status: 500 }
    );
  }
}
