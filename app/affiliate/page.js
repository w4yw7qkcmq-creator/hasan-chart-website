"use client";
import { useState } from "react";

// صفحة برنامج الشركاء
export default function Affiliate() {
  // قيم افتراضية للمدعوين والأرباح
  const [invites] = useState(24);
  const [earnings] = useState(4.8); // بالدولار

  // مثال لرابط الإحالة (يجب أن يكون ديناميكياً حسب المستخدم)
  const referralLink = "https://hasan-chart.com/ref?code=ABC123";

  return (
    <main className="min-h-screen bg-[#020617] text-white py-12 px-4">
      <div className="max-w-xl mx-auto space-y-8">
          <h1 className="text-3xl font-bold">برنامج الشركاء</h1>
          <p className="text-slate-400">
            شارك رابط الإحالة الخاص بك واربح عند دعوة الآخرين للاشتراك في خدماتنا. تحصل على 0.2$ عن كل مستخدم ينجح في التسجيل، و15% من قيمة كل اشتراك مدفوع.
          </p>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
            <div className="flex justify-between">
              <span>عدد المدعوين:</span>
              <span className="font-bold">{invites}</span>
            </div>
            <div className="flex justify-between">
              <span>الأرباح المكتسبة:</span>
              <span className="font-bold">${earnings.toFixed(2)} USD</span>
            </div>
            <div>
              <label className="block mb-2 font-bold">رابط الإحالة:</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={referralLink}
                  readOnly
                  className="flex-1 p-3 rounded-lg bg-[#111827] border border-white/10 text-white"
                />
                <button
                  onClick={() => navigator.clipboard.writeText(referralLink)}
                  className="bg-blue-600 hover:bg-blue-500 py-3 px-4 rounded-lg font-bold"
                >
                  نسخ
                </button>
              </div>
            </div>
          </div>
      </div>
    </main>
  );
}