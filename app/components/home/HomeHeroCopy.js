export default function HomeHeroCopy() {
  return (
    <div className="lg:col-span-7 space-y-6">
      <span className="badgeGreen">LIVE TRADING INTELLIGENCE</span>

      <h1
        className="text-4xl md:text-6xl font-black leading-tight tracking-wide"
        style={{
          color: "#ffffff",
          WebkitTextFillColor: "#ffffff",
          textShadow: "0 4px 8px rgba(0,0,0,0.85)",
        }}
      >
        منصة احترافية لمتابعة السوق وطلب التحليلات والتنبيهات السعرية
      </h1>

      <p
        className="text-lg font-bold leading-8 tracking-wide"
        style={{
          color: "#ffffff",
          WebkitTextFillColor: "#ffffff",
          textShadow: "0 3px 6px rgba(0,0,0,0.82)",
        }}
      >
        HasaN CharT World تجمع الأسعار المباشرة، الشارت الحي، طلبات التحليل، التنبيهات، الاشتراكات، ولوحة
        مستخدم منظمة في تجربة واحدة.
      </p>

      <div className="flex flex-wrap gap-3">
        <a
          href="#analysis"
          className="px-6 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 font-bold transition"
          style={{
            color: "#ffffff",
            WebkitTextFillColor: "#ffffff",
            textShadow: "0 2px 4px rgba(0,0,0,0.75)",
          }}
        >
          🧠 طلب تحليل الآن
        </a>
        <a
          href="#alerts"
          className="px-6 py-4 rounded-2xl bg-emerald-400 hover:bg-emerald-300 font-bold transition"
          style={{
            color: "#ffffff",
            WebkitTextFillColor: "#ffffff",
            textShadow: "0 2px 4px rgba(0,0,0,0.75)",
          }}
        >
          🔔 إنشاء تنبيه سعر
        </a>
      </div>
    </div>
  );
}
