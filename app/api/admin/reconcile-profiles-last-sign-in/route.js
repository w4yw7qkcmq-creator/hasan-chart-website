import { NextResponse } from "next/server";
import { requireMachineAuth } from "../../../../lib/iam/machine-auth.js";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants.js";

export async function GET(request) {
  try {
    const authCheck = await requireMachineAuth(request, IAM_PERMISSIONS.SYSTEM_CRON_READ);

    if (!authCheck.ok) {
      return NextResponse.json(
        {
          success: false,
          error: authCheck.error,
        },
        { status: authCheck.status || 401 }
      );
    }

    const supabase = authCheck.supabase;
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: "Database client unavailable" },
        { status: 503 }
      );
    }

    const { data, error } = await supabase.rpc("reconcile_profiles_last_sign_in_at");

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message || "Reconciliation failed",
        },
        { status: 500 }
      );
    }

    const row = Array.isArray(data) ? data[0] : data;
    const updatedCount = Number(row?.updated_count ?? 0);
    const eligibleAuthPopulated = Number(row?.eligible_auth_populated ?? 0);
    const remainingMismatch = Number(row?.remaining_mismatch ?? 0);

    return NextResponse.json({
      success: true,
      updatedCount,
      eligibleAuthPopulated,
      remainingMismatch,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Server Error",
      },
      { status: 500 }
    );
  }
}
