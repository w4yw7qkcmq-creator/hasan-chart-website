import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const getSupabaseAdmin = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "إعدادات السيرفر ناقصة: تأكد من إضافة NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في Vercel Production"
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

const normalizeEmail = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const getAuthenticatedUser = async (supabase, token) => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error("جلسة تسجيل الدخول غير صالحة. سجّل الدخول من جديد.");
  }

  return user;
};

export async function GET() {
  return POST();
}

export async function POST(req) {
  try {
    const supabase = getSupabaseAdmin();
    const body = req ? await req.json().catch(() => ({})) : {};

    let userEmail = normalizeEmail(body?.email || body?.user_email);

    if (!userEmail) {
      const cookieStore = await cookies();
      const token = cookieStore.get("hc_access_token")?.value;

      if (token) {
        try {
          const user = await getAuthenticatedUser(supabase, token);
          userEmail = normalizeEmail(user.email);
        } catch (authError) {
          console.warn("MY ANALYSIS AUTH FALLBACK:", authError?.message || authError);
        }
      }
    }

    if (!userEmail || !userEmail.includes("@")) {
      return Response.json(
        {
          success: false,
          error: "تعذر تحديد حساب المستخدم. سجّل الدخول من جديد.",
          requests: [],
        },
        { status: 401 }
      );
    }

    const { data, error } = await supabase
      .from("analysis_requests")
      .select(
        "id,user_email,username,coin,frame,status,reply,reply_image,created_at"
      )
      .eq("user_email", userEmail)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      console.error("MY ANALYSIS API ERROR:", error?.message || error);

      return Response.json(
        {
          success: false,
          error: "تعذر تحميل طلبات التحليل.",
          requests: [],
        },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      requests: Array.isArray(data) ? data : [],
    });
  } catch (err) {
    console.error("MY ANALYSIS API CATCH ERROR:", err?.message || err);

    return Response.json(
      {
        success: false,
        error: err?.message || "حدث خطأ أثناء تحميل طلبات التحليل.",
        requests: [],
      },
      { status: 500 }
    );
  }
}
