"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "../../../../lib/admin-fetch";
import {
  VIP_STATUS_EVENT_LABELS_AR,
  tradeStatusLabelAr,
} from "../../../../lib/vip-recommendation-status-copy.js";

function formatDateTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("ar-EG", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function signalTypeBadge(signalType) {
  return signalType === "futures" ? "Futures 🔥" : "Spot ⭐";
}

function isEventDisabled(tradeStatus, eventType) {
  const status = String(tradeStatus || "active").toLowerCase();

  if (status === "closed_immediately" || status === "completed" || status === "cancelled") {
    return true;
  }

  if (eventType === "target_1_hit") {
    return status === "target_1_hit" || status === "target_2_hit";
  }

  if (eventType === "target_2_hit") {
    return status === "target_2_hit" || status !== "target_1_hit";
  }

  return false;
}

function disabledReason(tradeStatus, eventType) {
  const status = String(tradeStatus || "active").toLowerCase();

  if (status === "closed_immediately" || status === "completed" || status === "cancelled") {
    return "الصفقة مغلقة ولا يمكن تحديث حالتها";
  }
  if (eventType === "target_1_hit" && (status === "target_1_hit" || status === "target_2_hit")) {
    return "تم إرسال تحديث الهدف الأول مسبقًا";
  }
  if (eventType === "target_2_hit" && status === "target_2_hit") {
    return "تم إرسال تحديث الهدف الثاني مسبقًا";
  }
  if (eventType === "target_2_hit" && status !== "target_1_hit") {
    return "يجب تحقيق الهدف الأول قبل الهدف الثاني";
  }
  return "";
}

function historyEventLabel(eventType) {
  return VIP_STATUS_EVENT_LABELS_AR[eventType] || eventType;
}

export default function VipRecentRecommendationsPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState(null);
  const [submittingKey, setSubmittingKey] = useState("");
  const [resultBanner, setResultBanner] = useState(null);
  const [retryContext, setRetryContext] = useState(null);

  const loadRecent = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await adminFetch("/api/admin/vip-recommendations/recent");
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }

      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err?.message || "تعذر تحميل آخر التوصيات");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const confirmAndSend = async () => {
    if (!pendingAction) return;

    const actionKey = `${pendingAction.id}:${pendingAction.eventType}`;
    setSubmittingKey(actionKey);
    setResultBanner(null);

    try {
      const response = await adminFetch(
        `/api/admin/vip-recommendations/${encodeURIComponent(pendingAction.id)}/status-update`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventType: pendingAction.eventType,
            requestId: `vip-status-ui-${pendingAction.id}-${pendingAction.eventType}-${Date.now()}`,
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }

      setResultBanner({
        type: data.partialFailure ? "warning" : "success",
        summary: data.summary,
        partialFailure: Boolean(data.partialFailure),
        signalId: pendingAction.id,
        eventType: pendingAction.eventType,
      });

      await loadRecent();
    } catch (err) {
      setResultBanner({
        type: "error",
        message: err?.message || "تعذر إرسال التحديث",
      });
    } finally {
      setSubmittingKey("");
      setPendingAction(null);
    }
  };

  const retryFailedChannels = async ({ id, eventType }) => {
    const actionKey = `retry:${id}:${eventType}`;
    setSubmittingKey(actionKey);
    setResultBanner(null);

    try {
      const response = await adminFetch(
        `/api/admin/vip-recommendations/${encodeURIComponent(id)}/status-update/retry`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventType,
            requestId: `vip-status-retry-ui-${id}-${eventType}-${Date.now()}`,
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }

      setResultBanner({
        type: data.partialFailure ? "warning" : "success",
        summary: data.summary,
        partialFailure: Boolean(data.partialFailure),
        message: data.noOp
          ? data.summary?.message || "لا توجد قنوات فاشلة قابلة لإعادة المحاولة"
          : "تمت إعادة محاولة القنوات الفاشلة",
      });

      await loadRecent();
    } catch (err) {
      setResultBanner({
        type: "error",
        message: err?.message || "تعذر إعادة المحاولة",
      });
    } finally {
      setSubmittingKey("");
      setRetryContext(null);
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-2xl font-black text-white">آخر التوصيات المنشورة</h3>
        <p className="mt-1 text-sm font-bold text-slate-400">
          آخر 3 توصيات VIP — تحديث الحالة وإرسال الإشعارات للمشتركين المستحقين.
        </p>
      </div>

      {resultBanner ? (
        <div
          className={`rounded-2xl border px-4 py-4 text-sm font-bold ${
            resultBanner.type === "success"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
              : resultBanner.type === "warning"
                ? "border-amber-400/30 bg-amber-500/10 text-amber-100"
                : "border-red-400/30 bg-red-500/10 text-red-100"
          }`}
        >
          {resultBanner.message ? (
            <p>{resultBanner.message}</p>
          ) : (
            <>
              <p className="font-black">
                {resultBanner.partialFailure
                  ? "تم تحديث الصفقة، لكن تعذر إرسال بعض قنوات الإشعار."
                  : "تم إرسال تحديث الصفقة بنجاح"}
              </p>
              {resultBanner.summary ? (
                <ul className="mt-2 space-y-1 text-xs font-bold opacity-90">
                  <li>إشعارات الموقع: {resultBanner.summary.siteNotifications}</li>
                  <li>
                    Web Push: {resultBanner.summary.pushSent} ناجح،{" "}
                    {resultBanner.summary.pushUnavailable} غير متاح
                    {resultBanner.summary.pushFailed > 0
                      ? `، ${resultBanner.summary.pushFailed} فشل`
                      : ""}
                  </li>
                  <li>
                    البريد الإلكتروني: {resultBanner.summary.emailSent} ناجح
                    {resultBanner.summary.emailFailed > 0
                      ? `، ${resultBanner.summary.emailFailed} فشل`
                      : ""}
                  </li>
                  <li>المستلمون المؤهلون: {resultBanner.summary.eligibleRecipients}</li>
                </ul>
              ) : null}
              {resultBanner.partialFailure && resultBanner.summary?.retryableFailures > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    setRetryContext({
                      id: resultBanner.signalId,
                      eventType: resultBanner.eventType,
                    })
                  }
                  className="mt-3 rounded-xl border border-amber-300/30 px-4 py-2 text-xs font-black text-amber-50"
                >
                  إعادة محاولة القنوات الفاشلة
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-[28px] border border-cyan-300/15 bg-white/[0.04] p-6 text-slate-300">
          جاري تحميل آخر التوصيات...
        </div>
      ) : error ? (
        <div className="rounded-[28px] border border-red-400/20 bg-red-500/10 p-6">
          <p className="font-bold text-red-100">{error}</p>
          <button
            type="button"
            onClick={() => void loadRecent()}
            className="mt-3 rounded-xl border border-red-300/30 px-4 py-2 text-sm font-black text-red-100"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[28px] border border-cyan-300/15 bg-white/[0.04] p-6 text-slate-400">
          لا توجد توصيات منشورة بعد.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-5 shadow-2xl backdrop-blur-2xl"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-100">
                      {signalTypeBadge(item.signalType)}
                    </span>
                    <span className="text-xl font-black text-white">{item.coin}</span>
                  </div>
                  <p className="mt-2 text-sm font-bold text-slate-300">
                    الحالة: {tradeStatusLabelAr(item.tradeStatus)}
                  </p>
                </div>
                <div className="text-left text-xs font-bold text-slate-400">
                  <p>{formatDateTime(item.createdAt)}</p>
                  {item.publishRecipientCount != null ? (
                    <p className="mt-1">المستلمون عند النشر: {item.publishRecipientCount}</p>
                  ) : null}
                  {item.publishedByEmail ? (
                    <p className="mt-1">نشرها: {item.publishedByEmail}</p>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-cyan-300/10 bg-black/20 px-4 py-3">
                  <p className="text-xs font-bold text-slate-400">منطقة الدخول</p>
                  <p className="mt-1 font-black text-white">{item.entry || "—"}</p>
                </div>
                <div className="rounded-2xl border border-emerald-400/10 bg-black/20 px-4 py-3">
                  <p className="text-xs font-bold text-slate-400">الأهداف</p>
                  <p className="mt-1 font-black text-emerald-100">{item.targets || "—"}</p>
                </div>
                <div className="rounded-2xl border border-red-400/10 bg-black/20 px-4 py-3">
                  <p className="text-xs font-bold text-slate-400">وقف الخسارة</p>
                  <p className="mt-1 font-black text-red-100">{item.stopLoss || "—"}</p>
                </div>
              </div>

              {item.notes ? (
                <p className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
                  {item.notes}
                </p>
              ) : null}

              {item.statusHistory?.length ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-xs font-bold text-slate-400">سجل الحالة</p>
                  <ul className="mt-2 space-y-2">
                    <li className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
                      <span>نُشرت</span>
                      <span>{formatDateTime(item.createdAt)}</span>
                    </li>
                    {item.statusHistory.map((ev) => (
                      <li
                        key={ev.id}
                        className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-200">
                            {historyEventLabel(ev.eventType)}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {formatDateTime(ev.createdAt)}
                          </span>
                        </div>
                        {ev.adminEmail ? (
                          <p className="mt-1 text-[11px] text-slate-500">
                            بواسطة: {ev.adminEmail.replace(/(.{2}).+(@.*)/, "$1***$2")}
                          </p>
                        ) : null}
                        {ev.partialFailure ? (
                          <span className="mt-1 inline-block rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-100">
                            إرسال جزئي
                          </span>
                        ) : null}
                        {ev.partialFailure ? (
                          <button
                            type="button"
                            disabled={Boolean(submittingKey)}
                            onClick={() =>
                              void retryFailedChannels({ id: item.id, eventType: ev.eventType })
                            }
                            className="mt-2 rounded-lg border border-amber-300/20 px-2 py-1 text-[10px] font-black text-amber-100 disabled:opacity-50"
                          >
                            {submittingKey === `retry:${item.id}:${ev.eventType}`
                              ? "جاري إعادة المحاولة..."
                              : "إعادة محاولة القنوات الفاشلة"}
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {(["target_1_hit", "target_2_hit", "close_now"]).map((eventType) => {
                  const disabled =
                    Boolean(submittingKey) ||
                    isEventDisabled(item.tradeStatus, eventType);
                  const reason = disabled ? disabledReason(item.tradeStatus, eventType) : "";
                  const isLoading = submittingKey === `${item.id}:${eventType}`;
                  const label = VIP_STATUS_EVENT_LABELS_AR[eventType];
                  const buttonClass =
                    eventType === "close_now"
                      ? "from-red-700 via-red-600 to-rose-500 shadow-[0_16px_40px_rgba(220,38,38,0.28)]"
                      : eventType === "target_2_hit"
                        ? "from-emerald-700 via-green-600 to-lime-400 shadow-[0_16px_40px_rgba(34,197,94,0.28)]"
                        : "from-emerald-800 via-emerald-600 to-green-400 shadow-[0_16px_40px_rgba(16,185,129,0.28)]";

                  return (
                    <div key={eventType} className="space-y-1">
                      <button
                        type="button"
                        disabled={disabled}
                        title={reason || undefined}
                        onClick={() =>
                          setPendingAction({
                            id: item.id,
                            coin: item.coin,
                            eventType,
                            label,
                          })
                        }
                        className={`w-full rounded-2xl bg-gradient-to-l px-4 py-3 text-sm font-black text-white transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 ${buttonClass}`}
                      >
                        {isLoading ? "جاري الإرسال..." : label}
                      </button>
                      {reason ? (
                        <p className="text-[10px] font-bold text-slate-500">{reason}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}

      {retryContext ? (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[28px] border border-amber-300/20 bg-[#07142f] p-6 shadow-2xl">
            <h4 className="text-xl font-black text-white">إعادة محاولة القنوات الفاشلة</h4>
            <p className="mt-3 text-sm font-bold text-slate-300">
              سيتم إعادة المحاولة للقنوات الفاشلة فقط دون تكرار الإرسال الناجح.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void retryFailedChannels(retryContext)}
                className="rounded-2xl bg-gradient-to-l from-amber-700 to-amber-400 px-5 py-3 font-black text-white"
              >
                تأكيد إعادة المحاولة
              </button>
              <button
                type="button"
                onClick={() => setRetryContext(null)}
                className="rounded-2xl border border-white/15 px-5 py-3 font-black text-slate-200"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingAction ? (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg rounded-[28px] border border-cyan-300/20 bg-[#07142f] p-6 shadow-2xl"
          >
            <h4 className="text-xl font-black text-white">تأكيد إرسال الإشعار</h4>
            <p className="mt-3 text-sm font-bold leading-7 text-slate-300">
              هل تريد تأكيد إرسال إشعار:
              <span className="mx-1 text-cyan-200">"{pendingAction.label}"</span>
              إلى جميع المشتركين المستحقين لتوصية{" "}
              <span className="text-white">{pendingAction.coin}</span>؟
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void confirmAndSend()}
                className="rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-5 py-3 font-black text-white"
              >
                تأكيد وإرسال
              </button>
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                className="rounded-2xl border border-white/15 px-5 py-3 font-black text-slate-200"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
