"use client";

import { useState } from "react";
import SuccessModal from "../../components/SuccessModal";

export default function RequestAnalysis() {
  const [coin, setCoin] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState({
    open: false,
    type: "success",
    title: "تم إرسال الطلب بنجاح",
    message: "تم إرسال طلب التحليل وسيتم إعلامك عند جاهزية النتيجة.",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch("/api/analysis-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          coin: coin.trim().toUpperCase(),
          frame: timeframe.trim(),
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setModal({
          open: true,
          type: "error",
          title: "تعذر إرسال الطلب",
          message: result.error || "حدث خطأ أثناء إرسال طلب التحليل، يرجى المحاولة مرة أخرى.",
        });
        return;
      }

      setCoin("");
      setTimeframe("");
      setModal({
        open: true,
        type: "success",
        title: "تم إرسال الطلب بنجاح",
        message: "تم إرسال طلب التحليل وسيتم إعلامك عند جاهزية النتيجة.",
      });
    } catch (error) {
      setModal({
        open: true,
        type: "error",
        title: "تعذر إرسال الطلب",
        message: "حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#020617] text-white py-12 px-4">
      <SuccessModal
        open={modal.open}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onClose={() => setModal((current) => ({ ...current, open: false }))}
      />

      <div className="max-w-xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">طلب تحليل عملة</h1>
        <p className="text-slate-400">
          املأ البيانات التالية لطلب تحليل مفصل لعملة معينة. سيتم إرسال النتيجة إليك داخل التطبيق.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={coin}
            onChange={(e) => setCoin(e.target.value)}
            placeholder="اسم العملة (مثال: BTCUSDT)"
            required
            className="w-full p-4 rounded-2xl bg-[#111827] border border-white/10 text-white outline-none"
          />
          <input
            type="text"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            placeholder="الفريم المطلوب (15m / 1h / 4h / 1d)"
            required
            className="w-full p-4 rounded-2xl bg-[#111827] border border-white/10 text-white outline-none"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 transition-colors py-4 rounded-2xl font-bold"
          >
            {submitting ? "جاري الإرسال..." : "إرسال الطلب"}
          </button>
        </form>
      </div>
    </main>
  );
}