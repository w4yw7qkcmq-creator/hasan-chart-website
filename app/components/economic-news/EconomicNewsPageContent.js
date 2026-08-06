import Link from "next/link";
import Breadcrumbs from "../seo/Breadcrumbs";
const breadcrumbs = [
  { label: "الرئيسية", href: "/" },
  { label: "الأسواق المالية", href: "/markets" },
  { label: "الأخبار الاقتصادية", href: "/economic-news" },
];
const economicSections = [
  {
    icon: "📰",
    title: "ما هي الأخبار الاقتصادية؟",
    description:
      "الأخبار الاقتصادية تشمل بيانات ومؤشرات تصدر عن الحكومات والبنوك المركزية — عند صدورها تحرك الفوركس والذهب والأسهم والكريبتو خلال دقائق.",
    links: [
      { label: "الأخبار الاقتصادية", href: "/news/category/economy" },
      { label: "جميع الأخبار", href: "/news" },
    ],
  },
  {
    icon: "🏛️",
    title: "أخبار الفيدرالي الأمريكي",
    description:
      "البنك الفيدرالي الأمريكي يحدد مسار الفائدة والسياسة النقدية — كل كلمة من رئيس الفيدرالي أو قرار FOMC تحرك الأسواق العالمية.",
    links: [
      { label: "أخبار الفيدرالي", href: "/news/tag/fed" },
      { label: "الفوركس", href: "/forex" },
    ],
  },
  {
    icon: "📈",
    title: "التضخم وبيانات CPI و PPI",
    description:
      "مؤشرات التضخم CPI و PPI تقيس ارتفاع الأسعار — بيانات أعلى من التوقعات تدعم تشديد الفائدة وتؤثر على الدولار والذهب.",
    links: [
      { label: "أخبار التضخم", href: "/news/tag/inflation" },
      { label: "الذهب", href: "/gold" },
    ],
  },
  {
    icon: "👥",
    title: "البطالة و NFP",
    description:
      "تقرير الوظائف غير الزراعية NFP من أهم بيانات الشهر — يعكس قوة سوق العمل الأمريكي ويؤثر على توقعات الفيدرالي والدولار.",
    links: [
      { label: "أخبار الاقتصاد", href: "/news/category/economy" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
    ],
  },
  {
    icon: "💹",
    title: "الفائدة وقرارات البنوك المركزية",
    description:
      "قرارات رفع أو خفض الفائدة من الفيدرالي والبنك المركزي الأوروبي وغيرها تحدد تكلفة المال وتؤثر على جميع الأصول المالية.",
    links: [
      { label: "أخبار الفيدرالي", href: "/news/tag/fed" },
      { label: "أخبار الأسواق", href: "/news/category/stocks" },
    ],
  },
  {
    icon: "🌐",
    title: "الناتج المحلي GDP",
    description:
      "بيانات الناتج المحلي GDP تقيس نمو الاقتصاد — نمو قوي يدعم الأسهم والدولار، والانكماش يثير مخاوف الركود.",
    links: [
      { label: "أخبار الاقتصاد", href: "/news/category/economy" },
      { label: "الأسهم", href: "/stocks" },
    ],
  },
  {
    icon: "💱",
    title: "تأثير الأخبار على الفوركس",
    description:
      "الأخبار الاقتصادية القوية تحرك الدولار وأزواج العملات — المتداول يحتاج فهم التوقعات مقابل النتائج الفعلية.",
    links: [
      { label: "الفوركس", href: "/forex" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
    ],
  },
  {
    icon: "🥇",
    title: "تأثير الأخبار على الذهب",
    description:
      "الذهب يتأثر بالتضخم والفائدة والدولار — أخبار التضخم المرتفعة أو ضعف الدولار تدعم الذهب غالباً.",
    links: [
      { label: "الذهب", href: "/gold" },
      { label: "أخبار الذهب", href: "/news/tag/gold" },
    ],
  },
  {
    icon: "₿",
    title: "تأثير الأخبار على العملات الرقمية",
    description:
      "الكريبتو يتأثر بالماكرو والفائدة والسيولة — قرارات الفيدرالي وبيانات التضخم تؤثر على شهية المخاطرة في السوق.",
    links: [
      { label: "العملات الرقمية", href: "/crypto" },
      { label: "أخبار الكريبتو", href: "/news/category/crypto" },
    ],
  },
  {
    icon: "📅",
    title: "التقويم الاقتصادي",
    description:
      "التقويم الاقتصادي يعرض مواعيد صدور البيانات المهمة — المتداول المحترف يعرف مسبقاً متى تتحرك الأسواق.",
    links: [
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "أخبار الاقتصاد", href: "/news/category/economy" },
    ],
  },
  {
    icon: "🛡️",
    title: "إدارة المخاطر وقت الأخبار",
    description:
      "وقت صدور الأخبار المهمة تزداد التقلبات — إدارة المخاطر تشمل تقليل حجم الصفقة أو الانتظار بعد الصدور.",
    links: [
      { label: "الاشتراكات", href: "/subscriptions" },
      { label: "VIP Futures", href: "/vip-futures" },
    ],
  },
];
const faqItems = [
  {
    q: "ما هي الأخبار الاقتصادية؟",
    a: "بيانات ومؤشرات اقتصادية تصدر عن الحكومات والبنوك المركزية وتؤثر على الأسواق المالية عند صدورها.",
  },
  {
    q: "ما أهم الأخبار الاقتصادية للمتداول؟",
    a: "قرارات الفيدرالي، بيانات التضخم CPI و PPI، تقرير NFP للوظائف، بيانات GDP، وقرارات الفائدة.",
  },
  {
    q: "كيف تؤثر الأخبار على الفوركس والذهب؟",
    a: "الأخبار القوية تحرك الدولار والفائدة والتضخم، مما ينعكس على أزواج العملات والذهب مباشرة.",
  },
  {
    q: "هل يوفر HasaN CharT World تغطية للأخبار الاقتصادية؟",
    a: "نعم، نوفر أخباراً اقتصادية مصنّفة وتحليلات يومية تربط الأخبار بحركة الأسواق.",
  },
  {
    q: "كيف أتابع الأخبار الاقتصادية في المنصة؟",
    a: "أنشئ حساباً واستكشف قسم الأخبار الاقتصادية أو التحليلات اليومية أو صفحات الأسواق المتخصصة.",
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
  { label: "الأخبار", href: "/news" },
  { label: "أخبار الاقتصاد", href: "/news/category/economy" },
  { label: "أخبار الأسواق", href: "/news/category/stocks" },
  { label: "التحليلات اليومية", href: "/daily-analysis" },
  { label: "طلب تحليل", href: "/analysis/request" },
  { label: "الاشتراكات", href: "/subscriptions" },
  { label: "VIP Spot", href: "/vip-spot" },
  { label: "VIP Futures", href: "/vip-futures" },
  { label: "من نحن", href: "/about" },
  { label: "العلامة التجارية", href: "/brand" },
  { label: "الشركة", href: "/company" },
];
function EconomicSection({ icon, title, description, links }) {
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
export default function EconomicNewsPageContent() {
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
              الأخبار الاقتصادية{" "}
            </span>{" "}
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">
              الأخبار الاقتصادية
            </h1>{" "}
            <p className="ui-public-seo-body ui-public-seo-body--lg mx-auto mt-6 max-w-4xl">
              {" "}
              من قرارات الفيدرالي والتضخم وNFP إلى GDP وتأثيرها على الفوركس
              والذهب والكريبتو — HasaN CharT World تقدّم تغطية عربية احترافية
              للأخبار الاقتصادية وإدارة المخاطر.{" "}
            </p>{" "}
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              {" "}
              <Link
                href="/news/category/economy"
                className="ui-public-seo-cta-primary"
              >
                {" "}
                أخبار الاقتصاد{" "}
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
          {economicSections.map((section) => (
            <EconomicSection key={section.title} {...section} />
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
              إجابات عن الأخبار الاقتصادية في HasaN CharT World
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
              انتقل إلى صفحات HasaN CharT World المرتبطة بالأخبار الاقتصادية
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
