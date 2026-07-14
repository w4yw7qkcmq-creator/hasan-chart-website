import { CACHE_PRIVATE_USER, jsonResponse } from "../../../lib/api-response";
import { requireSessionEmail } from "../../../lib/auth-session";
import { withReadCache } from "../../../lib/server-read-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

async function loadUserAnalysisRequests() {
  const session = await requireSessionEmail();

  if (session.error) {
    return jsonResponse(
      {
        success: false,
        error: "تعذر تحديد حساب المستخدم. سجّل الدخول من جديد.",
        requests: [],
      },
      { status: 401, cacheControl: CACHE_PRIVATE_USER }
    );
  }

  const { email: userEmail, supabase } = session;

  const { data: payload } = await withReadCache(`my-analysis:${userEmail}`, 8_000, async () => {
    const { data, error } = await supabase
      .from("analysis_requests")
      .select("id,user_email,username,coin,frame,status,reply,created_at")
      .eq("user_email", userEmail)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      throw new Error(error.message || "تعذر تحميل طلبات التحليل.");
    }

    return {
      success: true,
      requests: Array.isArray(data)
        ? data.map((item) => ({
            ...item,
            reply_image: null,
            replyImage: null,
            hasReplyImage: Boolean(item?.reply),
          }))
        : [],
    };
  });

  return jsonResponse(payload, { cacheControl: CACHE_PRIVATE_USER });
}

export async function GET() {
  try {
    return await loadUserAnalysisRequests();
  } catch (err) {
    console.error("MY ANALYSIS API CATCH ERROR:", err?.message || err);

    return jsonResponse(
      {
        success: false,
        error: "تعذر تحميل طلبات التحليل.",
        requests: [],
      },
      { status: 500, cacheControl: CACHE_PRIVATE_USER }
    );
  }
}

export async function POST() {
  return GET();
}
