import { createClient } from "@supabase/supabase-js";
import { requireSessionUser } from "../../../lib/auth-session";
import { alertLimiter, RATE_LIMIT_ERROR } from "../../../lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const getSupabaseAdmin = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "إعدادات السيرفر ناقصة: تأكد من إضافة NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في Vercel"
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

const normalizeText = (value, maxLength) => {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
};

const normalizeSymbol = (value) => {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
};

const toOkxInstId = (symbol) => {
  const cleanSymbol = normalizeSymbol(symbol);

  if (!cleanSymbol) {
    throw new Error("EMPTY_SYMBOL");
  }

  const base = cleanSymbol.endsWith("USDT")
    ? cleanSymbol.slice(0, -4)
    : cleanSymbol;

  if (!base) {
    throw new Error("EMPTY_SYMBOL");
  }

  return `${base}-USDT`;
};

const getOkxMarketPrice = async (symbol) => {
  const cleanSymbol = normalizeSymbol(symbol);

  if (!cleanSymbol) {
    throw new Error("EMPTY_SYMBOL");
  }

  const okxSymbol = toOkxInstId(symbol);

  const response = await fetch(
    `https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(okxSymbol)}`,
    {
      cache: "no-store",
    }
  );

  const data = await response.json().catch(() => null);
  const currentPrice = Number(data?.data?.[0]?.last);

  if (Number.isFinite(currentPrice)) {
    return currentPrice;
  }

  throw new Error(`تعذر جلب السعر الحالي لـ ${cleanSymbol}. تأكد من اسم العملة وحاول مرة أخرى.`);
};

const resolveAlertCondition = async ({ coin, targetPrice }) => {
  const target = Number(targetPrice);

  if (!Number.isFinite(target) || target <= 0) {
    throw new Error("السعر المستهدف غير صالح.");
  }

  const currentPrice = await getOkxMarketPrice(coin);

  return target >= currentPrice ? "above" : "below";
};

export async function GET() {
  try {
    const session = await requireSessionUser();
    const userEmail = String(session.user?.email || "").trim().toLowerCase();

    if (!userEmail) {
      return Response.json(
        { success: false, error: "يجب تسجيل الدخول أولاً." },
        { status: 401 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("price_alerts")
      .select("id, coin, target_price, condition, status, created_at")
      .ilike("user_email", userEmail)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(error.message || "تعذر تحميل التنبيهات.");
    }

    const alerts = (data || []).map((row) => ({
      id: row.id,
      coin: row.coin,
      price: row.target_price,
      condition: row.condition,
      status: row.status,
      createdAt: row.created_at,
    }));

    return Response.json({ success: true, alerts });
  } catch (err) {
    console.error("PRICE_ALERT_LIST_FAILED", err);

    return Response.json(
      {
        success: false,
        error: err?.message || "تعذر تحميل التنبيهات.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const session = await requireSessionUser();

    if (session.error) {
      return Response.json(
        {
          success: false,
          error: "يجب تسجيل الدخول أولاً.",
        },
        { status: 401 }
      );
    }

    const rateLimitResult = await alertLimiter(session.id);

    if (!rateLimitResult.success) {
      return Response.json(
        {
          success: false,
          error: RATE_LIMIT_ERROR,
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);

    const coin = normalizeText(body?.coin, 30).toUpperCase();
    const price = normalizeText(body?.price, 30);
    const user_email = session.email;
    const username = session.username;

    if (!coin || !price) {
      return Response.json(
        {
          success: false,
          error: "العملة والسعر مطلوبان.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    console.log("PRICE_ALERT_CREATE_START", {
      user_email,
      coin,
      price,
    });

    const resolvedCondition = await resolveAlertCondition({
      coin,
      targetPrice: Number(price),
    });

    const { data, error } = await supabase
      .from("price_alerts")
      .insert([
        {
          user_email,
          username,
          coin,
          target_price: price,
          condition: resolvedCondition,
          status: "active",
        },
      ])
      .select()
      .single();

    if (error || !data?.id) {
      console.error("PRICE_ALERT_CREATE_FAILED", error || "MISSING_INSERTED_ALERT_ID");

      return Response.json(
        {
          success: false,
          error: error?.message || "فشل حفظ التنبيه في قاعدة البيانات.",
        },
        { status: 500 }
      );
    }

    console.log("PRICE_ALERT_CREATE_SUCCESS", data);

    return Response.json({
      success: true,
      message: "تم إضافة التنبيه بنجاح ✅ وسيتم إرسال الإيميل فقط عند تحقق السعر.",
      alert: data,
    });
  } catch (err) {
    console.error("PRICE_ALERT_CREATE_FAILED", err);

    return Response.json(
      {
        success: false,
        error: err?.message || "حدث خطأ أثناء إضافة التنبيه.",
      },
      { status: 500 }
    );
  }
}