import { NextResponse } from "next/server";
import { verifyAdminSession } from "../../../../lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const adminCheck = await verifyAdminSession();

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
