import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import { getMarketingAudienceAggregateCounts } from "../../../../../lib/email-policy/audience-metrics.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const admin = await requireAdminPermission(IAM_PERMISSIONS.EMAIL_CAMPAIGN_READ, { request });
    if (!admin.ok) {
      return Response.json({ success: false, error: admin.error }, { status: admin.status });
    }

    const counts = await getMarketingAudienceAggregateCounts(admin.supabase);

    return Response.json({ success: true, counts });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Failed to load audience counts" },
      { status: 500 }
    );
  }
}
