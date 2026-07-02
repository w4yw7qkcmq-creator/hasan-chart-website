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

  throw new Error(`تعذر جلب سعر ${cleanSymbol} من OKX`);
};

const resolveAlertCondition = async ({ coin, targetPrice, condition }) => {
  const cleanCondition = String(condition || "auto")
    .trim()
    .toLowerCase();

  if (cleanCondition === "above" || cleanCondition === "below") {
    return cleanCondition;
  }

  const currentPrice = await getOkxMarketPrice(coin);

  return Number(targetPrice) >= currentPrice ? "above" : "below";
};

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
    const condition = normalizeText(body?.condition, 20) || "auto";
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

    console.log(
      "PRICE_ALERT_CREATE_START",
      JSON.stringify({
        user_email,
        coin,
        price,
        condition,
      })
    );

    const resolvedCondition = await resolveAlertCondition({
      coin,
      targetPrice: Number(price),
      condition,
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
      console.error(
        "PRICE_ALERT_CREATE_FAILED",
        JSON.stringify({
          user_email,
          coin,
          price,
          condition: resolvedCondition,
          error: error?.message || "MISSING_INSERTED_ALERT_ID",
        })
      );

      return Response.json(
        {
          success: false,
          error: error?.message || "فشل حفظ التنبيه في قاعدة البيانات.",
        },
        { status: 500 }
      );
    }

    console.log(
      "PRICE_ALERT_CREATE_SUCCESS",
      JSON.stringify({
        alertId: data.id,
        user_email,
        coin,
        price,
        condition: resolvedCondition,
        status: data.status || "active",
      })
    );

    return Response.json({
      success: true,
      message: "تم إضافة التنبيه بنجاح ✅ وسيتم إرسال الإيميل فقط عند تحقق السعر.",
      alert: data,
    });
  } catch (err) {
    console.error(
      "PRICE_ALERT_CREATE_FAILED",
      JSON.stringify({
        error: err?.message || String(err),
      })
    );

    return Response.json(
      {
        success: false,
        error: err?.message || "حدث خطأ أثناء إضافة التنبيه.",
      },
      { status: 500 }
    );
  }
}