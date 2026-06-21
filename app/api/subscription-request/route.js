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

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    const userEmail = String(body.user_email || body.email || "").trim().toLowerCase();
    const username = String(body.username || userEmail || "").trim();
    const planName = String(body.plan_name || "").trim();
    const category = String(body.category || "").trim();
    const price = String(body.price || "").trim();
    const telegramUsername = String(body.telegram_username || "").trim();
    const paymentProof = String(body.payment_proof || "").trim();

    if (!userEmail || !planName || !category || !price || !telegramUsername || !paymentProof) {
      return NextResponse.json(
        {
          success: false,
          error: "بيانات طلب الاشتراك غير مكتملة",
        },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("subscription_requests").insert([
      {
        user_email: userEmail,
        username,
        plan_name: planName,
        category,
        price,
        telegram_username: telegramUsername,
        payment_proof: paymentProof,
        status: "قيد المعالجة",
      },
    ]);

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
      message: "تم إرسال طلب الاشتراك بنجاح",
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