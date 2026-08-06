"use client";
export function WebhookStatusBanner({ webhook = {} }) {
  const {
    webhookConnected = false,
    webhookSecretConfigured = false,
    webhookUrl = "/api/webhooks/resend",
    lastWebhookEventLabel = null,
    lastWebhookEventType = null,
  } = webhook;
  if (webhookConnected) {
    return (
      <section className="admin-banner-success rounded-[28px] p-5 shadow-lg">
        {" "}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {" "}
          <div>
            {" "}
            <h2 className="text-lg font-black">✅ Webhook متصل ويعمل</h2>{" "}
            <p className="mt-2 text-sm leading-7 ui-text-positive">
              {" "}
              يتم استقبال أحداث Resend بنجاح وتخزينها في لوحة التحليلات.{" "}
            </p>{" "}
          </div>{" "}
          <div className="rounded-2xl border admin-panel-border ui-glass-solid/80 px-4 py-3 text-sm">
            {" "}
            <p className="font-bold ui-text-positive">آخر Webhook Event</p>{" "}
            <p className="mt-1 font-black ui-text-positive">
              {" "}
              {lastWebhookEventLabel || "—"}{" "}
            </p>{" "}
            {lastWebhookEventType ? (
              <p className="mt-1 text-xs font-bold ui-text-positive">
                {" "}
                {lastWebhookEventType}{" "}
              </p>
            ) : null}{" "}
          </div>{" "}
        </div>{" "}
      </section>
    );
  }
  return (
    <section className="ui-panel-warning rounded-[28px] p-5 shadow-lg">
      {" "}
      <h2 className="text-lg font-black">إعداد Webhook (جاهز للربط)</h2>{" "}
      <p className="mt-2 text-sm leading-7">
        {" "}
        {webhookSecretConfigured
          ? "تم إعداد RESEND_WEBHOOK_SECRET، لكن لم يصل أي حدث بعد. تأكد من ربط Webhook في Resend وتفعيل الأحداث."
          : "اربط Resend Webhook وفعّل: sent, delivered, opened, clicked, failed, bounced, complained."}{" "}
      </p>{" "}
      <p className="mt-3 break-all rounded-2xl border admin-panel-border ui-glass-solid px-4 py-3 font-mono text-sm ui-text-strong">
        {" "}
        https://www.hasanchartworld.com{webhookUrl}{" "}
      </p>{" "}
      <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold">
        {" "}
        <span className="rounded-full border admin-panel-border ui-glass-solid px-3 py-1">
          {" "}
          RESEND_WEBHOOK_SECRET:{" "}
          {webhookSecretConfigured ? "✅ مُعد" : "⚠ غير مُعد"}{" "}
        </span>{" "}
        {lastWebhookEventLabel ? (
          <span className="rounded-full border admin-panel-border ui-glass-solid px-3 py-1">
            {" "}
            آخر حدث: {lastWebhookEventLabel}{" "}
          </span>
        ) : null}{" "}
      </div>{" "}
    </section>
  );
}
