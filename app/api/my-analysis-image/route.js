

import { NextResponse } from "next/server";
import { requireSessionEmail } from "../../../lib/auth-session";
import { isValidUuid } from "../../../lib/partner-security";

export async function GET(req) {
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

    const url = new URL(req.url);
    const id = String(url.searchParams.get("id") || "").trim();

    if (!isValidUuid(id)) {
      return NextResponse.json(
        {
          success: false,
          error: "معرّف الطلب غير صالح",
        },
        { status: 400 }
      );
    }

    const { email, supabase } = session;

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
          error: "تعذر تحميل صورة الرد",
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
        error: "تعذر تحميل صورة الرد",
      },
      { status: 500 }
    );
  }
}
