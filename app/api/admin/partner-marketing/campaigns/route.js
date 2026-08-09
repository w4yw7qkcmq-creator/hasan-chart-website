import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import {
  adminCreateCampaign,
  adminCreateCampaignVersion,
  adminSetCampaignStatus,
  adminUpdateCampaign,
} from "../../../../../lib/partner-center/admin-marketing-service.js";
import { isPartnerAdminMarketingEnabled } from "../../../../../lib/partner-center/feature-flags.js";

export const dynamic = "force-dynamic";

function gateDisabled() {
  return Response.json({ success: false, error: "admin_marketing_disabled" }, { status: 404 });
}

export async function GET(request) {
  try {
    if (!isPartnerAdminMarketingEnabled()) return gateDisabled();
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_CAMPAIGNS_READ, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { data, error } = await adminCheck.supabase
      .from("partner_campaign_programs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    return Response.json({ success: true, campaigns: data || [] });
  } catch (error) {
    console.error("ADMIN_CAMPAIGNS_GET_ERROR");
    return Response.json({ success: false, error: "تعذر تحميل الحملات" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!isPartnerAdminMarketingEnabled()) return gateDisabled();
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_CAMPAIGNS_MANAGE, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = await request.json().catch(() => ({}));
    const campaign = await adminCreateCampaign(adminCheck.supabase, body, adminCheck.userId);
    return Response.json({ success: true, campaign });
  } catch (error) {
    console.error("ADMIN_CAMPAIGNS_POST_ERROR");
    return Response.json({ success: false, error: error.message || "تعذر إنشاء الحملة" }, { status: 400 });
  }
}

export async function PATCH(request) {
  try {
    if (!isPartnerAdminMarketingEnabled()) return gateDisabled();
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.PARTNERS_CAMPAIGNS_MANAGE, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = await request.json().catch(() => ({}));
    if (!body.id) {
      return Response.json({ success: false, error: "معرف الحملة مطلوب" }, { status: 400 });
    }

    const { id, action, status, reason, ...patch } = body;
    let campaign;
    if (action === "create_version") {
      campaign = await adminCreateCampaignVersion(adminCheck.supabase, id, patch, adminCheck.userId);
    } else if (status != null) {
      campaign = await adminSetCampaignStatus(adminCheck.supabase, id, status, adminCheck.userId, { reason });
    } else {
      campaign = await adminUpdateCampaign(adminCheck.supabase, id, patch, adminCheck.userId);
    }
    return Response.json({ success: true, campaign });
  } catch (error) {
    console.error("ADMIN_CAMPAIGNS_PATCH_ERROR");
    return Response.json({ success: false, error: error.message || "تعذر تحديث الحملة" }, { status: 500 });
  }
}
