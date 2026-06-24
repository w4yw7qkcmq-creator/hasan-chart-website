import { getSupabaseAdmin } from "../../../lib/auth-session";
import { configureWebPush, sendWebPushNotification } from "../../../lib/push-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TEST_TITLE = "🔔 اختبار إشعارات المتصفح";
const TEST_BODY = "تم إرسال إشعار الاختبار بنجاح من HasaN CharT World";
const TEST_URL = "https://www.hasanchartworld.com";

export async function POST() {
  console.log(
    `TEST_PUSH_ROUTE_HIT ${JSON.stringify({
      ts: new Date().toISOString(),
      route: "/api/test-push",
    })}`
  );

  try {
    if (!configureWebPush()) {
      return Response.json(
        {
          success: false,
          error: "WEB_PUSH_NOT_CONFIGURED",
        },
        { status: 500 }
      );
    }

    const supabase = getSupabaseAdmin();

    console.log(
      `ALERT_PUSH_START ${JSON.stringify({
        alertId: "test-push",
        test: true,
        scope: "all_subscriptions",
      })}`
    );

    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, email, anonymous_id, user_id");

    if (error) {
      console.error(
        `ALERT_PUSH_FAILED ${JSON.stringify({
          alertId: "test-push",
          error: error.message,
        })}`
      );

      return Response.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    const subscriptionList = subscriptions || [];

    console.log(
      `ALERT_PUSH_SUBSCRIPTIONS_FOUND ${JSON.stringify({
        alertId: "test-push",
        count: subscriptionList.length,
        subscriptionIds: subscriptionList.map((row) => row.id),
      })}`
    );

    if (subscriptionList.length === 0) {
      console.error(
        `ALERT_PUSH_FAILED ${JSON.stringify({
          alertId: "test-push",
          error: "NO_PUSH_SUBSCRIPTIONS",
        })}`
      );

      return Response.json(
        {
          success: false,
          error: "NO_PUSH_SUBSCRIPTIONS",
        },
        { status: 404 }
      );
    }

    const payload = {
      title: TEST_TITLE,
      body: TEST_BODY,
      url: TEST_URL,
      icon: "/logo.png",
      type: "test-push",
      tag: "test-push-all",
    };

    let sent = 0;
    let failed = 0;
    const failures = [];

    for (const subscriptionRow of subscriptionList) {
      const outcome = await sendWebPushNotification(subscriptionRow, payload);

      if (outcome.success) {
        sent += 1;
        console.log(
          `ALERT_PUSH_SENT ${JSON.stringify({
            alertId: "test-push",
            subscriptionId: subscriptionRow.id,
            email: subscriptionRow.email || null,
          })}`
        );
        continue;
      }

      failed += 1;
      failures.push({
        subscriptionId: subscriptionRow.id,
        error: outcome.error,
        statusCode: outcome.statusCode || null,
      });

      console.error(
        `ALERT_PUSH_FAILED ${JSON.stringify({
          alertId: "test-push",
          subscriptionId: subscriptionRow.id,
          error: outcome.error,
          statusCode: outcome.statusCode || null,
        })}`
      );

      if (outcome.statusCode === 404 || outcome.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", subscriptionRow.id);
      }
    }

    return Response.json({
      success: true,
      message: "تم إرسال إشعار الاختبار",
      stats: {
        total: subscriptionList.length,
        sent,
        failed,
        failures,
      },
    });
  } catch (error) {
    console.error(
      `TEST_PUSH_ROUTE_FAILED ${JSON.stringify({
        error: error?.message || String(error),
      })}`
    );

    return Response.json(
      {
        success: false,
        error: error?.message || "TEST_PUSH_FAILED",
      },
      { status: 500 }
    );
  }
}
