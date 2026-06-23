

import { NextResponse } from "next/server";
import { requireSessionEmail } from "../../../lib/auth-session";

export async function POST(request) {
  try {
    const session = await requireSessionEmail();

    if (session.error) {
      return NextResponse.json(
        { success: false, error: "يجب تسجيل الدخول." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { email, supabase } = session;
    const ids = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : [];

    if (ids.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing notification ids",
        },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_email", email)
      .in("id", ids);

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
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
