import Link from "next/link";
import Breadcrumbs from "../seo/Breadcrumbs";
const breadcrumbs = [
  { label: "الرئيسية", href: "/" },
  { label: "الأسواق المالية", href: "/markets" },
  { label: "الذهب", href: "/gold" },
];
const goldSections = [
  {
    icon: "🥇",
    title: "ما هو سوق الذهب؟",
    description:
      "الذهب XAU من أقدم أصول التحوّط في العالم، يُتداول كملاذ آمن ضد التضخم وعدم اليقين الاقتصادي، ويُعرض غالباً مقابل الدولار الأمريكي في أسواق الفوركس.",
    links: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "الفوركس", href: "/forex" },
    ],
  },
  {
    icon: "📊",
    title: "لماذا يتحرك الذهب؟",
    description:
      "يتحرك الذهب بتأثير عوامل متعددة: الدولار الأمريكي، أسعار الفائدة، التضخم، الأخبار الجيوسياسية، الطلب المؤسسي، وقرارات البنوك المركزية.",
    links: [
      { label: "أخبار الاقتصاد", href: "/news/category/economy" },
      { label: "أخبار جيوسياسية", href: "/news/category/geopolitics" },
    ],
  },
  {
    icon: "💵",
    title: "الدولار الأمريكي والذهب",
    description:
      "عادةً يتحرك الذهب عكس الدولار — ضعف الدولار يدعم الذهب والعكس صحيح. قرارات الفيدرالي والبيانات الأمريكية تؤثر مباشرة على XAU/USD.",
    links: [
      { label: "الفوركس", href: "/forex" },
      { label: "أخبار الفيدرالي", href: "/news/tag/fed" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
    ],
  },
  {
    icon: "📈",
    title: "الفائدة والتضخم",
    description:
      "ارتفاع الفائدة الحقيقية يضغط على الذهب، بينما التضخم المرتفع والسياسة النقدية التوسعية تدعمه كمخزن للقيمة.",
    links: [
      { label: "أخبار التضخم", href: "/news/tag/inflation" },
      { label: "أخبار الفيدرالي", href: "/news/tag/fed" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
    ],
  },
  {
    icon: "📉",
    title: "التحليل الفني للذهب",
    description:
      "التحليل الفني للذهب يدرس الشارتات والاتجاهات ومستويات الدعم والمقاومة في XAU/USD لتحديد نقاط الدخول والخروج بدقة.",
    links: [
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "طلب تحليل", href: "/analysis/request" },
    ],
  },
  {
    icon: "📰",
    title: "أخبار الذهب",
    description:
      "أخبار الذهب العاجلة والمصنّفة تساعد المتداول على فهم ما يحرك المعدن الأصفر قبل صدور البيانات أو بعدها مباشرة.",
    links: [
      { label: "أخبار الذهب", href: "/news/tag/gold" },
      { label: "أخبار السلع", href: "/news/category/commodities" },
      { label: "جميع الأخبار", href: "/news" },
    ],
  },
  {
    icon: "📡",
    title: "إشارات الذهب",
    description:
      "إشارات الذهب الاحترافية تقدّم نقاط دخول وخروج واضحة لـ XAU/USD، مدعومة بتحليل فني وأساسي ضمن خدمات الفوركس.",
    links: [
      { label: "إشارات الفوركس", href: "/forex-signals" },
      { label: "VIP Spot", href: "/vip-spot" },
    ],
  },
  {
    icon: "🛡️",
    title: "إدارة المخاطر",
    description:
      "إدارة المخاطر في تداول الذهب تشمل تحديد حجم الصفقة، وقف الخسارة، نسبة المخاطرة إلى العائد، وعدم المبالغة في الرافعة.",
    links: [
      { label: "الاشتراكات", href: "/subscriptions" },
      { label: "VIP Futures", href: "/vip-futures" },
    ],
  },
];
const faqItems = [
  {
    q: "ما هو سوق الذهب؟",
    a: "سوق عالمي يُتداول فيه المعدن الأصفر XAU كملاذ آمن وتحوّط ضد التضخم وعدم اليقين الاقتصادي.",
  },
  {
    q: "لماذا يتحرك الذهب؟",
    a: "يتحرك الذهب بتأثير الدولار الأمريكي وأسعار الفائدة والتضخم والأخبار الجيوسياسية والطلب المؤسسي.",
  },
  {
    q: "هل يوفر HasaN CharT World تحليلات وإشارات للذهب؟",
    a: "نعم، نوفر تحليلات فنية وأخباراً وإشارات مرتبطة بحركة الذهب ضمن خدمات الفوركس والتحليلات اليومية.",
  },
  {
    q: "كيف يرتبط الذهب بالدولار الأمريكي؟",
    a: "عادةً يتحرك الذهب عكس الدولار، فضعف الدولار يدعم الذهب والعكس صحيح في معظم الظروف.",
  },
  {
    q: "كيف أبدأ بمتابعة الذهب في المنصة؟",
    a: "أنشئ حساباً واستكشف التحليلات اليومية أو أخبار الذهب أو إشارات الفوركس والاشتراكات.",
  },
];
const internalLinks = [
  { label: "الأصول والأسواق", href: "/assets" },
  { label: "الأسواق المالية", href: "/markets" },
  { label: "الفوركس", href: "/forex" },
  { label: "العملات الرقمية", href: "/crypto" },
  { label: "الأخبار", href: "/news" },
  { label: "التحليلات اليومية", href: "/daily-analysis" },
  { label: "طلب تحليل", href: "/analysis/request" },
  { label: "الاشتراكات", href: "/subscriptions" },
  { label: "VIP Spot", href: "/vip-spot" },
  { label: "VIP Futures", href: "/vip-futures" },
  { label: "من نحن", href: "/about" },
  { label: "العلامة التجارية", href: "/brand" },
  { label: "الشركة", href: "/company" },
];
function GoldSection({ icon, title, description, links }) {
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
export default function GoldPageContent() {
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
              الذهب{" "}
            </span>{" "}
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">
              سوق الذهب
            </h1>{" "}
            <p className="ui-public-seo-body ui-public-seo-body--lg mx-auto mt-6 max-w-4xl">
              {" "}
              من حركة الدولار والفائدة والتضخم إلى التحليل الفني والأخبار
              والإشارات — HasaN CharT World تقدّم تغطية عربية احترافية لسوق
              الذهب XAU مع إدارة مخاطر واضحة.{" "}
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
                href="/news/tag/gold"
                className="ui-public-seo-cta-secondary"
              >
                {" "}
                أخبار الذهب{" "}
              </Link>{" "}
            </div>{" "}
          </div>{" "}
        </section>{" "}
        <div className="space-y-6">
          {" "}
          {goldSections.map((section) => (
            <GoldSection key={section.title} {...section} />
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
              إجابات عن سوق الذهب في HasaN CharT World
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
              انتقل إلى صفحات HasaN CharT World المرتبطة بالذهب
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
