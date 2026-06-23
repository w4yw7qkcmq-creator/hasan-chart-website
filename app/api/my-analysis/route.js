import { requireSessionEmail } from "../../../lib/auth-session";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

async function loadUserAnalysisRequests() {
  const session = await requireSessionEmail();

  if (session.error) {
    return Response.json(
      {
        success: false,
        error: "تعذر تحديد حساب المستخدم. سجّل الدخول من جديد.",
        requests: [],
      },
      { status: 401 }
    );
  }

  const { email: userEmail, supabase } = session;

  const { data, error } = await supabase
    .from("analysis_requests")
    .select("id,user_email,username,coin,frame,status,reply,created_at")
    .eq("user_email", userEmail)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("MY ANALYSIS API ERROR:", error?.message || error);

    return Response.json(
      {
        success: false,
        error: "تعذر تحميل طلبات التحليل.",
        requests: [],
      },
      { status: 500 }
    );
  }

  return Response.json({
    success: true,
    requests: Array.isArray(data)
      ? data.map((item) => ({
          ...item,
          reply_image: null,
          replyImage: null,
          hasReplyImage: Boolean(item?.reply),
        }))
      : [],
  });
}

export async function GET() {
  try {
    return await loadUserAnalysisRequests();
  } catch (err) {
    console.error("MY ANALYSIS API CATCH ERROR:", err?.message || err);

    return Response.json(
      {
        success: false,
        error: err?.message || "حدث خطأ أثناء تحميل طلبات التحليل.",
        requests: [],
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  return GET();
}
