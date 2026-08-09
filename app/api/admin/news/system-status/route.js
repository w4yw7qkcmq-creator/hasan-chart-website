import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import { enforceRateLimit } from "../../../../../lib/enforce-rate-limit";
import { adminReadLimiter } from "../../../../../lib/rate-limit";
import {
  getNewsSystemStatus,
  getNewsSystemStatusFromDb,
  buildDailyOperationalSummary,
} from "../../../../../worker/lib/news-intelligence/autonomy/diagnostic-service";
import { getPhase3RuntimeConfig } from "../../../../../worker/lib/news-intelligence/autonomy/feature-flags";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.NEWS_READ, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const rateLimited = await enforceRateLimit(
      adminReadLimiter,
      String(adminCheck.user?.email || "admin").toLowerCase()
    );
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const view = String(searchParams.get("view") || "status").trim().toLowerCase();
    const supabase = getServiceSupabase();

    if (view === "summary") {
      return Response.json({
        success: true,
        summary: buildDailyOperationalSummary(),
        runtime: getPhase3RuntimeConfig(),
      });
    }

    const status = supabase
      ? await getNewsSystemStatusFromDb(supabase)
      : getNewsSystemStatus();

    return Response.json({
      success: true,
      status,
      runtime: getPhase3RuntimeConfig(),
      note: "Worker in-memory metrics are process-local; DB fields populate after Phase 3 migration.",
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Failed to load news system status" },
      { status: 500 }
    );
  }
}
