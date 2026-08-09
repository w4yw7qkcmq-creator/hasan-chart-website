import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import {
  adminListTiers,
  adminUpdateTierDefinition,
} from "../../../../../lib/partner-center/admin-marketing-service.js";
import { isPartnerAdminMarketingEnabled } from "../../../../../lib/partner-center/feature-flags.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    if (!isPartnerAdminMarketingEnabled()) {
      return Response.json({ success: false, error: "admin_marketing_disabled" }, { status: 404 });
    }
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_LEVELS_MANAGE, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }
    const tiers = await adminListTiers(adminCheck.supabase);
    return Response.json({ success: true, tiers });
  } catch (error) {
    console.error("ADMIN_LEVELS_GET_ERROR");
    return Response.json({ success: false, error: "تعذر تحميل المستويات" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    if (!isPartnerAdminMarketingEnabled()) {
      return Response.json({ success: false, error: "admin_marketing_disabled" }, { status: 404 });
    }
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_LEVELS_MANAGE, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }
    const body = await request.json().catch(() => ({}));
    if (!body.tier_key) {
      return Response.json({ success: false, error: "tier_key مطلوب" }, { status: 400 });
    }
    const { tier_key, ...patch } = body;
    const tier = await adminUpdateTierDefinition(adminCheck.supabase, tier_key, patch, adminCheck.userId);
    return Response.json({ success: true, tier });
  } catch (error) {
    console.error("ADMIN_LEVELS_PATCH_ERROR");
    return Response.json({ success: false, error: error.message || "تعذر تحديث المستوى" }, { status: 500 });
  }
}
