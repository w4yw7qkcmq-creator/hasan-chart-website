

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabase-admin";

const normalizeEmail = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

export async function GET(req) {
  try {
    const url = new URL(req.url);

    const id = url.searchParams.get("id");
    const email = normalizeEmail(url.searchParams.get("email"));

    if (!id || !email) {
      return NextResponse.json(
        {
          success: false,
          error: "بيانات الطلب غير مكتملة",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("analysis_requests")
      .select("id, reply_image, user_email")
      .eq("id", id)
      .eq("user_email", email)
      .maybeSingle();

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
      reply_image: data?.reply_image || null,
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