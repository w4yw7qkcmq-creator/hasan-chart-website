import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/auth-session";
import { ensurePartner, listPartnerWithdrawalsForPartner } from "../../../../lib/partner-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSessionUser();

    if (session.error) {
      return NextResponse.json(
        { success: false, error: "يجب تسجيل الدخول أولاً" },
        { status: 401 }
      );
    }

    const partner = await ensurePartner(session.supabase, {
      userId: session.id,
      username: session.username,
    });

    const withdrawals = await listPartnerWithdrawalsForPartner(session.supabase, partner.id);

    return NextResponse.json({
      success: true,
      withdrawals,
    });
  } catch (error) {
    console.error("Partner withdrawals API error");
    return NextResponse.json(
      { success: false, error: "تعذر تحميل طلبات السحب" },
      { status: 500 }
    );
  }
}
