import Link from "next/link";
import Breadcrumbs from "../seo/Breadcrumbs";
const breadcrumbs = [
  { label: "الرئيسية", href: "/" },
  { label: "الأسواق المالية", href: "/markets" },
];
const marketSections = [
  {
    icon: "₿",
    title: "العملات الرقمية",
    description:
      "تغطية شاملة لسوق الكريبتو من البيتكوين إلى الأصول البديلة، مع تحليلات فنية وأساسية وتنبيهات وتوصيات ضمن خدمات المنصة.",
    links: [
      { label: "تحليل العملات الرقمية", href: "/crypto-analysis" },
      { label: "إشارات VIP Spot", href: "/vip-spot" },
      { label: "إشارات VIP Futures", href: "/vip-futures" },
      { label: "أخبار الكريبتو", href: "/news/category/crypto" },
    ],
  },
  {
    icon: "💱",
    title: "الفوركس",
    description:
      "متابعة أزواج العملات الرئيسية والثانوية، قراءة تحركات الدولار واليورو والين، وربط الأخبار الاقتصادية بحركة الفوركس.",
    links: [
      { label: "إشارات الفوركس", href: "/forex-signals" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
    ],
  },
  {
    icon: "🥇",
    title: "الذهب",
    description:
      "تحليل حركة الذهب XAU في سياق الماكرو والفوركس، مع أخبار وتنبيهات تساعد على فهم تحركات المعدن الأصفر.",
    links: [
      { label: "إشارات الفوركس", href: "/forex-signals" },
      { label: "أخبار الذهب", href: "/news/tag/gold" },
      { label: "طلب تحليل", href: "/analysis/request" },
    ],
  },
  {
    icon: "🥈",
    title: "الفضة",
    description:
      "متابعة الفضة كأصل مرتبط بالذهب والطلب الصناعي، ضمن قراءة أوسع للمعادن الثمينة في الأسواق العالمية.",
    links: [
      { label: "إشارات الفوركس", href: "/forex-signals" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
    ],
  },
  {
    icon: "📈",
    title: "الأسهم",
    description:
      "تغطية لأسواق الأسهم العالمية، نتائج الشركات، المؤشرات القطاعية، والأخبار المؤثرة في أداء الأسهم.",
    links: [
      { label: "أخبار الأسهم", href: "/news/category/stocks" },
      { label: "وسم الأسهم", href: "/news/tag/stocks" },
      { label: "الأخبار الاقتصادية", href: "/news" },
    ],
  },
  {
    icon: "🌍",
    title: "المؤشرات العالمية",
    description:
      "متابعة المؤشرات الرئيسية مثل ناسداك وداو جونز وS&P وغيرها، وربطها بالسياق الاقتصادي العام.",
    links: [
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "أخبار الاقتصاد", href: "/news/category/economy" },
      { label: "الأسعار المباشرة", href: "/#prices" },
    ],
  },
  {
    icon: "🛢️",
    title: "النفط والطاقة",
    description:
      "قراءة أسواق النفط والطاقة في ضوء أوبك والتضخم والجيوسياسة، مع أخبار عاجلة وتأثيرها على الأسواق.",
    links: [
      { label: "أخبار النفط", href: "/news/tag/oil" },
      { label: "أخبار السلع", href: "/news/category/commodities" },
      { label: "أخبار جيوسياسية", href: "/news/category/geopolitics" },
    ],
  },
  {
    icon: "📰",
    title: "الأخبار الاقتصادية",
    description:
      "تغطية إخبارية عاجلة ومصنفة تساعد المتداول على فهم ما يحرك السوق قبل اتخاذ القرار.",
    links: [
      { label: "جميع الأخبار", href: "/news" },
      { label: "أخبار الفيدرالي", href: "/news/tag/fed" },
      { label: "أخبار التضخم", href: "/news/tag/inflation" },
    ],
  },
  {
    icon: "📉",
    title: "التحليل الفني",
    description:
      "دراسات فنية من خبراء السوق تشمل مستويات الدعم والمقاومة، الاتجاهات، وأنماط السعر في مختلف الأصول.",
    links: [
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "تحليل الكريبتو", href: "/crypto-analysis" },
      { label: "إشارات الفوركس", href: "/forex-signals" },
    ],
  },
  {
    icon: "🧠",
    title: "التحليل الأساسي",
    description:
      "قراءة الأخبار والبيانات الاقتصادية والسياق المؤسسي الذي يؤثر على الأصول، وليس الشارت فقط.",
    links: [
      { label: "طلب تحليل مخصص", href: "/analysis/request" },
      { label: "الأخبار الاقتصادية", href: "/news" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
    ],
  },
  {
    icon: "🔔",
    title: "التنبيهات السعرية",
    description:
      "تنبيهات فورية عند وصول السعر لمستويات محددة مسبقاً، لتساعدك على عدم تفويت الفرص أو تجاهل المخاطر.",
    links: [
      { label: "تنبيه سعر", href: "/#alerts" },
      { label: "الاشتراكات", href: "/subscriptions" },
    ],
  },
  {
    icon: "📂",
    title: "إدارة الحسابات",
    description:
      "خدمة متخصصة لإدارة حسابات التداول باحترافية ضمن إطار واضح من المتابعة والتواصل.",
    links: [
      { label: "إدارة الحسابات", href: "/account-management-service" },
      { label: "طلب الخدمة", href: "/account-management" },
    ],
  },
  {
    icon: "💼",
    title: "خدمات المستثمرين",
    description:
      "باقات اشتراك وتوصيات VIP Spot و VIP Futures وبرنامج شركاء لخدمة المستثمرين والمتداولين بمستويات مختلفة.",
    links: [
      { label: "الاشتراكات", href: "/subscriptions" },
      { label: "VIP Spot", href: "/vip-spot" },
      { label: "VIP Futures", href: "/vip-futures" },
      { label: "برنامج الشركاء", href: "/partner-center" },
    ],
  },
];
const whyCover = [
  "المتداول العربي يحتاج تغطية متعددة وليست أداة واحدة",
  "الأسواق مترابطة والخبر الاقتصادي يؤثر على أكثر من أصل",
  "التحليل الفني والأساسي معاً يعطيان صورة أوضح",
  "التنبيهات والأخبار تسرّع اتخاذ القرار في الأسواق السريعة",
  "خدمات المستثمرين تكمّل المتابعة اليومية للسوق",
];
const faqItems = [
  {
    q: "ما الأسواق التي تغطيها HasaN CharT World؟",
    a: "نغطي العملات الرقمية، الفوركس، الذهب، الفضة، الأسهم، المؤشرات، النفط، الأخبار الاقتصادية، والتحليلات المرتبطة بها.",
  },
  {
    q: "هل توفر المنصة تحليلات لكل سوق؟",
    a: "نعم، نوفر تحليلات فنية وأساسية وتنبيهات وأخباراً مرتبطة بكل سوق ضمن خدماتنا وصفحاتنا المتخصصة.",
  },
  {
    q: "كيف أتابع أخبار سوق معين؟",
    a: "يمكنك زيارة قسم الأخبار أو تصفح التصنيفات والوسوم مثل الكريبتو والفوركس والذهب والنفط.",
  },
  {
    q: "هل التحليلات تعتمد على خبراء بشريين؟",
    a: "نعم، التحليلات الأساسية تصدر عن خبراء بخبرة ميدانية، والذكاء الاصطناعي أداة مساعدة في بعض الخدمات فقط.",
  },
  {
    q: "كيف أبدأ باستخدام خدمات سوق محدد؟",
    a: "أنشئ حساباً واستكشف صفحة الخدمة المناسبة مثل تحليل الكريبتو أو إشارات الفوركس أو الاشتراكات.",
  },
];
const internalLinks = [
  { label: "الأصول والأسواق", href: "/assets" },
  { label: "من نحن", href: "/about" },
  { label: "العلامة التجارية", href: "/brand" },
  { label: "الشركة", href: "/company" },
  { label: "الأخبار", href: "/news" },
  { label: "التحليلات اليومية", href: "/daily-analysis" },
  { label: "الاشتراكات", href: "/subscriptions" },
  { label: "برنامج الشركاء", href: "/partner-center" },
  { label: "إدارة الحسابات", href: "/account-management" },
  { label: "طلب تحليل", href: "/analysis/request" },
  { label: "VIP Spot", href: "/vip-spot" },
  { label: "VIP Futures", href: "/vip-futures" },
  { label: "تواصل معنا", href: "/about#contact" },
];
function MarketSection({ icon, title, description, links }) {
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
export default function MarketsPageContent() {
  return (
    <main className="ui-public-seo-page public-seo-page ui-text-strong overflow-x-hidden overflow-y-visible">
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
              الأسواق المالية{" "}
            </span>{" "}
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">
              الأسواق التي نغطيها
            </h1>{" "}
            <p className="ui-public-seo-body ui-public-seo-body--lg mx-auto mt-6 max-w-4xl">
              {" "}
              منصة HasaN CharT World تقدم تغطية متكاملة للأسواق المالية
              العالمية: من العملات الرقمية والفوركس إلى الذهب والأسهم والمؤشرات
              والنفط، مع أخبار اقتصادية وتحليلات وتنبيهات وخدمات
              للمستثمرين.{" "}
            </p>{" "}
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              {" "}
              <Link href="/assets" className="ui-public-seo-cta-primary">
                {" "}
                دليل مراكز الأصول{" "}
              </Link>{" "}
              <Link href="/news" className="ui-public-seo-cta-secondary">
                {" "}
                أخبار الأسواق{" "}
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
        <section className="ui-public-seo-card public-seo-card">
          {" "}
          <h2 className="ui-public-seo-title ui-public-seo-title--section">
            مقدمة عن الأسواق المالية
          </h2>{" "}
          <div className="ui-public-seo-body ui-public-seo-body--lg mt-6 space-y-5">
            {" "}
            <p>
              {" "}
              الأسواق المالية ليست رقماً واحداً على الشاشة، بل منظومة مترابطة من
              أصول وأخبار وسيولة وتوقعات. في HasaN CharT World نغطي هذه الأسواق
              لأن المتداول العربي يحتاج رؤية شاملة وليس أداة منفصلة لكل
              سوق.{" "}
            </p>{" "}
            <p>
              {" "}
              نربط بين التحليل الفني والأساسي، وبين الأخبار الاقتصادية
              والتنبيهات السعرية، وبين خدمات الاشتراك وإدارة الحسابات — كل ذلك
              ضمن منصة عربية واحدة يقودها فريق خبراء بخبرة ميدانية طويلة.{" "}
            </p>{" "}
          </div>{" "}
        </section>{" "}
        <div className="space-y-6">
          {" "}
          {marketSections.map((section) => (
            <MarketSection key={section.title} {...section} />
          ))}{" "}
        </div>{" "}
        <section className="ui-public-seo-card public-seo-card">
          {" "}
          <h2 className="text-center ui-public-seo-title ui-public-seo-title--section">
            لماذا نغطي هذه الأسواق؟
          </h2>{" "}
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {" "}
            {whyCover.map((item) => (
              <li key={item} className="ui-public-seo-list-item">
                {" "}
                <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full admin-panel admin-text-muted">
                  {" "}
                  ✓{" "}
                </span>{" "}
                <span className="leading-8 font-bold">{item}</span>{" "}
              </li>
            ))}{" "}
          </ul>{" "}
        </section>{" "}
        <section className="space-y-5">
          {" "}
          <div className="text-center">
            {" "}
            <h2 className="ui-public-seo-title ui-public-seo-title--section">
              الأسئلة الشائعة
            </h2>{" "}
            <p className="ui-public-seo-subtitle mt-3">
              إجابات عن تغطية الأسواق في HasaN CharT World
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
              روابط المنصة
            </h2>{" "}
            <p className="ui-public-seo-subtitle mt-3">
              انتقل إلى صفحات HasaN CharT World الرسمية
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
