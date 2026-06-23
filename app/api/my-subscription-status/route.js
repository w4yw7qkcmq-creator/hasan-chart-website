import { NextResponse } from "next/server";
import { requireSessionEmail } from "../../../lib/auth-session";

const getPlanFlags = (planText) => {
  const text = String(planText || "").toLowerCase();

  return {
    hasSpot: text.includes("spot") || text.includes("سبوت") || text.includes("vip spot"),
    hasFutures: text.includes("future") || text.includes("futures") || text.includes("فيوتشر") || text.includes("vip futures"),
  };
};

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

    const activePlans = Array.isArray(data) ? data : [];
    const subscriptionPlan = activePlans
      .map((item) => item.plan_name || item.category)
      .filter(Boolean)
      .join(" | ");

    const flags = getPlanFlags(subscriptionPlan);

    return NextResponse.json({
      success: true,
      active: activePlans.length > 0,
      subscription_status: activePlans.length > 0 ? "مفعل" : "غير مفعل",
      subscription_plan: subscriptionPlan,
      hasSpot: flags.hasSpot,
      hasFutures: flags.hasFutures,
      plans: activePlans,
      current_subscription: activePlans[0] || null,
    });
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
