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

const ANALYSIS_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const getCooldownText = (remainingMs) => {
  const safeRemaining = Math.max(0, Number(remainingMs) || 0);
  const hours = Math.floor(safeRemaining / (60 * 60 * 1000));
  const minutes = Math.ceil((safeRemaining % (60 * 60 * 1000)) / (60 * 1000));

  return `يمكنك إرسال طلب تحليل جديد بعد ${hours} ساعة و ${minutes} دقيقة`;
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

    const normalizedEmail = String(user_email || "").trim().toLowerCase();

    const { data: latestRequest, error: latestRequestError } = await supabase
      .from("analysis_requests")
      .select("created_at")
      .eq("user_email", normalizedEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestRequestError) {
      console.error("ANALYSIS COOLDOWN CHECK ERROR:", latestRequestError);

      return Response.json(
        {
          success: false,
          error: "تعذر التحقق من مدة الانتظار. جرّب مرة ثانية.",
          details: latestRequestError,
        },
        { status: 500 }
      );
    }

    if (latestRequest?.created_at) {
      const lastRequestTime = new Date(latestRequest.created_at).getTime();
      const remainingMs = ANALYSIS_COOLDOWN_MS - (Date.now() - lastRequestTime);

      if (Number.isFinite(remainingMs) && remainingMs > 0) {
        return Response.json(
          {
            success: false,
            error: getCooldownText(remainingMs),
            remainingMs,
            lastRequestAt: latestRequest.created_at,
          },
          { status: 429 }
        );
      }
    }

    const { data: insertedRequest, error } = await supabase
      .from("analysis_requests")
      .insert([
        {
          user_email: normalizedEmail,
          username,
          coin,
          frame,
          status: "بانتظار المعالجة",
          job_status: "pending",
          attempts: 0,
          reply: "",
          reply_image: "",
        },
      ])
      .select("id, created_at")
      .single();

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
      data: insertedRequest,
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