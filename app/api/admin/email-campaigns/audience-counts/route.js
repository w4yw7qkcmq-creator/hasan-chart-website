import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import { createApiTimer } from "../../../../../lib/admin-api-timing.js";
import { getMarketingAudienceAggregateCounts } from "../../../../../lib/email-policy/audience-metrics.js";
import { withShortLivedCache } from "../../../../../lib/short-lived-cache.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const timer = createApiTimer("email-campaigns/audience-counts");
  try {
    const admin = await requireAdminPermission(IAM_PERMISSIONS.EMAIL_CAMPAIGN_READ, { request });
    timer.mark("auth");
    if (!admin.ok) {
      return Response.json({ success: false, error: admin.error }, { status: admin.status });
    }

    const counts = await withShortLivedCache("email-audience-counts:v1", 30_000, () =>
      getMarketingAudienceAggregateCounts(admin.supabase)
    );
    timer.mark("counts");

    const totalMs = timer.finish();
    return Response.json({ success: true, counts, _perfMs: totalMs });
  } catch (error) {
    timer.finish({ error: true });
    return Response.json(
      { success: false, error: error?.message || "Failed to load audience counts" },
      { status: 500 }
    );
  }
}
