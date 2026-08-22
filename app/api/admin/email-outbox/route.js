import { requireAdminPermission } from "../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants";
import { createApiTimer } from "../../../../lib/admin-api-timing.js";
import {
  fetchEmailOutboxMetrics,
  fetchOutboxRowDeliveryStatus,
} from "../../../../lib/email-outbox-metrics";
import { withShortLivedCache } from "../../../../lib/short-lived-cache.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const timer = createApiTimer("email-outbox");
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.EMAIL_OUTBOX_READ, {
      request,
    });
    timer.mark("auth");

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const { searchParams } = new URL(request.url);
    const outboxId = String(searchParams.get("outboxId") || "").trim();

    if (outboxId) {
      const detail = await fetchOutboxRowDeliveryStatus(adminCheck.supabase, outboxId);
      timer.mark("detail");
      if (!detail) {
        return Response.json(
          { success: false, error: "Outbox row not found" },
          { status: 404 }
        );
      }

      const totalMs = timer.finish();
      return Response.json({ success: true, ...detail, _perfMs: totalMs });
    }

    const metrics = await withShortLivedCache("email-outbox-metrics:v2", 15_000, () =>
      fetchEmailOutboxMetrics(adminCheck.supabase, {
        sampleLimit: Number(searchParams.get("limit") || 500),
      })
    );
    timer.mark("metrics");

    const totalMs = timer.finish();
    return Response.json({ success: true, metrics, _perfMs: totalMs });
  } catch (error) {
    timer.finish({ error: true });
    console.error("EMAIL_OUTBOX_METRICS_API_ERROR:", error?.message || error);
    return Response.json(
      {
        success: false,
        error: error?.message || "تعذر تحميل مقاييس طابور البريد",
      },
      { status: 500 }
    );
  }
}
