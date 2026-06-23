self.addEventListener("push", (event) => {
  let payload = {
    title: "HasaN CharT World",
    body: "وصلك إشعار جديد",
    url: "/",
    icon: "/logo.png",
  };

  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch (_error) {
    if (event.data) {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "HasaN CharT World", {
      body: payload.body || "",
      icon: payload.icon || "/logo.png",
      badge: payload.badge || "/logo.png",
      dir: "rtl",
      lang: "ar",
      tag: payload.tag || "hasan-chart-push",
      renotify: true,
      data: {
        url: payload.url || "/",
        type: payload.type || "general",
      },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }

        return undefined;
      })
  );
});
