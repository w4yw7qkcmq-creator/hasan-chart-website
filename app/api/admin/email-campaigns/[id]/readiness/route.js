import { requireAdminPermission } from "../../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../../lib/iam/constants";
import { getCampaignWizardReadiness } from "../../../../../../lib/email-campaign/launch-readiness.js";
import { getCampaignById } from "../../../../../../lib/email-campaign/store.js";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const admin = await requireAdminPermission(IAM_PERMISSIONS.EMAIL_CAMPAIGN_READ, { request });
    if (!admin.ok) {
      return Response.json({ success: false, error: admin.error }, { status: admin.status });
    }

    const campaignId = String(params.id || "").trim();
    const campaign = await getCampaignById(admin.supabase, campaignId);
    if (!campaign) {
      return Response.json({ success: false, error: "Campaign not found" }, { status: 404 });
    }

    const readiness = getCampaignWizardReadiness(campaign);

    return Response.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        subject: campaign.subject,
        preview_text: campaign.preview_text,
        html_content: campaign.html_content,
        audience_type: campaign.audience_type,
        eligible_count: campaign.eligible_count,
        audience_snapshot_count: campaign.audience_snapshot_count,
        queued_count: campaign.queued_count,
        delivered_count: campaign.delivered_count,
        failed_count: campaign.failed_count,
        provider_accepted_count: campaign.provider_accepted_count,
        metadata: {
          snapshotAt: campaign.metadata?.snapshotAt || null,
          audienceStats: campaign.metadata?.audienceStats || null,
          audienceSnapshotStale: campaign.metadata?.audienceSnapshotStale === true,
        },
      },
      readiness,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Failed to evaluate launch readiness" },
      { status: 500 }
    );
  }
}
