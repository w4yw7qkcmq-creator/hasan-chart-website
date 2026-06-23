import { getSupabaseAdmin } from "../../../../lib/auth-session";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    const endpoint = String(body?.endpoint || "").trim();

    if (!endpoint) {
      return Response.json(
        {
          success: false,
          error: "endpoint مطلوب",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);

    if (error) {
      console.error("PUSH_UNSUBSCRIBE_FAILED", error.message);
      return Response.json(
        {
          success: false,
          error: "تعذر إلغاء اشتراك الإشعارات",
        },
        { status: 500 }
      );
    }

    console.log("PUSH_UNSUBSCRIBE_SUCCESS", { endpoint });

    return Response.json({
      success: true,
    });
  } catch (error) {
    console.error("PUSH_UNSUBSCRIBE_ERROR", error?.message || error);
    return Response.json(
      {
        success: false,
        error: "خطأ في الخادم",
      },
      { status: 500 }
    );
  }
}
