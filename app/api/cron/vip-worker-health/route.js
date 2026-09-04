import { verifyCronSecret } from "../../../../lib/admin-auth";
import { getSupabaseAdmin } from "../../../../lib/auth-session";
import { evaluatePersistedVipWorkerHealth } from "../../../../lib/vip-status-delivery-heartbeat.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return Response.json({ success: false, error: "Database unavailable." }, { status: 503 });
  }

  const result = await evaluatePersistedVipWorkerHealth(supabase, { source: "cron" });

  return Response.json({
    success: true,
    healthy: result.health.healthy,
    reasons: result.health.reasons,
    alerted: Boolean(result.alertResult?.alerted),
    heartbeat: result.previousRow
      ? {
          lastSuccessAt: result.previousRow.last_success_at,
          lastCycleAt: result.previousRow.last_cycle_at,
          pendingCount: result.previousRow.pending_count,
          processingCount: result.previousRow.processing_count,
        }
      : null,
  });
}
