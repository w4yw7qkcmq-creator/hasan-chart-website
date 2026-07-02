const PRICE_ALERT_CHANNEL = "hasan-chart-price-alert";
const SW_VERSION = "2026-06-23-price-alert-v1";

function parsePushPayload(event) {
  const defaults = {
    title: "HasaN CharT World",
    body: "وصلك إشعار جديد",
    url: "/notifications",
    icon: "/logo.png",
    badge: "/logo.png",
    type: "general",
    tag: null,
    alertId: null,
    sound: false,
  };

  if (!event.data) {
    return defaults;
  }

  try {
    return { ...defaults, ...event.data.json() };
  } catch (_error) {
    return {
      ...defaults,
      body: event.data.text() || defaults.body,
    };
  }
}

function resolveNotificationTag(payload) {
  if (payload.tag) {
    return String(payload.tag);
  }

  if (payload.alertId) {
    return `price-alert-${payload.alertId}`;
  }

  return `hasan-chart-push-${Date.now()}`;
}

function resolveNotificationUrl(payload) {
  const rawUrl = String(payload.url || "").trim();

  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    try {
      const parsed = new URL(rawUrl);
      return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/notifications";
    } catch (_error) {
      return "/notifications";
    }
  }

  if (rawUrl.startsWith("/")) {
    return rawUrl;
  }

  if (payload.type === "price-alert") {
    return "/notifications";
  }

  return "/notifications";
}

function broadcastPriceAlertToClients(payload) {
  if (payload.type !== "price-alert" || payload.sound !== true) {
    return Promise.resolve();
  }

  const message = {
    type: "price-alert",
    alertId: payload.alertId ? String(payload.alertId) : null,
    sound: true,
    tag: resolveNotificationTag(payload),
    swVersion: SW_VERSION,
  };

  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(PRICE_ALERT_CHANNEL);
    channel.postMessage(message);
    channel.close();
  }

  return self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((windowClients) => {
      windowClients.forEach((client) => {
        client.postMessage(message);
      });
    })
    .catch(() => undefined);
}

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);
  const tag = resolveNotificationTag(payload);
  const targetUrl = resolveNotificationUrl(payload);

  console.log(
    "SERVICE_WORKER_PUSH_RECEIVED",
    JSON.stringify({
      swVersion: SW_VERSION,
      type: payload.type || "general",
      tag,
      alertId: payload.alertId || null,
      sound: payload.sound === true,
      url: targetUrl,
      hasTitle: Boolean(payload.title),
      hasBody: Boolean(payload.body),
    })
  );

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title || "HasaN CharT World", {
        body: payload.body || "",
        icon: payload.icon || "/logo.png",
        badge: payload.badge || "/logo.png",
        dir: "rtl",
        lang: "ar",
        tag,
        renotify: true,
        data: {
          url: targetUrl,
          type: payload.type || "general",
          alertId: payload.alertId ? String(payload.alertId) : null,
          sound: payload.sound === true,
        },
      }),
      broadcastPriceAlertToClients(payload),
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const notificationData = event.notification?.data || {};
  let targetUrl = notificationData.url || "/notifications";

  if (!targetUrl.startsWith("/")) {
    targetUrl = resolveNotificationUrl({
      url: targetUrl,
      type: notificationData.type,
    });
  }

  if (notificationData.type === "price-alert" && targetUrl === "/") {
    targetUrl = "/notifications";
  }

  const absoluteTarget = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (!client.url.startsWith(self.location.origin)) {
            continue;
          }

          if ("focus" in client) {
            if ("navigate" in client) {
              return client.navigate(absoluteTarget).then(() => client.focus());
            }

            return client.focus();
          }
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(absoluteTarget);
        }

        return undefined;
      })
  );
});
