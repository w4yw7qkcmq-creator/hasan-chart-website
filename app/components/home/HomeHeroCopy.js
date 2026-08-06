export default function HomeHeroCopy() {
  return (
    <div className="lg:col-span-7 space-y-6">
      {" "}
      <span className="badgeGreen">LIVE TRADING INTELLIGENCE</span>{" "}
      <h1 className="site-hero-title text-4xl md:text-6xl font-black leading-tight tracking-wide">
        {" "}
        منصة احترافية لمتابعة السوق وطلب التحليلات والتنبيهات السعرية{" "}
      </h1>{" "}
      <p className="site-hero-subtitle text-lg font-bold leading-8 tracking-wide">
        {" "}
        HasaN CharT World تجمع الأسعار المباشرة، الشارت الحي، طلبات التحليل،
        التنبيهات، الاشتراكات، ولوحة مستخدم منظمة في تجربة واحدة.{" "}
      </p>{" "}
      <div className="flex flex-wrap gap-3">
        {" "}
        <a href="#analysis" className="site-hero-cta-primary px-6 py-4 rounded-2xl">
          {" "}
          🧠 طلب تحليل الآن{" "}
        </a>{" "}
        <a href="#alerts" className="site-hero-cta-secondary px-6 py-4 rounded-2xl">
          {" "}
          🔔 إنشاء تنبيه سعر{" "}
        </a>{" "}
      </div>{" "}
    </div>
  );
}
