import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const getSupabaseAdmin = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("إعدادات السيرفر ناقصة: تأكد من إضافة SUPABASE_SERVICE_ROLE_KEY في Vercel Production");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      user_email,
      username,
      coin,
      frame,
    } = body;

    if (!user_email || !coin || !frame) {
      return Response.json(
        {
          success: false,
          error: "البيانات ناقصة",
        },
        { status: 400 }
      );
    }
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from("analysis_requests")
      .insert([
        {
          user_email,
          username,
          coin,
          frame,
          status: "بانتظار المعالجة",
          job_status: "pending",
          attempts: 0,
          reply: "",
          reply_image: "",
        },
      ]);

    if (error) {
      console.error("ANALYSIS INSERT ERROR:", error);

      return Response.json(
        {
          success: false,
          error: error.message,
          details: error,
        },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      message: "تم استلام طلب التحليل بنجاح ✅",
    });
  } catch (err) {
    console.error("API ERROR:", err);

    return Response.json(
      {
        success: false,
        error: err.message || "Server Error",
        details: err,
      },
      { status: 500 }
    );
  }
}