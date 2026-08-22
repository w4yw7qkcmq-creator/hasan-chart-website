import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import { auditCampaignAction } from "../../../../../lib/email-campaign/admin-api.js";
import { fetchCampaignDetail } from "../../../../../lib/email-campaign/metrics.js";
import { getCampaignById, updateCampaignDraft } from "../../../../../lib/email-campaign/store.js";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const admin = await requireAdminPermission(IAM_PERMISSIONS.EMAIL_CAMPAIGN_READ, { request });
    if (!admin.ok) {
      return Response.json({ success: false, error: admin.error }, { status: admin.status });
    }

    const campaignId = String(params.id || "").trim();
    const { searchParams } = new URL(request.url);
    const detail = await fetchCampaignDetail(admin.supabase, campaignId, {
      recipientPage: Number(searchParams.get("recipientPage") || 1),
      recipientPageSize: Number(searchParams.get("recipientPageSize") || 50),
    });

    if (!detail) {
      return Response.json({ success: false, error: "Campaign not found" }, { status: 404 });
    }

    return Response.json({ success: true, ...detail });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || "Failed to load campaign" }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const admin = await requireAdminPermission(IAM_PERMISSIONS.EMAIL_CAMPAIGN_CREATE, { request });
    if (!admin.ok) {
      return Response.json({ success: false, error: admin.error }, { status: admin.status });
    }

    const body = await request.json();
    const campaign = await updateCampaignDraft(admin.supabase, String(params.id), body);

    await auditCampaignAction(admin.supabase, admin.user, "email.campaign.edited", campaign.id, {
      fields: Object.keys(body || {}),
    });

    return Response.json({ success: true, campaign });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || "Failed to update campaign" }, { status: 400 });
  }
}
