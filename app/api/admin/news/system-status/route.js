import { createClient } from "@supabase/supabase-js";
import {
  buildDailyOperationalSummaryFromDb,
  getNewsSystemStatusFromDb,
} from "../../../../../lib/news-system-status";

export const dynamic = "force-dynamic";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(request) {
  try {
    const { requireAdminPermission } = await import("../../../../../lib/admin-auth");
    const { IAM_PERMISSIONS } = await import("../../../../../lib/iam/constants");
    const { enforceRateLimit } = await import("../../../../../lib/enforce-rate-limit");
    const { adminReadLimiter } = await import("../../../../../lib/rate-limit");

    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.NEWS_READ, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const rateLimited = await enforceRateLimit(
      adminReadLimiter,
      String(adminCheck.user?.email || "admin").toLowerCase()
    );
    if (rateLimited) return rateLimited;

    const supabase = getServiceSupabase();
    if (!supabase) {
      return Response.json(
        {
          success: false,
          error: "News system telemetry database is not configured on the website service.",
        },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const view = String(searchParams.get("view") || "status").trim().toLowerCase();

    if (view === "summary") {
      const summary = await buildDailyOperationalSummaryFromDb(supabase);
      return Response.json({
        success: true,
        summary,
        runtime: summary.runtime,
        dataSource: "persisted_telemetry",
      });
    }

    const status = await getNewsSystemStatusFromDb(supabase);

    return Response.json({
      success: true,
      status,
      runtime: status.runtime,
      dataSource: "persisted_telemetry",
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Failed to load news system status" },
      { status: 500 }
    );
  }
}
