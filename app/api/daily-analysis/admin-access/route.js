import { NextResponse } from "next/server";
import { requireAdminPermission } from "../../../../lib/admin-auth";
import { IAM_PERMISSIONS } from "../../../../lib/iam/constants";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const adminCheck = await requireAdminPermission(IAM_PERMISSIONS.ANALYSIS_READ, { request });

    return NextResponse.json({
      success: true,
      allowed: adminCheck.ok === true,
    });
  } catch (error) {
    return NextResponse.json({
      success: true,
      allowed: false,
    });
  }
}
