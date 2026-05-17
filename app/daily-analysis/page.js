"use client";

// صفحة التحليلات اليومية
export default function DailyAnalysis() {
  // أمثلة لتحليلات يومية; يمكن استبدالها ببيانات ديناميكية لاحقاً
  const posts = [
    {
      title: "تحليل Bitcoin اليومي",
      date: "2026-05-02",
      excerpt: "نظرة فنية على حركة BTC خلال 24 ساعة الماضية ومستويات الدعم والمقاومة المحتملة.",
    },
    {
      title: "تحليل Ethereum الأسبوعي",
      date: "2026-05-01",
      excerpt: "مراجعة لأداء ETH وما ينتظره خلال الأسبوع القادم بناءً على المؤشرات الفنية.",
    },
    {
      title: "تقرير سوق العملات البديلة",
      date: "2026-04-30",
      excerpt: "كيف تأثرت العملات البديلة بحركة السوق الأخيرة وأبرز فرص الدخول والخروج.",
    },
  ];

  return (
    <main className="min-h-screen bg-[#020617] text-white py-12 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">التحليلات اليومية</h1>
        <p className="text-slate-400 mb-4">
          تابع أحدث التحليلات الفنية والأساسية للعملات الرقمية.
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post, index) => (
            <div
              key={index}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col justify-between"
            >
              <div>
                <h3 className="text-xl font-bold mb-2">{post.title}</h3>
                <p className="text-slate-400 text-sm mb-4">{post.date}</p>
                <p className="text-slate-300 text-sm">{post.excerpt}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}