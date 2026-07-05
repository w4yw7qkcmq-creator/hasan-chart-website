import { NextResponse } from "next/server";
import { verifyAdminOrCronSecret } from "../../../../../lib/admin-auth";
import { onPartnerGenericServiceActivated } from "../../../../../lib/partner-service-hooks";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const auth = await verifyAdminOrCronSecret(request);

    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: auth.error || "Unauthorized" },
        { status: auth.status || 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const result = await onPartnerGenericServiceActivated(auth.supabase, {
      userId: body?.userId,
      userEmail: body?.userEmail,
      subscriptionId: body?.subscriptionId,
      serviceType: body?.serviceType,
      subscriptionPrice: body?.subscriptionPrice,
      reason: body?.reason,
      invitedUsername: body?.invitedUsername,
      metadata: body?.metadata || {},
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("PARTNER_SERVICE_HOOK_API_ERROR");
    return NextResponse.json(
      { success: false, error: "تعذر إنشاء عمولة الشريك" },
      { status: 500 }
    );
  }
}
