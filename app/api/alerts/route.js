import { createClient } from "@supabase/supabase-js";

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

export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);

    const coin = normalizeText(body?.coin, 30).toUpperCase();
    const price = normalizeText(body?.price, 30);
    const user_email = normalizeText(body?.user_email, 120).toLowerCase();
    const username = normalizeText(body?.username, 120);
    const condition = normalizeText(body?.condition, 20) || "above";

    if (!coin || !price || !user_email) {
      return Response.json(
        {
          success: false,
          error: "العملة والسعر مطلوبان.",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("price_alerts")
      .insert([
        {
          user_email,
          username,
          coin,
          target_price: price,
          condition,
          status: "active",
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("ALERT INSERT ERROR:", error);

      return Response.json(
        {
          success: false,
          error: error.message || "فشل حفظ التنبيه.",
        },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      message: "تم إضافة التنبيه بنجاح ✅ وسيتم إرسال الإيميل فقط عند تحقق السعر.",
      alert: data,
    });
  } catch (err) {
    console.error("ALERT API ERROR:", err);

    return Response.json(
      {
        success: false,
        error: err?.message || "حدث خطأ أثناء إضافة التنبيه.",
      },
      { status: 500 }
    );
  }
}