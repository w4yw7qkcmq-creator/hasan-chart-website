"use client";
import { UiPageShell } from "../../components/ui";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createPriceAlert,
  deletePriceAlert,
  updatePriceAlert,
} from "../../../lib/price-alert-create-client";
import AppModal from "../../components/AppModal";
import { useAuth } from "../../components/AuthProvider";
function AlertsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authResolved, user: currentUser } = useAuth();
  const activeTab =
    searchParams.get("tab") === "create" ? "create" : "notifications";
  const [coin, setCoin] = useState("");
  const [price, setPrice] = useState("");
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [modal, setModal] = useState({
    open: false,
    type: "info",
    title: "",
    message: "",
  });
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
    router.replace(
      tab === "create" ? "/alerts?tab=create" : "/alerts?tab=notifications",
    );
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
    <main className="min-h-screen ui-page-dark px-4 py-12 admin-text">
      {" "}
      <AppModal
        open={modal.open}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onClose={() => setModal((current) => ({ ...current, open: false }))}
      />{" "}
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
      />{" "}
      <div className="mx-auto max-w-xl space-y-6">
        {" "}
        <div>
          {" "}
          <h1 className="text-3xl font-bold">التنبيهات السعرية</h1>{" "}
          <p className="mt-2 admin-text-subtle">
            {" "}
            {activeTab === "create"
              ? "أضف تنبيهًا جديدًا للحصول على إشعار عندما يصل سعر العملة لمستوى معين."
              : "عرض التنبيهات النشطة التي أضفتها — بدون فتح نموذج إنشاء تنبيه."}{" "}
          </p>{" "}
        </div>{" "}
        <div className="flex gap-2 rounded-2xl border admin-panel-border ui-glass-5 p-1">
          {" "}
          <button
            type="button"
            onClick={() => switchTab("notifications")}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-black transition ${activeTab === "notifications" ? "ui-tab-pill-active" : "admin-text-muted hover:ui-glass-5"}`}
          >
            {" "}
            تنبيهاتي{" "}
          </button>{" "}
          <button
            type="button"
            onClick={() => switchTab("create")}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-black transition ${activeTab === "create" ? "ui-tab-pill-active" : "admin-text-muted hover:ui-glass-5"}`}
          >
            {" "}
            إنشاء تنبيه{" "}
          </button>{" "}
        </div>{" "}
        {activeTab === "notifications" ? (
          <section className="space-y-4">
            {" "}
            {listLoading ? (
              <div className="space-y-3">
                {" "}
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="h-16 animate-pulse rounded-2xl border admin-panel-border ui-glass-5"
                  />
                ))}{" "}
              </div>
            ) : alerts.length > 0 ? (
              <ul className="space-y-2">
                {" "}
                {alerts.map((alert) => (
                  <li
                    key={alert.id}
                    className="rounded-2xl border admin-panel-border ui-glass-5 p-4"
                  >
                    {" "}
                    {editingId === alert.id ? (
                      <div className="space-y-3">
                        {" "}
                        <input
                          type="text"
                          value={editCoin}
                          onChange={(e) => setEditCoin(e.target.value)}
                          placeholder="اسم العملة"
                          disabled={actionLoading}
                          className="w-full rounded-2xl border admin-panel-border ui-input-dark p-3 admin-text outline-none disabled:opacity-60"
                        />{" "}
                        <input
                          type="number"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          placeholder="السعر المستهدف (USD)"
                          disabled={actionLoading}
                          className="w-full rounded-2xl border admin-panel-border ui-input-dark p-3 admin-text outline-none disabled:opacity-60"
                        />{" "}
                        <div className="flex gap-2">
                          {" "}
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            disabled={actionLoading}
                            className="ui-btn ui-btn--primary flex-1 rounded-xl px-3 py-2 text-sm font-black disabled:opacity-60"
                          >
                            {" "}
                            {actionLoading ? "جاري الحفظ..." : "حفظ"}{" "}
                          </button>{" "}
                          <button
                            type="button"
                            onClick={cancelEditAlert}
                            disabled={actionLoading}
                            className="flex-1 rounded-xl border admin-panel-border px-3 py-2 text-sm font-bold admin-text-muted disabled:opacity-60"
                          >
                            {" "}
                            إلغاء{" "}
                          </button>{" "}
                        </div>{" "}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        {" "}
                        <span>
                          {" "}
                          {alert.coin}{" "}
                          {alert.condition === "below" ? "تحت" : "فوق"}{" "}
                          <span className="font-bold">${alert.price}</span>{" "}
                        </span>{" "}
                        <div className="flex items-center gap-2">
                          {" "}
                          <span className="admin-banner-success rounded-full px-3 py-1 text-xs font-bold">
                            {" "}
                            {alert.status === "triggered"
                              ? "مُفعّل"
                              : "نشط"}{" "}
                          </span>{" "}
                          {alert.status === "active" ? (
                            <>
                              {" "}
                              <button
                                type="button"
                                onClick={() => startEditAlert(alert)}
                                className="rounded-xl border admin-panel-border px-3 py-1 text-xs font-bold admin-text-muted hover:ui-glass-5"
                              >
                                {" "}
                                تعديل{" "}
                              </button>{" "}
                              <button
                                type="button"
                                onClick={() => setPendingDeleteId(alert.id)}
                                className="rounded-xl border admin-panel-border px-3 py-1 text-xs font-bold admin-text-danger hover:admin-banner-danger"
                              >
                                {" "}
                                حذف{" "}
                              </button>{" "}
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setPendingDeleteId(alert.id)}
                              className="rounded-xl border admin-panel-border px-3 py-1 text-xs font-bold admin-text-danger hover:admin-banner-danger"
                            >
                              {" "}
                              حذف{" "}
                            </button>
                          )}{" "}
                        </div>{" "}
                      </div>
                    )}{" "}
                  </li>
                ))}{" "}
              </ul>
            ) : (
              <div className="rounded-2xl border admin-panel-border ui-glass-5 p-6 text-center text-sm font-bold admin-text-muted">
                {" "}
                لا توجد تنبيهات محفوظة حالياً.{" "}
                <button
                  type="button"
                  onClick={() => switchTab("create")}
                  className="ui-btn ui-btn--primary mt-4 block w-full rounded-2xl px-4 py-4 text-center font-black transition hover:-translate-y-0.5 active:translate-y-0"
                >
                  {" "}
                  إنشاء أول تنبيه{" "}
                </button>{" "}
              </div>
            )}{" "}
          </section>
        ) : (
          <section className="space-y-4">
            {" "}
            {!authResolved ? (
              <div className="space-y-3 rounded-2xl border admin-panel-border ui-glass-5 p-4">
                {" "}
                <div className="h-4 w-40 animate-pulse rounded ui-glass-10" />{" "}
                <div className="h-12 animate-pulse rounded-2xl ui-glass-10" />{" "}
                <div className="h-12 animate-pulse rounded-2xl ui-glass-10" />{" "}
              </div>
            ) : (
              <>
                {" "}
                {showLoginRequired ? (
                  <div className="ui-alert ui-alert--warning flex items-start gap-3 mb-5">
                    <span aria-hidden="true">🔒</span>
                    <p className="text-sm font-semibold">
                      {" "}
                      يجب تسجيل الدخول لإنشاء التنبيهات السعرية.{" "}
                    </p>{" "}
                  </div>
                ) : null}{" "}
                <div
                  className={
                    showLoginRequired ? "space-y-4 opacity-[0.55]" : "space-y-4"
                  }
                >
                  {" "}
                  <input
                    type="text"
                    value={coin}
                    onChange={(e) => setCoin(e.target.value)}
                    placeholder="اسم العملة (مثال: BTC أو BTCUSDT)"
                    disabled={formDisabled}
                    className="w-full rounded-2xl border admin-panel-border ui-input-dark p-4 admin-text outline-none disabled:cursor-not-allowed"
                  />{" "}
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="السعر المستهدف (USD)"
                    disabled={formDisabled}
                    className="w-full rounded-2xl border admin-panel-border ui-input-dark p-4 admin-text outline-none disabled:cursor-not-allowed"
                  />{" "}
                  <button
                    type="button"
                    onClick={handleAddAlert}
                    disabled={formDisabled}
                    className="ui-btn ui-btn--primary w-full rounded-2xl py-4 font-bold transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {" "}
                    {loading ? "جاري إضافة التنبيه..." : "إضافة التنبيه"}{" "}
                  </button>{" "}
                </div>{" "}
              </>
            )}{" "}
          </section>
        )}{" "}
      </div>{" "}
    </main>
  );
}
export default function Alerts() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen ui-page-dark px-4 py-12 admin-text">
          {" "}
          <div className="mx-auto max-w-xl space-y-4">
            {" "}
            <div className="h-10 w-56 animate-pulse rounded ui-glass-10" />{" "}
            <div className="h-24 animate-pulse rounded-2xl ui-glass-10" />{" "}
          </div>{" "}
        </main>
      }
    >
      {" "}
      <AlertsPageContent />{" "}
    </Suspense>
  );
}
