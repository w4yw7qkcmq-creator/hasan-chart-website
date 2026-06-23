

import { NextResponse } from "next/server";
import { requireSessionEmail } from "../../../lib/auth-session";

export async function GET() {
  try {
    const session = await requireSessionEmail();

    if (session.error) {
      return NextResponse.json(
        { success: false, error: "يجب تسجيل الدخول." },
        { status: 401 }
      );
    }

    const { email, supabase } = session;

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_email", email)
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      notifications: data || [],
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
