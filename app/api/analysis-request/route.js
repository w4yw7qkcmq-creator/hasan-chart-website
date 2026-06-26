import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { enforceRateLimit } from "../../../lib/enforce-rate-limit";
import {
  analysisReadLimiter,
  analysisRequestLimiter,
  getClientIp,
  RATE_LIMIT_ERROR,
} from "../../../lib/rate-limit";

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

const FRAME_ALIASES = {
  "1m": ["1m", "1 min", "1 minute", "دقيقة", "دقيقة واحدة", "١ دقيقة"],
  "3m": ["3m", "3 min", "3 minutes", "3 دقائق", "٣ دقائق"],
  "5m": ["5m", "5 min", "5 minutes", "5 دقائق", "٥ دقائق"],
  "15m": ["15m", "15 min", "15 minutes", "15 دقيقة", "١٥ دقيقة", "ربع ساعة"],
  "30m": ["30m", "30 min", "30 minutes", "30 دقيقة", "٣٠ دقيقة", "نصف ساعة"],
  "45m": ["45m", "45 min", "45 minutes", "45 دقيقة", "٤٥ دقيقة"],
  "1h": ["1h", "1 hour", "hour", "ساعة", "ساعة واحدة", "١ ساعة"],
  "2h": ["2h", "2 hour", "2 hours", "ساعتين", "2 ساعة", "٢ ساعة"],
  "3h": ["3h", "3 hour", "3 hours", "ثلاث ساعات", "3 ساعات", "٣ ساعات"],
  "4h": ["4h", "4 hour", "4 hours", "أربع ساعات", "اربع ساعات", "4 ساعات", "٤ ساعات"],
  "6h": ["6h", "6 hour", "6 hours", "ست ساعات", "6 ساعات", "٦ ساعات"],
  "8h": ["8h", "8 hour", "8 hours", "ثمان ساعات", "8 ساعات", "٨ ساعات"],
  "12h": ["12h", "12 hour", "12 hours", "12 ساعة", "١٢ ساعة", "اثنا عشر ساعة", "إثنا عشر ساعة"],
  "1d": ["1d", "1 day", "day", "daily", "يوم", "يومي", "يوم واحد", "١ يوم"],
  "2d": ["2d", "2 day", "2 days", "يومين", "2 يوم", "٢ يوم"],
  "3d": ["3d", "3 day", "3 days", "ثلاثة أيام", "3 أيام", "٣ أيام"],
  "4d": ["4d", "4 day", "4 days", "أربعة أيام", "اربعة أيام", "4 أيام", "٤ أيام"],
  "1w": ["1w", "1 week", "week", "weekly", "أسبوع", "اسبوع", "أسبوعي", "اسبوعي", "١ أسبوع"],
  "2w": ["2w", "2 week", "2 weeks", "أسبوعين", "اسبوعين", "2 أسبوع", "٢ أسبوع"],
  "1M": ["1M", "1 month", "month", "monthly", "شهر", "شهري", "شهر واحد", "١ شهر"],
  "2M": ["2M", "2 month", "2 months", "شهرين", "2 شهر", "٢ شهر"],
  "3M": ["3M", "3 month", "3 months", "ثلاثة أشهر", "3 أشهر", "٣ أشهر"],
  "6M": ["6M", "6 month", "6 months", "ستة أشهر", "6 أشهر", "٦ أشهر"],
  "1y": ["1y", "1 year", "year", "yearly", "سنة", "سنوي", "سنة واحدة", "عام", "١ سنة"],
};

const FRAME_LOOKUP = new Map(
  Object.entries(FRAME_ALIASES).flatMap(([canonicalFrame, aliases]) =>
    aliases.map((alias) => [alias.toLowerCase(), canonicalFrame])
  )
);

const SUPPORTED_FRAME_CODES = new Set(Object.keys(FRAME_ALIASES));

const safeJson = async (req) => {
  try {
    return await req.json();
  } catch {
    return null;
  }
};

const normalizeCoin = (value) => {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._:-]/g, "")
    .slice(0, 30);
};

const normalizeFrameInput = (value) => {
  return String(value || "")
    .trim()
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/\s+/g, " ")
    .slice(0, 50);
};

const normalizeFrame = (value) => {
  const rawFrame = normalizeFrameInput(value);
  const lowerFrame = rawFrame.toLowerCase();

  if (FRAME_LOOKUP.has(lowerFrame)) return FRAME_LOOKUP.get(lowerFrame);

  const compactFrame = lowerFrame.replace(/\s+/g, "");
  if (FRAME_LOOKUP.has(compactFrame)) return FRAME_LOOKUP.get(compactFrame);

  const hourMatch = lowerFrame.match(/^(\d+)\s*(h|hour|hours|ساعة|ساعات)$/);
  if (hourMatch) return `${hourMatch[1]}h`;

  const dayMatch = lowerFrame.match(/^(\d+)\s*(d|day|days|يوم|أيام|ايام)$/);
  if (dayMatch) return `${dayMatch[1]}d`;

  const weekMatch = lowerFrame.match(/^(\d+)\s*(w|week|weeks|أسبوع|اسبوع|أسابيع|اسابيع)$/);
  if (weekMatch) return `${weekMatch[1]}w`;

  const monthMatch = lowerFrame.match(/^(\d+)\s*(mth|month|months|شهر|أشهر|اشهر)$/);
  if (monthMatch) return `${monthMatch[1]}M`;

  const yearMatch = lowerFrame.match(/^(\d+)\s*(y|year|years|سنة|سنوات|عام)$/);
  if (yearMatch) return `${yearMatch[1]}y`;

  return "";
};

