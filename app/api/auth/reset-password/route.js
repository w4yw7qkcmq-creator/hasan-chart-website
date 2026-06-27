import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getClientIp,
  resetPasswordIpLimiter,
  RATE_LIMIT_ERROR,
} from "../../../../lib/rate-limit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function createAuthClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase auth configuration");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST(request) {
  try {
    const clientIp = getClientIp(request);
    const rateLimitResult = await resetPasswordIpLimiter(clientIp);

    if (!rateLimitResult.success) {
      return NextResponse.json({ error: RATE_LIMIT_ERROR }, { status: 429 });
    }

    const { email, redirectTo } = await request.json();

    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    if (!normalizedEmail) {
      return NextResponse.json(
        { error: "يرجى إدخال البريد الإلكتروني" },
        { status: 400 }
      );
    }

    const supabase = createAuthClient();
    const redirectUrl =
      String(redirectTo || "").trim() ||
      `${request.headers.get("origin") || ""}/login`;

    const { error } = await supabase.auth.resetPasswordForEmail(
      normalizedEmail,
      { redirectTo: redirectUrl }
    );

    if (error) {
      return NextResponse.json(
        { error: "حدث خطأ أثناء إرسال رابط تغيير كلمة المرور" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reset password API error");
    return NextResponse.json(
      { error: "حدث خطأ أثناء إرسال رابط تغيير كلمة المرور" },
      { status: 500 }
    );
  }
}
