"use client";

// صفحة الأخبار الأسبوعية
export default function News() {
  const items = [
    {
      title: "ارتفاع البيتكوين بعد إعلان اقتصادي مهم",
      date: "2026-05-02",
      excerpt: "شهدت أسعار البيتكوين ارتفاعًا حادًا بعد تصريحات مسؤولي الاحتياطي الفيدرالي بشأن السياسة النقدية.",
    },
    {
      title: "إطلاق شبكة جديدة للعملات البديلة",
      date: "2026-05-01",
      excerpt: "مشروع جديد يُعد بتغيير قواعد اللعبة في عالم العملات البديلة من خلال تقنية مبتكرة.",
    },
    {
      title: "تحذير من عمليات احتيال في سوق العملات الرقمية",
      date: "2026-04-29",
      excerpt: "تزايد الشكاوى حول منصات تداول مشبوهة يديرها أفراد مجهولو الهوية في آسيا.",
    },
  ];

  return (
    <main className="min-h-screen bg-[#020617] text-white py-12 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">أهم الأخبار هذا الأسبوع</h1>
        <p className="text-slate-400 mb-4">
          تابع أبرز الأحداث والأخبار التي تؤثر على سوق العملات الرقمية.
        </p>
        <div className="space-y-6">
          {items.map((item, index) => (
            <div key={index} className="flex flex-col md:flex-row gap-4 bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="w-full md:w-1/4 bg-[#111827] rounded-xl h-40 flex items-center justify-center">
                <span className="text-slate-500">صورة الخبر</span>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                <p className="text-slate-400 text-sm mb-2">{item.date}</p>
                <p className="text-slate-300 text-sm">{item.excerpt}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}