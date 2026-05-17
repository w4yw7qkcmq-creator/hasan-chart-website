import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const getSupabaseAdmin = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("إعدادات السيرفر ناقصة: تأكد من إضافة NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في Vercel Production");
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

export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);
    const email = normalizeEmail(body?.email);

    if (!email || !email.includes("@")) {
      return Response.json(
        {
          success: false,
          error: "لم يتم العثور على إيميل المستخدم. سجّل الدخول من جديد.",
          requests: [],
        },
        { status: 401 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("analysis_requests")
      .select("*")
      .ilike("user_email", email)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("MY ANALYSIS API ERROR:", error);

      return Response.json(
        {
          success: false,
          error: error.message || "تعذر تحميل طلبات التحليل.",
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
    console.error("MY ANALYSIS API CATCH ERROR:", err);

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
