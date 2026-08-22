import { requireAdminPermission } from "../../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../../lib/iam/constants";
import { getCampaignPreviewPayload } from "../../../../../../lib/email-campaign/admin-api.js";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const admin = await requireAdminPermission(IAM_PERMISSIONS.EMAIL_CAMPAIGN_READ, { request });
    if (!admin.ok) {
      return Response.json({ success: false, error: admin.error }, { status: admin.status });
    }

    const { searchParams } = new URL(request.url);
    const preview = await getCampaignPreviewPayload(admin.supabase, String(params.id), {
      sampleUserId: searchParams.get("userId"),
    });

    if (!preview) {
      return Response.json({ success: false, error: "Campaign not found" }, { status: 404 });
    }

    return Response.json({ success: true, preview });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || "Failed to render preview" }, { status: 500 });
  }
}
