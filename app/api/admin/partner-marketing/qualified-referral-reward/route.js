import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import {
  adminGetQualifiedReferralRewardPolicy,
  adminSaveQualifiedReferralRewardPolicy,
} from "../../../../../lib/partner-center/admin-marketing-service.js";
import { validateQualifiedReferralRewardAmount } from "../../../../../lib/partner-center/qualified-referral-reward-policy.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_REWARDS_READ, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const policy = await adminGetQualifiedReferralRewardPolicy(adminCheck.supabase);
    return Response.json({ success: true, policy });
  } catch (error) {
    console.error("ADMIN_QRR_POLICY_GET_ERROR");
    return Response.json({ success: false, error: "تعذر تحميل سياسة المكافأة" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_REWARDS_MANAGE, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = await request.json();
    const validation = validateQualifiedReferralRewardAmount(body?.amount);
    if (!validation.ok) {
      return Response.json(
        { success: false, error: "قيمة المكافأة غير صالحة", code: validation.code },
        { status: 400 }
      );
    }

    const isEnabled = Boolean(body?.isEnabled);
    const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : null;

    const created = await adminSaveQualifiedReferralRewardPolicy(adminCheck.supabase, {
      amount: validation.amount,
      isEnabled,
      actorUserId: adminCheck.userId,
      reason,
    });

    return Response.json({
      success: true,
      policy: {
        id: created.id,
        amount: Number(created.amount),
        currency: created.currency,
        isEnabled: created.is_enabled,
        ruleVersion: created.rule_version,
        effectiveFrom: created.effective_from,
      },
    });
  } catch (error) {
    console.error("ADMIN_QRR_POLICY_PUT_ERROR", error?.message);
    return Response.json({ success: false, error: "تعذر حفظ سياسة المكافأة" }, { status: 500 });
  }
}
