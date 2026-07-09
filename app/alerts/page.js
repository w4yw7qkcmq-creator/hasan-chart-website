"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPriceAlert, deletePriceAlert, updatePriceAlert } from "../../lib/price-alert-create-client";
import AppModal from "../components/AppModal";
import { useAuth } from "../components/AuthProvider";

function AlertsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authResolved, user: currentUser } = useAuth();
  const activeTab = searchParams.get("tab") === "create" ? "create" : "notifications";

  const [coin, setCoin] = useState("");
  const [price, setPrice] = useState("");
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, type: "info", title: "", message: "" });
  const [editingId, setEditingId] = useState(null);
  const [editCoin, setEditCoin] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const showModal = ({ type, title, message }) => {
    setModal({ open: true, type, title, message });
  };

  const loadAlerts = useCallback(async () => {
    if (!authResolved || !currentUser?.email) {
      setAlerts([]);
      return;
    }

    setListLoading(true);

    try {
      const response = await fetch("/api/alerts", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر تحميل التنبيهات.");
      }

      setAlerts(result.alerts || []);
    } catch {
      setAlerts([]);
    } finally {
      setListLoading(false);
    }
  }, [authResolved, currentUser?.email]);

  useEffect(() => {
    if (activeTab === "notifications") {
      void loadAlerts();
    }
  }, [activeTab, loadAlerts]);

  const switchTab = (tab) => {
    router.replace(tab === "create" ? "/alerts?tab=create" : "/alerts?tab=notifications");
  };

  const handleAddAlert = async () => {
    if (loading) return;

    if (!authResolved) {
      showModal({
        type: "info",
        title: "جاري التحقق",
        message: "جاري التحقق من جلسة الدخول، حاول مرة أخرى بعد لحظات.",
      });
      return;
    }

    if (!currentUser?.email) {
      showModal({
        type: "error",
        title: "يجب تسجيل الدخول",
        message: "يجب تسجيل الدخول أولاً قبل إنشاء تنبيه سعري.",
      });
      return;
    }

    const cleanCoin = coin.trim().toUpperCase();
    const cleanPrice = String(price || "").trim();

    if (!cleanCoin || !cleanPrice) {
      showModal({
        type: "warning",
        title: "بيانات ناقصة",
        message: "اكتب اسم العملة والسعر المستهدف.",
      });
      return;
    }

    setLoading(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const result = await createPriceAlert({
        coin: cleanCoin,
        price: cleanPrice,
        signal: controller.signal,
      });

      const createdAlert = result?.alert;

      if (!createdAlert?.id) {
        throw new Error("لم يتم حفظ التنبيه في قاعدة البيانات.");
      }

      setCoin("");
      setPrice("");

      showModal({
        type: "success",
        title: "تم إضافة التنبيه بنجاح",
        message: result?.message || "وسيتم إرسال الإيميل فقط عند تحقق السعر.",
      });

      switchTab("notifications");
    } catch (err) {
      showModal({
        type: "error",
        title: "تعذر إضافة التنبيه",
        message:
          err?.name === "AbortError"
            ? "السيرفر لم يرد خلال 15 ثانية. جرّب مرة ثانية."
            : err?.message || "حدث خطأ أثناء إضافة التنبيه",
      });
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const startEditAlert = (alert) => {
    if (alert.status !== "active") return;
    setEditingId(alert.id);
    setEditCoin(alert.coin || "");
    setEditPrice(String(alert.price ?? ""));
  };

  const cancelEditAlert = () => {
    setEditingId(null);
    setEditCoin("");
    setEditPrice("");
  };

  const handleSaveEdit = async () => {
    if (!editingId || actionLoading) return;

    const cleanCoin = editCoin.trim().toUpperCase();
    const cleanPrice = String(editPrice || "").trim();

    if (!cleanCoin || !cleanPrice) {
      showModal({
        type: "warning",
        title: "بيانات ناقصة",
        message: "اكتب اسم العملة والسعر المستهدف.",
      });
      return;
    }

    setActionLoading(true);

    try {
      await updatePriceAlert({
        id: editingId,
        coin: cleanCoin,
        price: cleanPrice,
      });

      cancelEditAlert();
      await loadAlerts();

      showModal({
        type: "success",
        title: "تم تحديث التنبيه",
        message: "تم حفظ التعديلات بنجاح.",
      });
    } catch (err) {
      showModal({
        type: "error",
        title: "تعذر تحديث التنبيه",
        message: err?.message || "حدث خطأ أثناء تحديث التنبيه.",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId || actionLoading) return;

    setActionLoading(true);

    try {
      await deletePriceAlert({ id: pendingDeleteId });
      setPendingDeleteId(null);

      if (editingId === pendingDeleteId) {
        cancelEditAlert();
      }

      await loadAlerts();

      showModal({
        type: "success",
        title: "تم حذف التنبيه",
        message: "تم إزالة التنبيه من حسابك.",
      });
    } catch (err) {
      showModal({
        type: "error",
        title: "تعذر حذف التنبيه",
        message: err?.message || "حدث خطأ أثناء حذف التنبيه.",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const showLoginRequired = authResolved && !currentUser?.email;
  const formDisabled = !authResolved || !currentUser?.email || loading;

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-12 text-white">
      <AppModal
        open={modal.open}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onClose={() => setModal((current) => ({ ...current, open: false }))}
      />

      <AppModal
        open={Boolean(pendingDeleteId)}
        type="warning"
        title="حذف التنبيه"
        message="هل أنت متأكد من حذف هذا التنبيه؟ لا يمكن التراجع عن هذا الإجراء."
        mode="confirm"
        confirmText={actionLoading ? "جاري الحذف..." : "حذف"}
        cancelText="إلغاء"
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!actionLoading) setPendingDeleteId(null);
        }}
        onClose={() => {
          if (!actionLoading) setPendingDeleteId(null);
        }}
      />

      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">التنبيهات السعرية</h1>
          <p className="mt-2 text-slate-400">
            {activeTab === "create"
              ? "أضف تنبيهًا جديدًا للحصول على إشعار عندما يصل سعر العملة لمستوى معين."
              : "عرض التنبيهات النشطة التي أضفتها — بدون فتح نموذج إنشاء تنبيه."}
          </p>
        </div>

        <div className="flex gap-2 rounded-2xl border border-white/10 bg-white/5 p-1">
          <button
            type="button"
            onClick={() => switchTab("notifications")}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-black transition ${
              activeTab === "notifications"
                ? "bg-emerald-400 text-black"
                : "text-slate-300 hover:bg-white/5"
            }`}
          >
            تنبيهاتي
          </button>
          <button
            type="button"
            onClick={() => switchTab("create")}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-black transition ${
              activeTab === "create"
                ? "bg-emerald-400 text-black"
                : "text-slate-300 hover:bg-white/5"
            }`}
          >
            إنشاء تنبيه
          </button>
        </div>

        {activeTab === "notifications" ? (
          <section className="space-y-4">
            {listLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="h-16 animate-pulse rounded-2xl border border-white/10 bg-white/5"
                  />
                ))}
              </div>
            ) : alerts.length > 0 ? (
              <ul className="space-y-2">
                {alerts.map((alert) => (
                  <li
                    key={alert.id}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    {editingId === alert.id ? (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={editCoin}
                          onChange={(e) => setEditCoin(e.target.value)}
                          placeholder="اسم العملة"
                          disabled={actionLoading}
                          className="w-full rounded-2xl border border-white/10 bg-[#111827] p-3 text-white outline-none disabled:opacity-60"
                        />
                        <input
                          type="number"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          placeholder="السعر المستهدف (USD)"
                          disabled={actionLoading}
                          className="w-full rounded-2xl border border-white/10 bg-[#111827] p-3 text-white outline-none disabled:opacity-60"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            disabled={actionLoading}
                            className="flex-1 rounded-xl bg-emerald-400 px-3 py-2 text-sm font-black text-black disabled:opacity-60"
                          >
                            {actionLoading ? "جاري الحفظ..." : "حفظ"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditAlert}
                            disabled={actionLoading}
                            className="flex-1 rounded-xl border border-white/10 px-3 py-2 text-sm font-bold text-slate-200 disabled:opacity-60"
                          >
                            إلغاء
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span>
                          {alert.coin} {alert.condition === "below" ? "تحت" : "فوق"}{" "}
                          <span className="font-bold">${alert.price}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200">
                            {alert.status === "triggered" ? "مُفعّل" : "نشط"}
                          </span>
                          {alert.status === "active" ? (
                            <>
                              <button
                                type="button"
                                onClick={() => startEditAlert(alert)}
                                className="rounded-xl border border-white/10 px-3 py-1 text-xs font-bold text-slate-200 hover:bg-white/5"
                              >
                                تعديل
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingDeleteId(alert.id)}
                                className="rounded-xl border border-red-400/30 px-3 py-1 text-xs font-bold text-red-200 hover:bg-red-400/10"
                              >
                                حذف
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setPendingDeleteId(alert.id)}
                              className="rounded-xl border border-red-400/30 px-3 py-1 text-xs font-bold text-red-200 hover:bg-red-400/10"
                            >
                              حذف
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm font-bold text-slate-300">
                لا توجد تنبيهات محفوظة حالياً.
                <button
                  type="button"
                  onClick={() => switchTab("create")}
                  className="mt-4 block w-full rounded-2xl bg-emerald-400 px-4 py-4 text-center font-black text-white shadow-[0_16px_40px_rgba(52,211,153,0.35)] transition hover:-translate-y-0.5 hover:bg-emerald-300 hover:shadow-[0_20px_48px_rgba(52,211,153,0.45)] active:translate-y-0"
                >
                  إنشاء أول تنبيه
                </button>
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-4">
            {!authResolved ? (
              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
                <div className="h-12 animate-pulse rounded-2xl bg-white/10" />
                <div className="h-12 animate-pulse rounded-2xl bg-white/10" />
              </div>
            ) : (
              <>
                {showLoginRequired ? (
                  <div
                    className="flex items-start gap-3"
                    style={{
                      background: "rgba(255,193,7,0.12)",
                      border: "1px solid #facc15",
                      borderRadius: "14px",
                      padding: "14px 18px",
                      marginBottom: "20px",
                    }}
                  >
                    <span aria-hidden="true">🔒</span>
                    <p
                      style={{
                        color: "#92400e",
                        fontSize: "15px",
                        fontWeight: 600,
                      }}
                    >
                      يجب تسجيل الدخول لإنشاء التنبيهات السعرية.
                    </p>
                  </div>
                ) : null}

                <div className={showLoginRequired ? "space-y-4 opacity-[0.55]" : "space-y-4"}>
                  <input
                    type="text"
                    value={coin}
                    onChange={(e) => setCoin(e.target.value)}
                    placeholder="اسم العملة (مثال: BTC أو BTCUSDT)"
                    disabled={formDisabled}
                    className="w-full rounded-2xl border border-white/10 bg-[#111827] p-4 text-white outline-none disabled:cursor-not-allowed"
                  />

                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="السعر المستهدف (USD)"
                    disabled={formDisabled}
                    className="w-full rounded-2xl border border-white/10 bg-[#111827] p-4 text-white outline-none disabled:cursor-not-allowed"
                  />

                  <button
                    type="button"
                    onClick={handleAddAlert}
                    disabled={formDisabled}
                    className="w-full rounded-2xl bg-emerald-400 py-4 font-bold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? "جاري إضافة التنبيه..." : "إضافة التنبيه"}
                  </button>
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

export default function Alerts() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#020617] px-4 py-12 text-white">
          <div className="mx-auto max-w-xl space-y-4">
            <div className="h-10 w-56 animate-pulse rounded bg-white/10" />
            <div className="h-24 animate-pulse rounded-2xl bg-white/10" />
          </div>
        </main>
      }
    >
      <AlertsPageContent />
    </Suspense>
  );
}
