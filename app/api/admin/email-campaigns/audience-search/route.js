import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import { searchAudienceUsers } from "../../../../../lib/email-campaign/audience.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const admin = await requireAdminPermission(IAM_PERMISSIONS.EMAIL_CAMPAIGN_READ, { request });
    if (!admin.ok) {
      return Response.json({ success: false, error: admin.error }, { status: admin.status });
    }

    const { searchParams } = new URL(request.url);
    const rows = await searchAudienceUsers(admin.supabase, {
      query: searchParams.get("q"),
      limit: Number(searchParams.get("limit") || 20),
    });

    return Response.json({ success: true, rows });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || "Search failed" }, { status: 500 });
  }
}
