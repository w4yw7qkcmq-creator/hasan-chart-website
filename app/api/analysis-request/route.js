import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

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

export async function GET(req) {
  try {
    const supabase = getSupabaseAdmin();

    const cookieStore = await cookies();
    const token = cookieStore.get("hc_access_token")?.value;

    if (!token) {
      return Response.json(
        {
          success: false,
          error: "يجب تسجيل الدخول أولاً",
        },
        { status: 401 }
      );
    }

    const user = await getAuthenticatedUser(supabase, token);
    const userEmail = String(user.email || "").trim().toLowerCase();

    if (!userEmail) {
      return Response.json(
        {
          success: false,
          error: "تعذر تحديد حساب المستخدم",
        },
        { status: 400 }
      );
    }

    const { data: latestRequest, error } = await supabase
      .from("analysis_requests")
      .select("created_at")
      .eq("user_email", userEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("ANALYSIS COOLDOWN GET ERROR:", error);

      return Response.json(
        {
          success: false,
          error: "تعذر التحقق من مدة الانتظار. جرّب مرة ثانية.",
          details: error,
        },
        { status: 500 }
      );
    }

    if (!latestRequest?.created_at) {
      return Response.json({
        success: true,
        blocked: false,
        text: "",
        remainingMs: 0,
        lastRequestAt: null,
      });
    }

    const lastRequestTime = new Date(latestRequest.created_at).getTime();
    const remainingMs = ANALYSIS_COOLDOWN_MS - (Date.now() - lastRequestTime);
    const blocked = Number.isFinite(remainingMs) && remainingMs > 0;

    return Response.json({
      success: true,
      blocked,
      text: blocked ? getCooldownText(remainingMs) : "",
      remainingMs: blocked ? remainingMs : 0,
      lastRequestAt: latestRequest.created_at,
    });
  } catch (err) {
    console.error("API GET ERROR:", err);

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

const getAuthenticatedUser = async (supabase, token) => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error("يجب تسجيل الدخول أولاً");
  }

  return user;
};

export async function POST(req) {
  try {
    const body = await req.json();

    const { coin, frame } = body;

    if (!coin || !frame) {
      return Response.json(
        {
          success: false,
          error: "البيانات ناقصة",
        },
        { status: 400 }
      );
    }
    const supabase = getSupabaseAdmin();

    const cookieStore = await cookies();
    const token = cookieStore.get("hc_access_token")?.value;

    if (!token) {
      return Response.json(
        {
          success: false,
          error: "يجب تسجيل الدخول أولاً",
        },
        { status: 401 }
      );
    }

    const user = await getAuthenticatedUser(supabase, token);

    const normalizedEmail = String(user.email || "")
      .trim()
      .toLowerCase();

    const username =
      user.user_metadata?.username ||
      user.user_metadata?.full_name ||
      user.email?.split("@")[0] ||
      "مستخدم";

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