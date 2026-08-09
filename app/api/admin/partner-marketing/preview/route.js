import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import {
  adminPreviewCampaign,
  adminPreviewMission,
} from "../../../../../lib/partner-center/admin-marketing-service.js";
import { isPartnerAdminMarketingEnabled } from "../../../../../lib/partner-center/feature-flags.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    if (!isPartnerAdminMarketingEnabled()) {
      return Response.json({ success: false, error: "admin_marketing_disabled" }, { status: 404 });
    }
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_MISSIONS_READ, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = await request.json().catch(() => ({}));
    const [{ data: tiers }, { data: campaigns }] = await Promise.all([
      adminCheck.supabase.from("partner_tiers").select("tier_key, tier_name").eq("is_active", true),
      adminCheck.supabase.from("partner_campaign_programs").select("id, code, status"),
    ]);

    if (body.entityType === "campaign") {
      const preview = await adminPreviewCampaign(body.input || {}, { tiers: tiers || [], campaigns: campaigns || [] });
      return Response.json({ success: true, preview });
    }

    const preview = await adminPreviewMission(body.input || {}, { tiers: tiers || [], campaigns: campaigns || [] });
    return Response.json({ success: true, preview });
  } catch (error) {
    console.error("ADMIN_PREVIEW_ERROR");
    return Response.json({ success: false, error: "تعذر المعاينة" }, { status: 500 });
  }
}
