import { requireAdminPermission } from "../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants";
import { listAdminPartnerWalletLedger } from "../../../../lib/partner-admin-server";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_FINANCE_READ, { request });

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const { searchParams } = new URL(request.url);
    const partnerId = searchParams.get("partnerId") || undefined;
    const limit = Number(searchParams.get("limit") || 25);
    const page = Number(searchParams.get("page") || 1);

    const ledger = await listAdminPartnerWalletLedger(adminCheck.supabase, {
      partnerId,
      limit: Number.isFinite(limit) ? limit : 25,
      page,
    });

    return Response.json(
      {
        success: true,
        ledger,
        pagination: { page, limit: Math.min(Math.max(limit, 1), 100) },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("ADMIN_PARTNER_WALLET_LEDGER_API_ERROR");
    return Response.json(
      { success: false, error: "تعذر تحميل سجل المحفظة" },
      { status: 500 }
    );
  }
}
