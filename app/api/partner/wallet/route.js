import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/auth-session";
import { ensurePartner, getPartnerWalletSummary } from "../../../../lib/partner-server";

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

    const wallet = await getPartnerWalletSummary(session.supabase, partner.id);

    return NextResponse.json({
      success: true,
      wallet,
    });
  } catch (error) {
    console.error("Partner wallet API error");
    return NextResponse.json(
      { success: false, error: "تعذر تحميل محفظة الشريك" },
      { status: 500 }
    );
  }
}
