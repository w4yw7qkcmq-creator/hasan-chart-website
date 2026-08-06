import Link from "next/link";
import Breadcrumbs from "../seo/Breadcrumbs";
const breadcrumbs = [
  { label: "الرئيسية", href: "/" },
  { label: "الأسواق المالية", href: "/markets" },
  { label: "التنبيهات السعرية", href: "/price-alerts" },
];
const alertSections = [
  {
    icon: "🔔",
    title: "ما هي التنبيهات السعرية؟",
    description:
      "التنبيهات السعرية إشعارات تُرسل عند وصول السعر لمستوى محدد مسبقاً — تساعدك على متابعة الأسواق دون مراقبة الشاشة طوال الوقت.",
    links: [
      { label: "صفحة التنبيهات", href: "/alerts" },
      { label: "الأسواق المالية", href: "/markets" },
    ],
  },
  {
    icon: "⏱️",
    title: "لماذا يحتاج المتداول إلى تنبيه سعري؟",
    description:
      "الأسواق تتحرك على مدار 24 ساعة — التنبيهات تُعلمك فور تحقق الشرط سواء كنت أمام الشاشة أم لا، وتسرّع اتخاذ القرار.",
    links: [
      { label: "التحليل الفني", href: "/technical-analysis" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
    ],
  },
  {
    icon: "₿",
    title: "تنبيهات العملات الرقمية",
    description:
      "ضبط تنبيهات للبيتكوين والإيثيريوم والأصول الرقمية الرئيسية — تصلك الإشعار عند اختراق مستوى دعم أو مقاومة مهم.",
    links: [
      { label: "العملات الرقمية", href: "/crypto" },
      { label: "VIP Spot", href: "/vip-spot" },
    ],
  },
  {
    icon: "💱",
    title: "تنبيهات الفوركس",
    description:
      "متابعة أزواج العملات مثل EUR/USD وGBP/USD — التنبيهات تُعلمك عند وصول السعر لمستويات التحليل الفني.",
    links: [
      { label: "الفوركس", href: "/forex" },
      { label: "إشارات الفوركس", href: "/forex-signals" },
    ],
  },
  {
    icon: "🥇",
    title: "تنبيهات الذهب والسلع",
    description:
      "تنبيهات لـ XAU/USD والنفط والسلع — مفيدة عند صدور أخبار اقتصادية أو اقتراب السعر من مناطق حاسمة.",
    links: [
      { label: "الذهب", href: "/gold" },
      { label: "السلع العالمية", href: "/commodities" },
      { label: "النفط", href: "/oil" },
    ],
  },
  {
    icon: "🌐",
    title: "تنبيهات عبر المتصفح",
    description:
      "إشعارات المتصفح تصل فوراً على جهازك — مثالية للمتداول الذي يريد تنبيهاً لحظياً دون فتح المنصة.",
    links: [
      { label: "صفحة التنبيهات", href: "/alerts" },
      { label: "الاشتراكات", href: "/subscriptions" },
    ],
  },
  {
    icon: "📧",
    title: "تنبيهات عبر البريد الإلكتروني",
    description:
      "التنبيهات عبر البريد الإلكتروني تضمن وصول الإشعار حتى لو لم تكن متصلاً بالمتصفح — سجل موثوق للمستويات المهمة.",
    links: [
      { label: "صفحة التنبيهات", href: "/alerts" },
      { label: "من نحن", href: "/about" },
    ],
  },
  {
    icon: "🛡️",
    title: "كيف تساعدك التنبيهات على إدارة المخاطر",
    description:
      "التنبيهات عند وقف الخسارة أو مستويات المخاطرة تذكّرك بخطة التداول وتمنعك من تجاهل تحركات خطيرة.",
    links: [
      { label: "التحليل الفني", href: "/technical-analysis" },
      { label: "VIP Futures", href: "/vip-futures" },
    ],
  },
  {
    icon: "⚖️",
    title: "الفرق بين التنبيهات اليدوية والتنبيهات الذكية",
    description:
      "التنبيهات اليدوية تضبطها أنت عند مستوى محدد، بينما التنبيهات الذكية قد ترتبط بتحليلات أو شروط متقدمة ضمن خدمات المنصة.",
    links: [
      { label: "طلب تحليل", href: "/analysis/request" },
      { label: "الأخبار الاقتصادية", href: "/economic-news" },
    ],
  },
];
const faqItems = [
  {
    q: "ما هي التنبيهات السعرية؟",
    a: "إشعارات تُرسل عند وصول السعر لمستوى محدد مسبقاً، لتساعدك على عدم تفويت الفرص أو تجاهل المخاطر.",
  },
  {
    q: "لماذا يحتاج المتداول إلى تنبيه سعري؟",
    a: "لأن الأسواق تتحرك على مدار الساعة ولا يمكن مراقبة كل أصل — التنبيهات تُعلمك فور تحقق الشرط.",
  },
  {
    q: "هل يدعم HasaN CharT World تنبيهات للكريبتو والفوركس والذهب؟",
    a: "نعم، يمكنك ضبط تنبيهات لأصول متعددة ضمن خدمات المنصة.",
  },
  {
    q: "كيف أستلم التنبيهات؟",
    a: "عبر إشعارات المتصفح والبريد الإلكتروني حسب إعداداتك في المنصة.",
  },
  {
    q: "كيف أبدأ باستخدام التنبيهات السعرية؟",
    a: "أنشئ حساباً وانتقل إلى صفحة التنبيهات أو الاشتراكات لضبط مستوياتك المفضلة.",
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
  { label: "التحليل الفني", href: "/technical-analysis" },
  { label: "صفحة التنبيهات", href: "/alerts" },
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
function AlertSection({ icon, title, description, links }) {
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
export default function PriceAlertsPageContent() {
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
              التنبيهات السعرية{" "}
            </span>{" "}
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">
              التنبيهات السعرية
            </h1>{" "}
            <p className="ui-public-seo-body ui-public-seo-body--lg mx-auto mt-6 max-w-4xl">
              {" "}
              تابع العملات الرقمية والفوركس والذهب والأسواق المالية — HasaN
              CharT World تقدّم تنبيهات سعرية عبر إشعارات المتصفح والبريد
              الإلكتروني مع إدارة مخاطر ذكية.{" "}
            </p>{" "}
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              {" "}
              <Link href="/alerts" className="ui-public-seo-cta-primary">
                {" "}
                ضبط تنبيه سعر{" "}
              </Link>{" "}
              <Link
                href="/subscriptions"
                className="ui-public-seo-cta-secondary"
              >
                {" "}
                الاشتراكات{" "}
              </Link>{" "}
            </div>{" "}
          </div>{" "}
        </section>{" "}
        <div className="space-y-6">
          {" "}
          {alertSections.map((section) => (
            <AlertSection key={section.title} {...section} />
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
              إجابات عن التنبيهات السعرية في HasaN CharT World
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
              انتقل إلى صفحات HasaN CharT World المرتبطة بالتنبيهات
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
