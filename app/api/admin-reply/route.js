import { createClient } from "@supabase/supabase-js";
import { verifyAdminSession } from "../../../lib/admin-auth";
import { dispatchAnalysisReplyAlerts } from "../../../lib/analysis-reply-dispatch";
import { sendAnalysisReadyPush } from "../../../lib/push-notifications";

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

const normalizeText = (value, maxLength) => {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
};

export async function POST(req) {
  try {
    const adminCheck = await verifyAdminSession();

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const body = await req.json().catch(() => null);

    const requestId = body?.request_id;
    const reply = normalizeText(body?.reply, 8000);
    const replyImage = normalizeText(body?.reply_image, 2000);
    const userEmail = normalizeText(body?.user_email, 254).toLowerCase();
    const coin = normalizeText(body?.coin, 40).toUpperCase();

    if (!requestId) {
      return Response.json(
        { success: false, error: "رقم الطلب غير موجود." },
        { status: 400 }
      );
    }

    if (!reply) {
      return Response.json(
        { success: false, error: "اكتب الرد أولاً." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: updatedRequest, error: updateError } = await supabase
      .from("analysis_requests")
      .update({
        status: "مكتمل",
        job_status: "completed",
        reply,
        reply_image: replyImage,
        completed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", requestId)
      .select("id, user_email, coin, reply")
      .single();

    if (updateError) {
      console.error("ADMIN REPLY UPDATE ERROR:", updateError);

      return Response.json(
        {
          success: false,
          error: updateError.message || "فشل حفظ الرد.",
          details: updateError,
        },
        { status: 500 }
      );
    }

    const emailTarget = updatedRequest?.user_email || userEmail;
    const coinTarget = updatedRequest?.coin || coin;

    const alertResult = await dispatchAnalysisReplyAlerts({
      supabase,
      userEmail: emailTarget,
      coin: coinTarget,
      reply,
      requestId,
    });

    await sendAnalysisReadyPush({
      supabase,
      email: emailTarget,
      coin: coinTarget,
      requestId,
    });

    return Response.json({
      success: true,
      message: alertResult.emailResult?.sent
        ? "تم حفظ الرد وإرسال الإيميل بنجاح ✅"
        : "تم حفظ الرد داخل الموقع بنجاح ✅ لكن لم يتم إرسال الإيميل.",
      notificationCreated: alertResult.notificationCreated,
      email: alertResult.emailResult,
    });
  } catch (err) {
    console.error("ADMIN REPLY API ERROR:", err);

    return Response.json(
      {
        success: false,
        error: err?.message || "حدث خطأ غير متوقع أثناء إرسال الرد.",
      },
      { status: 500 }
    );
  }
}
