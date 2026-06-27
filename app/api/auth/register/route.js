import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getClientIp,
  registerIpLimiter,
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
    const rateLimitResult = await registerIpLimiter(clientIp);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, error: RATE_LIMIT_ERROR },
        { status: 429 }
      );
    }

    const { email, password, username, telegram } = await request.json();

    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();
    const cleanUsername = String(username || "").trim();
    const cleanTelegram = String(telegram || "").trim();

    if (!normalizedEmail || !password || !cleanUsername) {
      return NextResponse.json(
        {
          success: false,
          error: "يرجى إدخال اسم المستخدم والبريد الإلكتروني وكلمة المرور",
        },
        { status: 400 }
      );
    }

    const supabase = createAuthClient();

    const { error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: String(password),
      options: {
        data: {
          username: cleanUsername,
          telegram: cleanTelegram,
          role: "user",
        },
      },
    });

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message || "حدث خطأ أثناء إنشاء الحساب",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Register API error");
    return NextResponse.json(
      { success: false, error: "حدث خطأ أثناء إنشاء الحساب" },
      { status: 500 }
    );
  }
}
