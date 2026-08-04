import { NextResponse } from "next/server";
import { requireAdminPermission } from "../../../../lib/admin-auth.js";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants.js";
import {
  dryRunBackfillLegacyAdmins,
  backfillLegacyAdmins,
} from "../../../../lib/iam/grant-revoke.js";
import { buildIamReadinessReport } from "../../../../lib/iam/health-readiness.js";
import { CACHE_NO_STORE } from "../../../../lib/api-response.js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.IAM_MANAGE);
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const readiness = await buildIamReadinessReport(adminCheck.supabase);

    return NextResponse.json(
      { success: true, health: readiness },
      { headers: { "Cache-Control": CACHE_NO_STORE } }
    );
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.IAM_MANAGE, { request });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "").trim();

    if (action === "dry_run_backfill" || action === "backfill_legacy" || action === "execute_backfill") {
      const isExecute =
        action === "execute_backfill" || (action === "backfill_legacy" && body.execute === true);

      if (isExecute) {
        const confirm = String(body.confirm || "").trim();
        if (confirm && confirm !== "EXECUTE_BACKFILL") {
          return NextResponse.json(
            { success: false, error: "Confirmation string mismatch" },
            { status: 400 }
          );
        }

        const result = await backfillLegacyAdmins(adminCheck.supabase, {
          ownerEmail: process.env.IAM_OWNER_EMAIL || null,
          actorId: adminCheck.user?.id || null,
          actorEmail: adminCheck.user?.email || null,
          actorIam: adminCheck.iam || { isSuperAdmin: true },
          request,
        });

        return NextResponse.json(
          { success: true, dryRun: false, execute: true, result },
          { headers: { "Cache-Control": CACHE_NO_STORE } }
        );
      }

      const confirm = String(body.confirm || "").trim();
      if (confirm && confirm !== "DRY_RUN_BACKFILL") {
        return NextResponse.json(
          { success: false, error: "Confirmation string mismatch" },
          { status: 400 }
        );
      }

      const report = await dryRunBackfillLegacyAdmins(adminCheck.supabase, {
        ownerEmail: process.env.IAM_OWNER_EMAIL || null,
      });

      return NextResponse.json({ success: true, dryRun: true, report });
    }

    return NextResponse.json({ success: false, error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