const getCooldownText = (remainingMs) => {
  const safeRemaining = Math.max(0, Number(remainingMs) || 0);
  const hours = Math.floor(safeRemaining / (60 * 60 * 1000));
  const minutes = Math.ceil((safeRemaining % (60 * 60 * 1000)) / (60 * 1000));

  return `يمكنك إرسال طلب تحليل جديد بعد ${hours} ساعة و ${minutes} دقيقة`;
};

export async function GET(req) {
  try {
    const rateLimited = await enforceRateLimit(analysisReadLimiter, getClientIp(req));
    if (rateLimited) return rateLimited;

    const supabase = getSupabaseAdmin();

    const cookieStore = await cookies();
    const token = cookieStore.get("hc_access_token")?.value;

    if (!token) {
      return Response.json({
        success: true,
        blocked: false,
        text: "",
        remainingMs: 0,
        lastRequestAt: null,
      });
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
      console.error("ANALYSIS COOLDOWN GET ERROR:", error?.message || error);

      return Response.json({
        success: true,
        blocked: false,
        text: "",
        remainingMs: 0,
        lastRequestAt: null,
        warning: "تعذر التحقق من مدة الانتظار حالياً.",
      });
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
    console.error("API GET ERROR:", err?.message || err);

    return Response.json({
      success: true,
      blocked: false,
      text: "",
      remainingMs: 0,
      lastRequestAt: null,
      warning: "تعذر التحقق من مدة الانتظار حالياً.",
    });
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
    const body = await safeJson(req);

    if (!body || typeof body !== "object") {
      return Response.json(
        {
          success: false,
          error: "صيغة الطلب غير صالحة",
        },
        { status: 400 }
      );
    }

    const coin = normalizeCoin(body.coin);
    const frame = normalizeFrame(body.frame);

    if (!coin || !frame) {
      return Response.json(
        {
          success: false,
          error: "البيانات ناقصة",
        },
        { status: 400 }
      );
    }

    if (coin.length < 2 || coin.length > 30) {
      return Response.json(
        {
          success: false,
          error: "رمز العملة غير صالح",
        },
        { status: 400 }
      );
    }

    if (!frame || !SUPPORTED_FRAME_CODES.has(frame)) {
      return Response.json(
        {
          success: false,
          error: "الفريم الزمني غير مدعوم. يمكنك كتابة الفريم بالعربي أو الإنجليزي مثل: 1h، 12 hours، 12 ساعة، يوم، أسبوع، شهر، شهرين، سنة.",
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

    if (!user?.id || !user?.email) {
      return Response.json(
        {
          success: false,
          error: "تعذر تحديد حساب المستخدم",
        },
        { status: 401 }
      );
    }

    const rateLimitResult = await analysisRequestLimiter(user.id);

    if (!rateLimitResult.success) {
      return Response.json(
        {
          success: false,
          error: RATE_LIMIT_ERROR,
        },
        { status: 429 }
      );
    }

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
      console.error("ANALYSIS COOLDOWN CHECK ERROR:", latestRequestError?.message || latestRequestError);

      return Response.json(
        {
          success: false,
          error: "تعذر التحقق من مدة الانتظار. جرّب مرة ثانية.",
          details: undefined,
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

    const duplicateWindow = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: duplicateRequest, error: duplicateError } = await supabase
      .from("analysis_requests")
      .select("id")
      .eq("user_email", normalizedEmail)
      .eq("coin", coin)
      .eq("frame", frame)
      .gte("created_at", duplicateWindow)
      .limit(1)
      .maybeSingle();

    if (duplicateError) {
      console.error("ANALYSIS DUPLICATE CHECK ERROR:", duplicateError?.message || duplicateError);
    }

    if (duplicateRequest?.id) {
      return Response.json(
        {
          success: false,
          error: "تم إرسال نفس طلب التحليل قبل قليل. يرجى الانتظار.",
        },
        { status: 429 }
      );
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
      console.error("ANALYSIS INSERT ERROR:", error?.message || error);

      return Response.json(
        {
          success: false,
          error: "تعذر إرسال طلب التحليل حالياً.",
          details: undefined,
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
    console.error("API ERROR:", err?.message || err);

    return Response.json(
      {
        success: false,
        error: err?.message || "حدث خطأ أثناء إرسال طلب التحليل.",
        details: undefined,
      },
      { status: 500 }
    );
  }
}