

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

const normalizeEmail = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const getPlanFlags = (planText) => {
  const text = String(planText || "").toLowerCase();

  return {
    hasSpot: text.includes("spot") || text.includes("سبوت") || text.includes("vip spot"),
    hasFutures: text.includes("future") || text.includes("futures") || text.includes("فيوتشر") || text.includes("vip futures"),
  };
};

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const email = normalizeEmail(url.searchParams.get("email"));

    if (!email) {
      return NextResponse.json(
        {
          success: false,
          error: "البريد الإلكتروني غير موجود",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("subscription_requests")
      .select("id,plan_name,category,price,status,created_at")
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