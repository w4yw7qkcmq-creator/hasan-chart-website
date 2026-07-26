import { verifyAdminSession } from "../../../lib/admin-auth";
import { dispatchAnalysisReplyAlerts } from "../../../lib/analysis-reply-dispatch";
import { enforceRateLimit } from "../../../lib/enforce-rate-limit";
import { requireValidUuid } from "../../../lib/partner-security";
import { adminMutationLimiter } from "../../../lib/rate-limit";
import { invalidateReadCache } from "../../../lib/server-read-cache";
import { trimText } from "../../../lib/text-sanitize";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(req) {
  try {
    const adminCheck = await verifyAdminSession();

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const rateLimited = await enforceRateLimit(
      adminMutationLimiter,
      String(adminCheck.user?.email || "admin").toLowerCase()
    );
    if (rateLimited) return rateLimited;

    const body = await req.json().catch(() => null);

    let requestId;

    try {
      requestId = requireValidUuid(body?.request_id, "request_id");
    } catch {
      return Response.json(
        { success: false, error: "رقم الطلب غير صالح." },
        { status: 400 }
      );
    }

    const reply = trimText(body?.reply, 8000);
    const replyImage = trimText(body?.reply_image, 2000);
    const userEmail = trimText(body?.user_email, 254).toLowerCase();
    const coin = trimText(body?.coin, 40).toUpperCase();

    if (!reply) {
      return Response.json(
        { success: false, error: "اكتب الرد أولاً." },
        { status: 400 }
      );
    }

    const supabase = adminCheck.supabase;

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

    invalidateReadCache("admin-dashboard:");

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
