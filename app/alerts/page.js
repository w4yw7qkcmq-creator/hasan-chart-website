"use client";

import { useEffect, useState } from "react";
import AppModal from "../components/AppModal";

export default function Alerts() {
  const [coin, setCoin] = useState("");
  const [price, setPrice] = useState("");
  const [condition, setCondition] = useState("above");
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, type: "info", title: "", message: "" });
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    try {
      const storedUser = JSON.parse(localStorage.getItem("currentUser") || "null");
      setCurrentUser(storedUser);
    } catch {
      setCurrentUser(null);
    }
  }, []);

  const showModal = ({ type, title, message }) => {
    setModal({ open: true, type, title, message });
  };

  const handleAddAlert = async (e) => {
    e.preventDefault();

    if (loading) return;

    if (!currentUser?.email) {
      showModal({
        type: "warning",
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
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    try {
      const response = await fetch("/api/alerts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          user_email: currentUser.email,
          username: currentUser.username || currentUser.email,
          coin: cleanCoin,
          price: cleanPrice,
          condition,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "فشل إضافة التنبيه");
      }

      setAlerts((prev) => [
        {
          id: result.alert?.id || Date.now(),
          coin: cleanCoin,
          price: cleanPrice,
          condition,
          status: "active",
        },
        ...prev,
      ]);

      setCoin("");
      setPrice("");
      setCondition("above");
      showModal({
        type: "success",
        title: "تم إضافة التنبيه بنجاح",
        message: result?.message || "سيتم إرسال الإيميل فقط عند تحقق السعر.",
      });
    } catch (err) {
      console.error("Alert API error:", err);

      showModal({
        type: "error",
        title: "تعذر إضافة التنبيه",
        message:
          err?.name === "AbortError"
            ? "السيرفر لم يرد خلال 9 ثواني. جرّب مرة ثانية."
            : err?.message || "حدث خطأ أثناء إضافة التنبيه",
      });
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-12 text-white">
      <AppModal
        open={modal.open}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onClose={() => setModal((current) => ({ ...current, open: false }))}
      />

      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="text-3xl font-bold">التنبيهات السعرية</h1>
        <p className="text-slate-400">
          أضف تنبيهًا للحصول على إشعار عندما يصل سعر العملة لمستوى معين.
        </p>

        {!currentUser?.email && (
          <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-center text-sm font-bold text-amber-100">
            يجب تسجيل الدخول أولاً حتى يتم ربط التنبيه بحسابك.
          </div>
        )}

        <form onSubmit={handleAddAlert} className="space-y-4">
          <input
            type="text"
            value={coin}
            onChange={(e) => setCoin(e.target.value)}
            placeholder="اسم العملة (مثال: BTC أو BTCUSDT)"
            required
            className="w-full rounded-2xl border border-white/10 bg-[#111827] p-4 text-white outline-none"
          />

          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="السعر المستهدف (USD)"
            required
            className="w-full rounded-2xl border border-white/10 bg-[#111827] p-4 text-white outline-none"
          />

          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-[#111827] p-4 text-white outline-none"
          >
            <option value="above">عند الصعود فوق السعر</option>
            <option value="below">عند الهبوط تحت السعر</option>
          </select>

          <button
            type="submit"
            disabled={loading || !currentUser?.email}
            className="w-full rounded-2xl bg-emerald-400 py-4 font-bold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "جاري إضافة التنبيه..." : "إضافة التنبيه"}
          </button>
        </form>

        {alerts.length > 0 && (
          <div className="space-y-4">
            <h2 className="mt-6 text-2xl font-bold">آخر التنبيهات التي أضفتها</h2>
            <ul className="space-y-2">
              {alerts.map((alert) => (
                <li
                  key={alert.id}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <span>
                    {alert.coin} {alert.condition === "below" ? "تحت" : "فوق"}{" "}
                    <span className="font-bold">${alert.price}</span>
                  </span>
                  <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200">
                    نشط
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
