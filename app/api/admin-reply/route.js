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

const normalizeText = (value, maxLength) => {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
};

const escapeHtml = (value) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("\n", "<br />");

const sendEmailNotification = async ({ email, coin, reply }) => {
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey || !email) {
    return {
      sent: false,
      reason: !resendApiKey ? "Missing RESEND_API_KEY" : "Missing user email",
    };
  }

  const safeCoin = escapeHtml(coin);
  const safeReply = escapeHtml(reply);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: "HasaN CharT World <alerts@hasanchartworld.com>",
      to: email,
      subject: `📩 تم الرد على تحليل ${safeCoin}`,
      html: `
<div style="margin:0;padding:0;background:#f1f7ff;font-family:Arial,Tahoma,sans-serif;direction:rtl;text-align:right;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f1f7ff;margin:0;padding:0;width:100%;">
    <tr>
      <td align="center" style="padding:22px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:560px;background:#ffffff;border:1px solid #dbeafe;border-radius:22px;overflow:hidden;box-shadow:0 14px 40px rgba(37,99,235,0.12);">
          <tr>
            <td style="padding:0;">
              <div style="background:linear-gradient(135deg,#38bdf8,#2563eb);padding:28px 22px;text-align:center;">
                <div style="display:inline-block;background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.35);border-radius:999px;padding:9px 16px;color:#ffffff;font-size:13px;font-weight:800;letter-spacing:0.3px;white-space:nowrap;">
                  HasaN CharT World
                </div>
                <h1 style="margin:18px 0 0;color:#ffffff;font-size:26px;line-height:1.45;font-weight:900;text-align:center;">
                  تم الرد على طلب التحليل
                </h1>
                <p style="margin:8px 0 0;color:#e0f2fe;font-size:14px;line-height:1.8;text-align:center;">
                  يمكنك مشاهدة الرد الكامل داخل حسابك في المنصة
                </p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 18px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#eaf6ff;border:1px solid #bae6fd;border-radius:18px;">
                <tr>
                  <td style="padding:18px;text-align:center;">
                    <div style="color:#475569;font-size:13px;font-weight:700;margin-bottom:8px;">العملة المطلوبة</div>
                    <div style="color:#0f172a;font-size:30px;line-height:1.25;font-weight:900;word-break:break-word;">
                      ${safeCoin}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 18px 6px;">
              <div style="background:#f8fbff;border:1px solid #dbeafe;border-radius:18px;padding:18px;color:#0f172a;font-size:16px;line-height:2.05;font-weight:600;word-break:break-word;">
                ${safeReply}
              </div>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:22px 18px 28px;">
              <a href="https://www.hasanchartworld.com/my-analysis" style="display:inline-block;background:linear-gradient(135deg,#22d3ee,#2563eb);color:#ffffff;text-decoration:none;padding:15px 28px;border-radius:16px;font-size:16px;font-weight:900;line-height:1;white-space:nowrap;box-shadow:0 10px 24px rgba(37,99,235,0.25);">
                مشاهدة الرد داخل المنصة
              </a>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 18px;background:#f8fbff;border-top:1px solid #e2e8f0;text-align:center;color:#64748b;font-size:12px;line-height:1.8;">
              <div style="font-weight:800;color:#334155;white-space:nowrap;">HasaN CharT World</div>
              <div>Trading Intelligence Platform</div>
              <div>© 2026 جميع الحقوق محفوظة</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
      `,
    }),
  });

  const data = await response.json().catch(() => null);

  return {
    sent: response.ok,
    status: response.status,
    data,
  };
};

export async function POST(req) {
  try {
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

    const emailResult = await sendEmailNotification({
      email: emailTarget,
      coin: coinTarget,
      reply,
    });

    return Response.json({
      success: true,
      message: emailResult.sent
        ? "تم حفظ الرد وإرسال الإيميل بنجاح ✅"
        : "تم حفظ الرد داخل الموقع بنجاح ✅ لكن لم يتم إرسال الإيميل.",
      email: emailResult,
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