import Link from "next/link";
import Breadcrumbs from "../seo/Breadcrumbs";
const breadcrumbs = [
  { label: "الرئيسية", href: "/" },
  { label: "الأسواق المالية", href: "/markets" },
  { label: "الفوركس", href: "/forex" },
];
const forexSections = [
  {
    icon: "💱",
    title: "ما هو سوق الفوركس؟",
    description:
      "الفوركس (Forex) هو أكبر سوق مالي في العالم، يُتداول فيه تبادل العملات الأجنبية على مدار 24 ساعة خلال أيام الأسبوع، بسيولة عالية وتأثير مباشر من الأخبار الاقتصادية والسياسية.",
    links: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
    ],
  },
  {
    icon: "🔗",
    title: "أهم أزواج العملات",
    description:
      "أهم الأزواج تشمل EUR/USD وGBP/USD وUSD/JPY وUSD/CHF، إضافة إلى أزواج السلع مثل XAU/USD (الذهب) التي تتأثر بحركة الدولار والتضخم.",
    links: [
      { label: "إشارات الفوركس", href: "/forex-signals" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
    ],
  },
  {
    icon: "💵",
    title: "الدولار الأمريكي وتأثيره",
    description:
      "الدولار الأمريكي محور السوق العالمي، قرارات الفيدرالي والتضخم وبيانات التوظيف الأمريكية تؤثر على معظم أزواج العملات والذهب والنفط.",
    links: [
      { label: "أخبار الفيدرالي", href: "/news/tag/fed" },
      { label: "أخبار التضخم", href: "/news/tag/inflation" },
      { label: "أخبار الاقتصاد", href: "/news/category/economy" },
    ],
  },
  {
    icon: "📉",
    title: "التحليل الفني للفوركس",
    description:
      "التحليل الفني يدرس الشارتات والاتجاهات ومستويات الدعم والمقاومة في أزواج العملات لتحديد نقاط الدخول والخروج بدقة.",
    links: [
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "إشارات الفوركس", href: "/forex-signals" },
    ],
  },
  {
    icon: "🧠",
    title: "التحليل الأساسي",
    description:
      "التحليل الأساسي يقرأ بيانات الاقتصاد الكلي وقرارات البنوك المركزية والأخبار الجيوسياسية التي تحرك أسعار العملات.",
    links: [
      { label: "طلب تحليل مخصص", href: "/analysis/request" },
      { label: "الأخبار الاقتصادية", href: "/news" },
    ],
  },
  {
    icon: "📰",
    title: "الأخبار الاقتصادية",
    description:
      "الأخبار الاقتصادية العاجلة والمصنّفة تساعد متداول الفوركس على فهم ما يحرك السوق قبل صدور البيانات أو بعدها مباشرة.",
    links: [
      { label: "جميع الأخبار", href: "/news" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
      { label: "أخبار الاقتصاد", href: "/news/category/economy" },
    ],
  },
  {
    icon: "🛡️",
    title: "إدارة المخاطر",
    description:
      "إدارة المخاطر في الفوركس تشمل تحديد حجم اللوت، وقف الخسارة، نسبة المخاطرة إلى العائد، وعدم المبالغة في الرافعة المالية.",
    links: [
      { label: "إدارة الحسابات", href: "/account-management" },
      { label: "الاشتراكات", href: "/subscriptions" },
    ],
  },
  {
    icon: "⚡",
    title: "التداول اليومي",
    description:
      "التداول اليومي في الفوركس يستهدف تحركات السعر السريعة خلال الجلسات الآسيوية والأوروبية والأمريكية بخطة واضحة.",
    links: [
      { label: "إشارات الفوركس", href: "/forex-signals" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
    ],
  },
  {
    icon: "📡",
    title: "إشارات الفوركس",
    description:
      "إشارات الفوركس الاحترافية تقدّم نقاط دخول وخروج واضحة لأزواج العملات الرئيسية، مدعومة بتحليل فني وأساسي.",
    links: [
      { label: "إشارات الفوركس", href: "/forex-signals" },
      { label: "طلب تحليل", href: "/analysis/request" },
    ],
  },
  {
    icon: "💎",
    title: "خدمات VIP Forex",
    description:
      "خدمات VIP Spot و VIP Futures تقدّم تغطية احترافية لسوق الفوركس ضمن باقات اشتراك مصممة للمتداولين الجادين.",
    links: [
      { label: "VIP Spot", href: "/vip-spot" },
      { label: "VIP Futures", href: "/vip-futures" },
      { label: "الاشتراكات", href: "/subscriptions" },
    ],
  },
];
const faqItems = [
  {
    q: "ما هو سوق الفوركس؟",
    a: "سوق تداول العملات الأجنبية العالمي، يُتداول فيه أزواج العملات على مدار 24 ساعة خلال أيام الأسبوع.",
  },
  {
    q: "هل يوفر HasaN CharT World إشارات فوركس؟",
    a: "نعم، نوفر إشارات فوركس وتحليلات فنية وأساسية وأخباراً اقتصادية مرتبطة بحركة أزواج العملات.",
  },
  {
    q: "ما أهم أزواج العملات؟",
    a: "أهمها EUR/USD وGBP/USD وUSD/JPY وUSD/CHF، إضافة إلى أزواج السلع مثل الذهب مقابل الدولار.",
  },
  {
    q: "كيف يؤثر الدولار الأمريكي على الفوركس؟",
    a: "الدولار محور السوق العالمي، وتغيرات أسعار الفائدة والتضخم والبيانات الأمريكية تؤثر على معظم الأزواج.",
  },
  {
    q: "كيف أبدأ بخدمات الفوركس في المنصة؟",
    a: "أنشئ حساباً واستكشف إشارات الفوركس أو التحليلات اليومية أو الاشتراكات وخدمات VIP.",
  },
];
const internalLinks = [
  { label: "الأصول والأسواق", href: "/assets" },
  { label: "الأسواق المالية", href: "/markets" },
  { label: "الأخبار", href: "/news" },
  { label: "التحليلات اليومية", href: "/daily-analysis" },
  { label: "طلب تحليل", href: "/analysis/request" },
  { label: "الاشتراكات", href: "/subscriptions" },
  { label: "VIP Spot", href: "/vip-spot" },
  { label: "VIP Futures", href: "/vip-futures" },
  { label: "إدارة الحسابات", href: "/account-management" },
  { label: "العملات الرقمية", href: "/crypto" },
  { label: "من نحن", href: "/about" },
  { label: "العلامة التجارية", href: "/brand" },
  { label: "الشركة", href: "/company" },
];
function ForexSection({ icon, title, description, links }) {
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
export default function ForexPageContent() {
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
              الفوركس{" "}
            </span>{" "}
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">
              سوق الفوركس
            </h1>{" "}
            <p className="ui-public-seo-body ui-public-seo-body--lg mx-auto mt-6 max-w-4xl">
              {" "}
              من أزواج العملات والدولار الأمريكي إلى التحليل الفني والأساسي —
              HasaN CharT World تقدّم تغطية عربية احترافية لسوق الفوركس: أخبار
              اقتصادية، إدارة مخاطر، إشارات تداول، وخدمات VIP.{" "}
            </p>{" "}
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              {" "}
              <Link href="/forex-signals" className="ui-public-seo-cta-primary">
                {" "}
                إشارات الفوركس{" "}
              </Link>{" "}
              <Link
                href="/daily-analysis"
                className="ui-public-seo-cta-secondary"
              >
                {" "}
                التحليلات اليومية{" "}
              </Link>{" "}
            </div>{" "}
          </div>{" "}
        </section>{" "}
        <div className="space-y-6">
          {" "}
          {forexSections.map((section) => (
            <ForexSection key={section.title} {...section} />
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
              إجابات عن سوق الفوركس في HasaN CharT World
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
              انتقل إلى صفحات HasaN CharT World المرتبطة بالفوركس
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
