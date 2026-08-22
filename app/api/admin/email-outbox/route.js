import { requireAdminPermission } from "../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants";
import {
  fetchEmailOutboxMetrics,
  fetchOutboxRowDeliveryStatus,
} from "../../../../lib/email-outbox-metrics";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.EMAIL_OUTBOX_READ, {
      request,
    });

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
      if (!detail) {
        return Response.json(
          { success: false, error: "Outbox row not found" },
          { status: 404 }
        );
      }

      return Response.json({ success: true, ...detail });
    }

    const metrics = await fetchEmailOutboxMetrics(adminCheck.supabase, {
      sampleLimit: Number(searchParams.get("limit") || 5000),
    });

    return Response.json({ success: true, metrics });
  } catch (error) {
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
