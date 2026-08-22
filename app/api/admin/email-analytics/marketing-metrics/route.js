import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import {
  getMarketingAudienceAggregateCounts,
  getMarketingConsentPopulationReport,
} from "../../../../../lib/email-policy/audience-metrics.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const admin = await requireAdminPermission(IAM_PERMISSIONS.EMAIL_ANALYTICS_READ, { request });
    if (!admin.ok) {
      return Response.json({ success: false, error: admin.error }, { status: admin.status });
    }

    const { searchParams } = new URL(request.url);
    const report = searchParams.get("report") === "consent";

    if (report) {
      const population = await getMarketingConsentPopulationReport(admin.supabase);
      return Response.json({ success: true, population });
    }

    const metrics = await getMarketingAudienceAggregateCounts(admin.supabase);
    return Response.json({ success: true, metrics });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Failed to load marketing metrics" },
      { status: 500 }
    );
  }
}
