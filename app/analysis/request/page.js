"use client";
import { useState } from "react";

// صفحة طلب تحليل العملة
export default function RequestAnalysis() {
  const [coin, setCoin] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    // يمكن إرسال الطلب إلى الواجهة الخلفية هنا
    setSubmitted(true);
  };

  return (
    <main className="min-h-screen bg-[#020617] text-white py-12 px-4">
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
            className="w-full bg-blue-600 hover:bg-blue-500 transition-colors py-4 rounded-2xl font-bold"
          >
            إرسال الطلب
          </button>
        </form>
        {submitted && (
          <p className="text-emerald-400 mt-4 font-medium">
            تم إرسال طلبك بنجاح! سيتم إعلامك عند جاهزية التحليل.
          </p>
        )}
      </div>
    </main>
  );
}