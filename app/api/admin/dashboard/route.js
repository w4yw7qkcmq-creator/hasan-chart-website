

import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("hc_access_token")?.value;

    if (!token) {
      return Response.json(
        { success: false, error: "يجب تسجيل الدخول أولاً" },
        { status: 401 }
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return Response.json(
        { success: false, error: "جلسة غير صالحة" },
        { status: 401 }
      );
    }

    const adminEmails = [
      "msjdudieneign@gmail.com",
    ];

    if (!adminEmails.includes((user.email || "").toLowerCase())) {
      return Response.json(
        { success: false, error: "غير مصرح لك بالدخول" },
        { status: 403 }
      );
    }

    const [analysis, accounts, subscriptions, profiles] = await Promise.all([
      supabase.from("analysis_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("account_management_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("subscription_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("*"),
    ]);

    return Response.json({
      success: true,
      analysis_requests: analysis.data || [],
      account_management_requests: accounts.data || [],
      subscription_requests: subscriptions.data || [],
      profiles: profiles.data || [],
    });
  } catch (error) {
    console.error("Admin dashboard API error:", error);

    return Response.json(
      {
        success: false,
        error: "حدث خطأ أثناء تحميل البيانات",
      },
      { status: 500 }
    );
  }
}