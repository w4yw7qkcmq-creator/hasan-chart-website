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
      <section className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 shadow-lg dark:border-emerald-300/25 dark:bg-emerald-400/10 dark:text-emerald-50">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-black">✅ Webhook متصل ويعمل</h2>
            <p className="mt-2 text-sm leading-7 text-emerald-800 dark:text-emerald-100">
              يتم استقبال أحداث Resend بنجاح وتخزينها في لوحة التحليلات.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-white/80 px-4 py-3 text-sm dark:border-emerald-300/20 dark:bg-black/20">
            <p className="font-bold text-emerald-700 dark:text-emerald-200">آخر Webhook Event</p>
            <p className="mt-1 font-black text-emerald-950 dark:text-emerald-50">
              {lastWebhookEventLabel || "—"}
            </p>
            {lastWebhookEventType ? (
              <p className="mt-1 text-xs font-bold text-emerald-700 dark:text-emerald-200">
                {lastWebhookEventType}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-lg dark:border-amber-300/20 dark:bg-amber-400/10 dark:text-amber-100">
      <h2 className="text-lg font-black">إعداد Webhook (جاهز للربط)</h2>
      <p className="mt-2 text-sm leading-7">
        {webhookSecretConfigured
          ? "تم إعداد RESEND_WEBHOOK_SECRET، لكن لم يصل أي حدث بعد. تأكد من ربط Webhook في Resend وتفعيل الأحداث."
          : "اربط Resend Webhook وفعّل: sent, delivered, opened, clicked, failed, bounced, complained."}
      </p>
      <p className="mt-3 break-all rounded-2xl border border-amber-200 bg-white px-4 py-3 font-mono text-sm text-slate-900 dark:border-amber-300/20 dark:bg-black/20 dark:text-amber-50">
        https://www.hasanchartworld.com{webhookUrl}
      </p>
      <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold">
        <span className="rounded-full border border-amber-200 bg-white px-3 py-1 dark:border-amber-300/20 dark:bg-black/20">
          RESEND_WEBHOOK_SECRET: {webhookSecretConfigured ? "✅ مُعد" : "⚠ غير مُعد"}
        </span>
        {lastWebhookEventLabel ? (
          <span className="rounded-full border border-amber-200 bg-white px-3 py-1 dark:border-amber-300/20 dark:bg-black/20">
            آخر حدث: {lastWebhookEventLabel}
          </span>
        ) : null}
      </div>
    </section>
  );
}
