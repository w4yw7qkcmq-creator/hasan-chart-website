import webpush from "web-push";

let configured = false;

export function isWebPushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim() &&
      process.env.VAPID_SUBJECT?.trim()
  );
}

export function configureWebPush() {
  if (configured || !isWebPushConfigured()) {
    return configured;
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT.trim(),
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY.trim(),
    process.env.VAPID_PRIVATE_KEY.trim()
  );

  configured = true;
  return true;
}

export function toWebPushSubscription(row) {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
  };
}

export async function sendWebPushNotification(subscriptionRow, payload) {
  if (!configureWebPush()) {
    return {
      success: false,
      skipped: true,
      error: "WEB_PUSH_NOT_CONFIGURED",
    };
  }

  try {
    const response = await webpush.sendNotification(
      toWebPushSubscription(subscriptionRow),
      JSON.stringify(payload)
    );

    return {
      success: true,
      statusCode: response?.statusCode || 201,
    };
  } catch (error) {
    return {
      success: false,
      statusCode: error?.statusCode || null,
      message: error?.message || null,
      body: error?.body || null,
      error: error?.body || error?.message || "WEB_PUSH_SEND_FAILED",
    };
  }
}
