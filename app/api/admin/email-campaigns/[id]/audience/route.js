import { requireAdminPermission } from "../../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../../lib/iam/constants";
import { auditCampaignAction } from "../../../../../../lib/email-campaign/admin-api.js";
import { buildCampaignAudienceSnapshot } from "../../../../../../lib/email-campaign/snapshot.js";
import { getCampaignById } from "../../../../../../lib/email-campaign/store.js";
import { CAMPAIGN_STATUS } from "../../../../../../lib/email-campaign/constants.js";
import { invalidateShortLivedCache } from "../../../../../../lib/short-lived-cache.js";

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

    invalidateShortLivedCache("email-audience-counts:");

    return Response.json({
      success: true,
      campaign: result.campaign,
      stats: result.stats,
      recipientCount: result.recipientCount,
      exclusionReasons: result.exclusionReasons,
      readiness: {
        eligibleCount: result.stats?.eligible ?? result.campaign?.eligible_count ?? 0,
        excludedCount: result.stats?.excluded ?? 0,
        snapshotAt: result.campaign?.metadata?.snapshotAt ?? null,
      },
    });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || "Failed to prepare audience" }, { status: 500 });
  }
}
