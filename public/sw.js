const BROWSER_SOUND_CHANNEL = "hasan-chart-browser-sound";
const BROWSER_SOUND_MESSAGE_TYPE = "BROWSER_SOUND";
const SW_VERSION = "2026-07-03-browser-sound-v3";

const SOUND_TYPE_BY_PUSH = {
  "price-alert": "price-alert",
  "vip-spot": "vip-signal",
  "vip-futures": "vip-signal",
  "breaking-news": "breaking-news",
};

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
    signalId: null,
    newsId: null,
    sound: false,
    soundType: null,
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

  if (payload.signalId) {
    return `vip-signal-${payload.signalId}`;
  }

  if (payload.newsId) {
    return `breaking-news-${payload.newsId}`;
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

  if (payload.type === "vip-spot") {
    return "/vip-spot";
  }

  if (payload.type === "vip-futures") {
    return "/vip-futures";
  }

  if (payload.type === "breaking-news") {
    return "/news";
  }

  return "/notifications";
}

function resolveBrowserSoundType(payload, tag) {
  const explicit = String(payload.soundType || "").trim();
  if (explicit) {
    return explicit;
  }

  const pushType = String(payload.type || "").trim();
  if (SOUND_TYPE_BY_PUSH[pushType]) {
    return SOUND_TYPE_BY_PUSH[pushType];
  }

  const resolvedTag = String(tag || "");
  if (resolvedTag.startsWith("price-alert-")) return "price-alert";
  if (resolvedTag.startsWith("vip-signal-")) return "vip-signal";
  if (resolvedTag.startsWith("breaking-news-")) return "breaking-news";

  return null;
}

function shouldBroadcastBrowserSound(payload, tag) {
  if (payload.sound !== true) {
    return false;
  }

  return Boolean(resolveBrowserSoundType(payload, tag));
}

function broadcastBrowserSoundToClients(payload, tag) {
  const soundType = resolveBrowserSoundType(payload, tag);

  if (!soundType) {
    return Promise.resolve();
  }

  const message = {
    type: BROWSER_SOUND_MESSAGE_TYPE,
    soundType,
    alertId: payload.alertId ? String(payload.alertId) : null,
    signalId: payload.signalId ? String(payload.signalId) : null,
    newsId: payload.newsId ? String(payload.newsId) : null,
    sound: true,
    tag: tag || resolveNotificationTag(payload),
    swVersion: SW_VERSION,
  };

  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(BROWSER_SOUND_CHANNEL);
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
  const soundType = resolveBrowserSoundType(payload, tag);

  console.log(
    "SERVICE_WORKER_PUSH_RECEIVED",
    JSON.stringify({
      swVersion: SW_VERSION,
      type: payload.type || "general",
      tag,
      alertId: payload.alertId || null,
      signalId: payload.signalId || null,
      newsId: payload.newsId || null,
      soundType,
      sound: payload.sound === true,
      url: targetUrl,
      hasTitle: Boolean(payload.title),
      hasBody: Boolean(payload.body),
      willBroadcastSound: shouldBroadcastBrowserSound(payload, tag),
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
          signalId: payload.signalId ? String(payload.signalId) : null,
          newsId: payload.newsId ? String(payload.newsId) : null,
          soundType,
          sound: payload.sound === true,
        },
      }),
      broadcastBrowserSoundToClients(payload, tag),
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
