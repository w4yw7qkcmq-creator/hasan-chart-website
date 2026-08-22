import { requireAdminPermission } from "../../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../../lib/iam/constants";
import { auditCampaignAction } from "../../../../../../lib/email-campaign/admin-api.js";
import { buildCampaignAudienceSnapshot } from "../../../../../../lib/email-campaign/snapshot.js";
import { getCampaignById } from "../../../../../../lib/email-campaign/store.js";
import { CAMPAIGN_STATUS } from "../../../../../../lib/email-campaign/constants.js";

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  try {
    const admin = await requireAdminPermission(IAM_PERMISSIONS.EMAIL_CAMPAIGN_CREATE, { request });
    if (!admin.ok) {
      return Response.json({ success: false, error: admin.error }, { status: admin.status });
    }

    const campaignId = String(params.id || "").trim();
    const campaign = await getCampaignById(admin.supabase, campaignId);
    if (!campaign) {
      return Response.json({ success: false, error: "Campaign not found" }, { status: 404 });
    }

    await admin.supabase
      .from("email_campaigns")
      .update({ status: CAMPAIGN_STATUS.PREPARING })
      .eq("id", campaignId);

    const result = await buildCampaignAudienceSnapshot(admin.supabase, {
      ...campaign,
      status: CAMPAIGN_STATUS.PREPARING,
    });

    await auditCampaignAction(admin.supabase, admin.user, "email.campaign.audience_generated", campaignId, result.stats);

    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || "Failed to prepare audience" }, { status: 500 });
  }
}
