import { NextResponse } from "next/server";
import { requireSessionEmail } from "../../../lib/auth-session";
import { buildSubscriptionStatusResponse } from "../../../lib/subscription-mode";

export async function GET() {
  try {
    const session = await requireSessionEmail();

    if (session.error) {
      return NextResponse.json(
        {
          success: false,
          error: "يجب تسجيل الدخول.",
        },
        { status: 401 }
      );
    }

    const { email, supabase } = session;

    const { data, error } = await supabase
      .from("subscription_requests")
      .select("id,plan_name,category,price,status,started_at,expires_at,created_at")
      .eq("user_email", email)
      .eq("status", "مفعل")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(buildSubscriptionStatusResponse(data));
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Server Error",
      },
      { status: 500 }
    );
  }
}
