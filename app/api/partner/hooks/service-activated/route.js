import { NextResponse } from "next/server";
import { requireMachineOrAdminPermission } from "../../../../../lib/iam/machine-auth.js";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants.js";
import { onPartnerGenericServiceActivated } from "../../../../../lib/partner-service-hooks";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const auth = await requireMachineOrAdminPermission(
      request,
      IAM_PERMISSIONS.PARTNERS_JOBS_RUN
    );

    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: auth.error || "Unauthorized" },
        { status: auth.status || 401 }
      );
    }

    const supabase = auth.supabase;
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: "Server misconfigured" },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const result = await onPartnerGenericServiceActivated(supabase, {
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
      authMode: auth.authMode || (auth.user ? "admin" : "unknown"),
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
