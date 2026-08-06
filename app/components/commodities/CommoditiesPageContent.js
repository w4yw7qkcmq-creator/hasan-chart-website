import Link from "next/link";
import Breadcrumbs from "../seo/Breadcrumbs";
const breadcrumbs = [
  { label: "الرئيسية", href: "/" },
  { label: "الأسواق المالية", href: "/markets" },
  { label: "السلع العالمية", href: "/commodities" },
];
const commoditiesSections = [
  {
    icon: "📦",
    title: "ما هي السلع في الأسواق المالية؟",
    description:
      "السلع أصول مادية تُتداول في الأسواق العالمية — من المعادن الثمينة إلى الطاقة والزراعة — وتُعد مؤشرات اقتصادية تعكس الصحة الاقتصادية والتضخم.",
    links: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "أخبار السلع", href: "/news/category/commodities" },
    ],
  },
  {
    icon: "🥇",
    title: "الذهب والفضة",
    description:
      "الذهب والفضة من أهم المعادن الثمينة، يُستخدمان كملاذ آمن وتحوّط ضد التضخم، ويتحركان بتأثير الدولار والفائدة والطلب المؤسسي.",
    links: [
      { label: "صفحة الذهب", href: "/gold" },
      { label: "أخبار الذهب", href: "/news/tag/gold" },
      { label: "الفوركس", href: "/forex" },
    ],
  },
  {
    icon: "🛢️",
    title: "النفط والطاقة",
    description:
      "النفط خام برنت وWTI من أهم سلع الطاقة، يؤثر على التضخم العالمي والنقل والصناعة، ويرتبط بقرارات أوبك والجيوسياسة.",
    links: [
      { label: "صفحة النفط", href: "/oil" },
      { label: "أخبار النفط", href: "/news/category/commodities" },
      { label: "وسم النفط", href: "/news/tag/oil" },
    ],
  },
  {
    icon: "🔥",
    title: "الغاز الطبيعي",
    description:
      "الغاز الطبيعي سلعة طاقة حيوية للتدفئة والصناعة والكهرباء، يتأثر بالطقس والمخزونات والتصدير والسياسة الأوروبية.",
    links: [
      { label: "أخبار السلع", href: "/news/category/commodities" },
      { label: "أخبار الطاقة", href: "/news/category/commodities" },
    ],
  },
  {
    icon: "🌾",
    title: "القمح والسلع الزراعية",
    description:
      "القمح والذرة وفول الصويا من السلع الزراعية الأساسية، تتأثر بالطقس والحروب التجارية والطلب الغذائي العالمي.",
    links: [
      { label: "أخبار السلع", href: "/news/category/commodities" },
      { label: "الأخبار الاقتصادية", href: "/news" },
    ],
  },
  {
    icon: "💵",
    title: "تأثير الدولار والفائدة على السلع",
    description:
      "معظم السلع تُسعّر بالدولار — ضعف الدولار يدعم الأسعار. ارتفاع الفائدة يبطئ النمو ويؤثر على الطلب على الطاقة والمعادن.",
    links: [
      { label: "الفوركس", href: "/forex" },
      { label: "أخبار الفيدرالي", href: "/news/tag/fed" },
      { label: "أخبار التضخم", href: "/news/tag/inflation" },
    ],
  },
  {
    icon: "📈",
    title: "التضخم وأسعار السلع",
    description:
      "التضخم المرتفع يدعم الذهب والسلع كمخزن للقيمة، بينما بيانات التضخم الأمريكية تحرك جميع فئات السلع عند صدورها.",
    links: [
      { label: "أخبار التضخم", href: "/news/tag/inflation" },
      { label: "صفحة الذهب", href: "/gold" },
    ],
  },
  {
    icon: "📉",
    title: "التحليل الفني للسلع",
    description:
      "التحليل الفني للسلع يدرس شارتات الذهب والنفط والغاز والزراعة والاتجاهات ومستويات الدعم والمقاومة.",
    links: [
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "طلب تحليل", href: "/analysis/request" },
    ],
  },
  {
    icon: "📰",
    title: "أخبار السلع العالمية",
    description:
      "أخبار السلع العاجلة والمصنّفة تساعد المتداول على فهم ما يحرك الذهب والنفط والطاقة والزراعة قبل اتخاذ القرار.",
    links: [
      { label: "أخبار السلع", href: "/news/category/commodities" },
      { label: "أخبار النفط", href: "/news/category/commodities" },
      { label: "أخبار الذهب", href: "/news/tag/gold" },
      { label: "جميع الأخبار", href: "/news" },
    ],
  },
  {
    icon: "🛡️",
    title: "إدارة المخاطر",
    description:
      "إدارة المخاطر في تداول السلع تشمل تنويع المحفظة، تحديد حجم الصفقة، وقف الخسارة، ومراقبة الأخبار الجيوسياسية.",
    links: [
      { label: "الاشتراكات", href: "/subscriptions" },
      { label: "VIP Futures", href: "/vip-futures" },
    ],
  },
];
const faqItems = [
  {
    q: "ما هي السلع في الأسواق المالية؟",
    a: "أصول مادية تُتداول في الأسواق العالمية مثل الذهب والفضة والنفط والغاز والقمح، وتُعد مؤشرات اقتصادية مهمة.",
  },
  {
    q: "ما أهم السلع التي تغطيها المنصة؟",
    a: "نغطي المعادن الثمينة والطاقة والسلع الزراعية مع تحليلات وأخبار مرتبطة بكل فئة.",
  },
  {
    q: "كيف يؤثر التضخم على أسعار السلع؟",
    a: "التضخم المرتفع يدعم عادةً الذهب والسلع كمخزن للقيمة، بينما يؤثر على الطلب على الطاقة والزراعة.",
  },
  {
    q: "هل يوفر HasaN CharT World تحليلات للسلع؟",
    a: "نعم، نوفر تحليلات فنية وأخباراً مرتبطة بالسلع ضمن صفحات الذهب والنفط والتحليلات اليومية.",
  },
  {
    q: "كيف أبدأ بمتابعة السلع في المنصة؟",
    a: "أنشئ حساباً واستكشف صفحات الذهب والنفط أو أخبار السلع أو التحليلات اليومية والاشتراكات.",
  },
];
const internalLinks = [
  { label: "الأصول والأسواق", href: "/assets" },
  { label: "الأسواق المالية", href: "/markets" },
  { label: "الفوركس", href: "/forex" },
  { label: "العملات الرقمية", href: "/crypto" },
  { label: "الذهب", href: "/gold" },
  { label: "النفط", href: "/oil" },
  { label: "الأسهم الأمريكية", href: "/stocks" },
  { label: "الأخبار", href: "/news" },
  { label: "أخبار السلع", href: "/news/category/commodities" },
  { label: "أخبار النفط", href: "/news/category/commodities" },
  { label: "أخبار الذهب", href: "/news/tag/gold" },
  { label: "التحليلات اليومية", href: "/daily-analysis" },
  { label: "طلب تحليل", href: "/analysis/request" },
  { label: "الاشتراكات", href: "/subscriptions" },
  { label: "VIP Spot", href: "/vip-spot" },
  { label: "VIP Futures", href: "/vip-futures" },
  { label: "من نحن", href: "/about" },
  { label: "العلامة التجارية", href: "/brand" },
  { label: "الشركة", href: "/company" },
];
function CommoditiesSection({ icon, title, description, links }) {
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
export default function CommoditiesPageContent() {
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
              السلع العالمية{" "}
            </span>{" "}
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">
              السلع العالمية
            </h1>{" "}
            <p className="ui-public-seo-body ui-public-seo-body--lg mx-auto mt-6 max-w-4xl">
              {" "}
              من الذهب والفضة إلى النفط والغاز والسلع الزراعية — HasaN CharT
              World تقدّم تغطية عربية احترافية للسلع العالمية مع تحليلات وأخبار
              وتضخم وإدارة مخاطر.{" "}
            </p>{" "}
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              {" "}
              <Link
                href="/news/category/commodities"
                className="ui-public-seo-cta-primary"
              >
                {" "}
                أخبار السلع{" "}
              </Link>{" "}
              <Link href="/gold" className="ui-public-seo-cta-secondary">
                {" "}
                صفحة الذهب{" "}
              </Link>{" "}
            </div>{" "}
          </div>{" "}
        </section>{" "}
        <div className="space-y-6">
          {" "}
          {commoditiesSections.map((section) => (
            <CommoditiesSection key={section.title} {...section} />
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
              إجابات عن السلع العالمية في HasaN CharT World
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
              انتقل إلى صفحات HasaN CharT World المرتبطة بالسلع
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
