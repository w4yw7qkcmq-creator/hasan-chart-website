import Link from "next/link";
import Breadcrumbs from "../seo/Breadcrumbs";
const breadcrumbs = [
  { label: "الرئيسية", href: "/" },
  { label: "الأسواق المالية", href: "/markets" },
  { label: "الأسهم والمؤشرات", href: "/stocks" },
];
const stocksSections = [
  {
    icon: "📈",
    title: "ما هو سوق الأسهم؟",
    description:
      "سوق الأسهم يتيح تداول حصص الشركات المدرجة في البورصات، ويعكس توقعات المستثمرين للنمو والأرباح والاقتصاد الكلي.",
    links: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "أخبار الأسهم", href: "/news/category/stocks" },
    ],
  },
  {
    icon: "🌍",
    title: "المؤشرات الأمريكية",
    description:
      "S&P 500 يمثل 500 شركة أمريكية كبرى، وNasdaq مركز التكنولوجيا، وDow Jones يتابع 30 شركة صناعية رائدة — هذه المؤشرات تعكس صحة الاقتصاد الأمريكي.",
    links: [
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "أخبار الاقتصاد", href: "/news/category/economy" },
      { label: "الأسعار المباشرة", href: "/#prices" },
    ],
  },
  {
    icon: "💻",
    title: "أسهم التكنولوجيا",
    description:
      "أسهم التكنولوجيا في ناسداك تحرك السوق الأمريكي — شركات الذكاء الاصطناعي والسحابة والرقائق تقود غالباً اتجاه المؤشرات.",
    links: [
      { label: "أخبار الأسهم", href: "/news/category/stocks" },
      { label: "وسم الأسهم", href: "/news/tag/stocks" },
    ],
  },
  {
    icon: "📅",
    title: "أرباح الشركات",
    description:
      "نتائج الأرباح الفصلية من أهم محركات السوق — الشركات التي تتجاوز أو تخفق التوقعات تحرك أسعارها والمؤشرات بقوة.",
    links: [
      { label: "أخبار الأسهم", href: "/news/category/stocks" },
      { label: "طلب تحليل", href: "/analysis/request" },
    ],
  },
  {
    icon: "📊",
    title: "الفائدة والتضخم وتأثيرها على الأسهم",
    description:
      "ارتفاع الفائدة يضغط على تقييمات الأسهم خاصة التكنولوجيا، بينما بيانات التضخم تحرك توقعات الفيدرالي واتجاه السوق.",
    links: [
      { label: "أخبار الفيدرالي", href: "/news/tag/fed" },
      { label: "أخبار التضخم", href: "/news/tag/inflation" },
    ],
  },
  {
    icon: "💵",
    title: "الدولار والسندات",
    description:
      "قوة الدولار وارتفاع عوائد السندات يؤثران على جاذبية الأسهم — المستثمرون يوازنون بين المخاطرة والعائد الآمن.",
    links: [
      { label: "الفوركس", href: "/forex" },
      { label: "الذهب", href: "/gold" },
      { label: "النفط", href: "/oil" },
    ],
  },
  {
    icon: "📉",
    title: "التحليل الفني للأسهم",
    description:
      "التحليل الفني للأسهم يدرس الشارتات والاتجاهات ومستويات الدعم والمقاومة في الأسهم والمؤشرات لتحديد نقاط الدخول والخروج.",
    links: [
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "VIP Spot", href: "/vip-spot" },
    ],
  },
  {
    icon: "📰",
    title: "أخبار الأسهم والمؤشرات",
    description:
      "أخبار الأسهم والمؤشرات العاجلة والمصنّفة تساعد المستثمر على فهم ما يحرك السوق الأمريكي قبل اتخاذ القرار.",
    links: [
      { label: "أخبار الأسهم", href: "/news/category/stocks" },
      { label: "وسم الأسهم", href: "/news/tag/stocks" },
      { label: "جميع الأخبار", href: "/news" },
    ],
  },
  {
    icon: "🛡️",
    title: "إدارة المخاطر",
    description:
      "إدارة المخاطر في الأسهم تشمل تنويع المحفظة، تحديد حجم الصفقة، وقف الخسارة، وعدم تركيز الاستثمار في قطاع أو سهم واحد.",
    links: [
      { label: "الاشتراكات", href: "/subscriptions" },
      { label: "VIP Futures", href: "/vip-futures" },
    ],
  },
];
const faqItems = [
  {
    q: "ما هو سوق الأسهم؟",
    a: "سوق يتيح تداول حصص الشركات المدرجة في البورصات، ويعكس توقعات المستثمرين للنمو والأرباح والاقتصاد.",
  },
  {
    q: "ما أهم المؤشرات الأمريكية؟",
    a: "أهمها S&P 500 وNasdaq وDow Jones — كل منها يمثل قطاعاً أو حجماً مختلفاً من السوق الأمريكي.",
  },
  {
    q: "هل يوفر HasaN CharT World تحليلات للأسهم؟",
    a: "نعم، نوفر تحليلات فنية وأخباراً مرتبطة بالأسهم الأمريكية والمؤشرات الرئيسية.",
  },
  {
    q: "كيف تؤثر أرباح الشركات على السوق؟",
    a: "نتائج الأرباح الفصلية تحرك أسعار الأسهم بقوة، خاصة للشركات القيادية عند تجاوز أو إخفاق التوقعات.",
  },
  {
    q: "كيف أبدأ بمتابعة الأسهم في المنصة؟",
    a: "أنشئ حساباً واستكشف التحليلات اليومية أو أخبار الأسهم أو طلب تحليل مخصص والاشتراكات.",
  },
];
const internalLinks = [
  { label: "الأصول والأسواق", href: "/assets" },
  { label: "الأسواق المالية", href: "/markets" },
  { label: "الفوركس", href: "/forex" },
  { label: "العملات الرقمية", href: "/crypto" },
  { label: "الذهب", href: "/gold" },
  { label: "النفط", href: "/oil" },
  { label: "السلع العالمية", href: "/commodities" },
  { label: "الأخبار", href: "/news" },
  { label: "أخبار الأسهم", href: "/news/category/stocks" },
  { label: "وسم الأسهم", href: "/news/tag/stocks" },
  { label: "التحليلات اليومية", href: "/daily-analysis" },
  { label: "طلب تحليل", href: "/analysis/request" },
  { label: "الاشتراكات", href: "/subscriptions" },
  { label: "VIP Spot", href: "/vip-spot" },
  { label: "VIP Futures", href: "/vip-futures" },
  { label: "من نحن", href: "/about" },
  { label: "العلامة التجارية", href: "/brand" },
  { label: "الشركة", href: "/company" },
];
function StocksSection({ icon, title, description, links }) {
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
export default function StocksPageContent() {
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
              الأسهم والمؤشرات{" "}
            </span>{" "}
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">
              الأسهم والمؤشرات
            </h1>{" "}
            <p className="ui-public-seo-body ui-public-seo-body--lg mx-auto mt-6 max-w-4xl">
              {" "}
              من ناسداك وداو جونز وS&P 500 إلى أسهم التكنولوجيا وأرباح الشركات —
              HasaN CharT World تقدّم تغطية عربية احترافية للأسهم والمؤشرات مع
              تحليلات وأخبار وإدارة مخاطر.{" "}
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
                href="/news/category/stocks"
                className="ui-public-seo-cta-secondary"
              >
                {" "}
                أخبار الأسهم{" "}
              </Link>{" "}
            </div>{" "}
          </div>{" "}
        </section>{" "}
        <div className="space-y-6">
          {" "}
          {stocksSections.map((section) => (
            <StocksSection key={section.title} {...section} />
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
              إجابات عن الأسهم والمؤشرات في HasaN CharT World
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
              انتقل إلى صفحات HasaN CharT World المرتبطة بالأسهم
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
