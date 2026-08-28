import { requireAdminPermission } from "../../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../../lib/iam/constants";
import { CACHE_NO_STORE } from "../../../../../lib/api-response";
import { getPriceAlertWorkerStatusFromDb } from "../../../../../lib/price-alert-worker-status";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.EMAIL_OUTBOX_READ, { request });
    if (!adminCheck.ok) {
      return Response.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const expectedCycleMs = Number(searchParams.get("expectedCycleMs") || 30_000);

    const status = await getPriceAlertWorkerStatusFromDb(adminCheck.supabase, { expectedCycleMs });

    return Response.json(
      {
        success: true,
        status,
      },
      {
        headers: {
          "Cache-Control": CACHE_NO_STORE,
        },
      }
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || "Price alert worker status unavailable.",
      },
      { status: 500 }
    );
  }
}
