import Link from "next/link";
import Breadcrumbs from "../seo/Breadcrumbs";
const breadcrumbs = [
  { label: "الرئيسية", href: "/" },
  { label: "الأسواق المالية", href: "/markets" },
  { label: "التحليل الفني", href: "/technical-analysis" },
];
const technicalSections = [
  {
    icon: "📊",
    title: "ما هو التحليل الفني؟",
    description:
      "التحليل الفني منهج لدراسة حركة السعر على الشارت — يعتمد على أن السعر يعكس كل المعلومات المتاحة، ويستخدم الدعوم والمقاومات والاتجاهات لتحديد نقاط الدخول والخروج.",
    links: [
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "الأسواق المالية", href: "/markets" },
    ],
  },
  {
    icon: "📏",
    title: "الدعوم والمقاومات",
    description:
      "مستويات الدعم والمقاومة من أساسيات التحليل الفني — المناطق التي يتوقف عندها السعر أو ينعكس، وتُعاد اختبارها مراراً.",
    links: [
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "طلب تحليل", href: "/analysis/request" },
    ],
  },
  {
    icon: "📈",
    title: "الاتجاهات والقنوات السعرية",
    description:
      "تحديد الاتجاه صاعد أو هابط أو عرضي، ورسم القنوات السعرية يساعد على توقع حركة السعر ضمن نطاق محدد.",
    links: [
      { label: "الفوركس", href: "/forex" },
      { label: "الذهب", href: "/gold" },
    ],
  },
  {
    icon: "🕯️",
    title: "الشموع اليابانية",
    description:
      "الشموع اليابانية تعرض فتح وإغلاق وأعلى وأدنى السعر — أنماط مثل المطرقة والابتلاع والنجمة تساعد على قراءة زخم السوق.",
    links: [
      { label: "أكاديمية التداول", href: "/trading-academy" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
    ],
  },
  {
    icon: "🔷",
    title: "النماذج الفنية",
    description:
      "النماذج الفنية مثل الرأس والكتفين والمثلثات والأعلام تساعد على توقع استمرار أو انعكاس الاتجاه بعد اكتمال النموذج.",
    links: [
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "الأسهم", href: "/stocks" },
    ],
  },
  {
    icon: "🌊",
    title: "السيولة ومناطق الدخول",
    description:
      "مناطق السيولة حيث يتجمع أوامر البيع والشراء — المتداول المحترف يبحث عن مناطق الدخول بعد اختبار السيولة أو كسرها.",
    links: [
      { label: "العملات الرقمية", href: "/crypto" },
      { label: "VIP Spot", href: "/vip-spot" },
    ],
  },
  {
    icon: "💎",
    title: "Smart Money Concept SMC",
    description:
      "مفهوم الأموال الذكية يدرس كيف تتحرك المؤسسات الكبرى — كسر الهيكل، مناطق الطلب والعرض، واختبار السيولة.",
    links: [
      { label: "أكاديمية التداول", href: "/trading-academy" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
    ],
  },
  {
    icon: "⚡",
    title: "Price Action",
    description:
      "Price Action قراءة حركة السعر الخام دون مؤشرات كثيرة — الاعتماد على الشموع والمستويات والزخم لاتخاذ القرار.",
    links: [
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "إشارات الفوركس", href: "/forex" },
    ],
  },
  {
    icon: "🛡️",
    title: "إدارة المخاطر",
    description:
      "التحليل الفني بدون إدارة مخاطر ناقص — تحديد حجم الصفقة ووقف الخسارة ونسبة المخاطرة إلى العائد ضرورية لكل صفقة.",
    links: [
      { label: "الاشتراكات", href: "/subscriptions" },
      { label: "VIP Futures", href: "/vip-futures" },
    ],
  },
  {
    icon: "⚖️",
    title: "الفرق بين التحليل الفني والتحليل الأساسي",
    description:
      "التحليل الفني يدرس الشارت وحركة السعر، والتحليل الأساسي يقرأ الأخبار والبيانات الاقتصادية — الجمع بينهما يعطي صورة أوضح.",
    links: [
      { label: "الأخبار الاقتصادية", href: "/economic-news" },
      { label: "طلب تحليل", href: "/analysis/request" },
    ],
  },
  {
    icon: "🎯",
    title: "كيف يستخدم HasaN CharT World التحليل الفني",
    description:
      "في HasaN CharT World نقدّم تحليلات فنية يومية وخدمات VIP وطلب تحليل مخصص — كلها بإشراف خبراء يطبقون منهجاً فنياً احترافياً.",
    links: [
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "VIP Spot", href: "/vip-spot" },
      { label: "أكاديمية التداول", href: "/trading-academy" },
    ],
  },
];
const faqItems = [
  {
    q: "ما هو التحليل الفني؟",
    a: "منهج لدراسة حركة السعر على الشارت باستخدام الدعوم والمقاومات والاتجاهات والنماذج الفنية لتحديد نقاط الدخول والخروج.",
  },
  {
    q: "ما الفرق بين التحليل الفني والأساسي؟",
    a: "التحليل الفني يعتمد على الشارت وحركة السعر، بينما التحليل الأساسي يعتمد على الأخبار والبيانات الاقتصادية وتقييم الأصول.",
  },
  {
    q: "هل يستخدم HasaN CharT World التحليل الفني؟",
    a: "نعم، التحليلات اليومية وخدمات VIP وطلب التحليل تعتمد على منهج فني احترافي بإشراف خبراء.",
  },
  {
    q: "ما أهم أدوات التحليل الفني؟",
    a: "الدعوم والمقاومات، الاتجاهات، الشموع اليابانية، النماذج الفنية، SMC، وPrice Action.",
  },
  {
    q: "كيف أبدأ بتعلم التحليل الفني في المنصة؟",
    a: "استكشف التحليلات اليومية أو أكاديمية التداول أو طلب تحليل مخصص والاشتراكات.",
  },
];
const internalLinks = [
  { label: "الأسواق المالية", href: "/markets" },
  { label: "الفوركس", href: "/forex" },
  { label: "العملات الرقمية", href: "/crypto" },
  { label: "الذهب", href: "/gold" },
  { label: "النفط", href: "/oil" },
  { label: "الأسهم", href: "/stocks" },
  { label: "السلع العالمية", href: "/commodities" },
  { label: "الأخبار الاقتصادية", href: "/economic-news" },
  { label: "الأخبار", href: "/news" },
  { label: "التحليلات اليومية", href: "/daily-analysis" },
  { label: "طلب تحليل", href: "/analysis/request" },
  { label: "الاشتراكات", href: "/subscriptions" },
  { label: "VIP Spot", href: "/vip-spot" },
  { label: "VIP Futures", href: "/vip-futures" },
  { label: "أكاديمية التداول", href: "/trading-academy" },
  { label: "من نحن", href: "/about" },
  { label: "العلامة التجارية", href: "/brand" },
  { label: "الشركة", href: "/company" },
];
function TechnicalSection({ icon, title, description, links }) {
  return (
    <section className="ui-public-seo-card public-seo-card">
      {" "}
      <div className="flex items-start gap-4">
        {" "}
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border admin-panel-border admin-panel text-3xl">
          {" "}
          {icon}{" "}
        </div>{" "}
        <div className="min-w-0 flex-1">
          {" "}
          <h2 className="ui-public-seo-title ui-public-seo-title--card">
            {title}
          </h2>{" "}
          <p className="ui-public-seo-body ui-public-seo-body--lg mt-4">
            {description}
          </p>{" "}
          <div className="mt-5 flex flex-wrap gap-3">
            {" "}
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="ui-public-seo-link-chip"
              >
                {" "}
                {link.label}{" "}
              </Link>
            ))}{" "}
          </div>{" "}
        </div>{" "}
      </div>{" "}
    </section>
  );
}
function FaqItem({ question, answer }) {
  return (
    <details className="ui-public-seo-card ui-public-seo-card--faq group public-seo-card">
      {" "}
      <summary className="cursor-pointer list-none ui-public-seo-title text-lg marker:content-none">
        {" "}
        <span className="flex items-center justify-between gap-4">
          {" "}
          {question}{" "}
          <span className="admin-text-muted transition group-open:rotate-45">
            +
          </span>{" "}
        </span>{" "}
      </summary>{" "}
      <p className="ui-public-seo-body mt-4">{answer}</p>{" "}
    </details>
  );
}
export default function TechnicalAnalysisPageContent() {
  return (
    <main className="ui-public-seo-page public-seo-page ui-text-strong">
      {" "}
      <div className="ui-public-seo-page__backdrop pointer-events-none absolute inset-0" />{" "}
      <div className="ui-public-seo-page__grid pointer-events-none absolute inset-0" />{" "}
      <div className="relative z-10 mx-auto max-w-6xl space-y-8 px-4 py-12 md:px-6 md:py-16">
        {" "}
        <Breadcrumbs items={breadcrumbs} variant="dark" />{" "}
        <section className="ui-public-seo-hero public-seo-hero">
          {" "}
          <div className="relative z-10">
            {" "}
            <span className="inline-flex rounded-full border admin-panel-border admin-panel px-5 py-2 text-xs font-black admin-text-muted">
              {" "}
              التحليل الفني{" "}
            </span>{" "}
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">
              التحليل الفني
            </h1>{" "}
            <p className="ui-public-seo-body ui-public-seo-body--lg mx-auto mt-6 max-w-4xl">
              {" "}
              من الدعوم والمقاومات والشموع اليابانية إلى SMC وPrice Action —
              HasaN CharT World تقدّم تغطية عربية احترافية للتحليل الفني مع
              إدارة مخاطر وتحليلات يومية.{" "}
            </p>{" "}
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              {" "}
              <Link
                href="/daily-analysis"
                className="ui-public-seo-cta-primary"
              >
                {" "}
                التحليلات اليومية{" "}
              </Link>{" "}
              <Link
                href="/trading-academy"
                className="ui-public-seo-cta-secondary"
              >
                {" "}
                أكاديمية التداول{" "}
              </Link>{" "}
            </div>{" "}
          </div>{" "}
        </section>{" "}
        <div className="space-y-6">
          {" "}
          {technicalSections.map((section) => (
            <TechnicalSection key={section.title} {...section} />
          ))}{" "}
        </div>{" "}
        <section className="space-y-5">
          {" "}
          <div className="text-center">
            {" "}
            <h2 className="ui-public-seo-title ui-public-seo-title--section">
              الأسئلة الشائعة
            </h2>{" "}
            <p className="ui-public-seo-subtitle mt-3">
              إجابات عن التحليل الفني في HasaN CharT World
            </p>{" "}
          </div>{" "}
          <div className="space-y-3">
            {" "}
            {faqItems.map((item) => (
              <FaqItem key={item.q} question={item.q} answer={item.a} />
            ))}{" "}
          </div>{" "}
        </section>{" "}
        <section className="space-y-5">
          {" "}
          <div className="text-center">
            {" "}
            <h2 className="ui-public-seo-title ui-public-seo-title--section">
              روابط داخلية
            </h2>{" "}
            <p className="ui-public-seo-subtitle mt-3">
              انتقل إلى صفحات HasaN CharT World المرتبطة بالتحليل الفني
            </p>{" "}
          </div>{" "}
          <div className="flex flex-wrap justify-center gap-3">
            {" "}
            {internalLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="ui-public-seo-link-chip"
              >
                {" "}
                {link.label}{" "}
              </Link>
            ))}{" "}
          </div>{" "}
        </section>{" "}
      </div>{" "}
    </main>
  );
}
