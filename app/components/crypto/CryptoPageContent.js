import Link from "next/link";
import Breadcrumbs from "../seo/Breadcrumbs";
const breadcrumbs = [
  { label: "الرئيسية", href: "/" },
  { label: "الأسواق المالية", href: "/markets" },
  { label: "العملات الرقمية", href: "/crypto" },
];
const cryptoSections = [
  {
    icon: "₿",
    title: "ما هو سوق العملات الرقمية؟",
    description:
      "سوق العملات الرقمية يُتداول فيه أصول لامركزية مبنية على البلوكشين على مدار 24 ساعة، بسيولة عالية وتقلبات سريعة تتأثر بالأخبار والتنظيم والتدفقات المؤسسية.",
    links: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "الفوركس", href: "/forex" },
    ],
  },
  {
    icon: "⟠",
    title: "بيتكوين وإيثيريوم",
    description:
      "البيتكوين المرجع الأول للسوق، والإيثيريوم منصة عقود ذكية وطبقة Web3. معظم حركة السوق تدور حول هذين الأصلين وتأثيرهما على العملات البديلة.",
    links: [
      { label: "أخبار البيتكوين", href: "/news/tag/bitcoin" },
      { label: "أخبار الكريبتو", href: "/news/category/crypto" },
      { label: "تحليل الكريبتو", href: "/crypto-analysis" },
    ],
  },
  {
    icon: "🌊",
    title: "السيولة وحركة السوق",
    description:
      "السيولة تحدد سرعة تنفيذ الصفقات وعمق السوق، وحركة السعر في الكريبتو تتأثر بالجلسات الآسيوية والأمريكية والتدفقات بين المنصات والمؤسسات.",
    links: [
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "الأسعار المباشرة", href: "/#prices" },
    ],
  },
  {
    icon: "📉",
    title: "تحليل العملات الرقمية",
    description:
      "تحليل الكريبتو يجمع بين قراءة الشارتات والاتجاهات ومستويات الدعم والمقاومة، وفهم السياق الأساسي الذي يحرك البيتكوين والإيثيريوم والعملات البديلة.",
    links: [
      { label: "تحليل الكريبتو", href: "/crypto-analysis" },
      { label: "طلب تحليل", href: "/analysis/request" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
    ],
  },
  {
    icon: "📡",
    title: "إشارات الكريبتو",
    description:
      "إشارات الكريبتو الاحترافية تقدّم نقاط دخول وخروج واضحة للبيتكوين والإيثيريوم والأصول الرقمية الرئيسية، مدعومة بتحليل فني وأساسي.",
    links: [
      { label: "تحليل الكريبتو", href: "/crypto-analysis" },
      { label: "VIP Spot", href: "/vip-spot" },
    ],
  },
  {
    icon: "💎",
    title: "VIP Spot",
    description:
      "خدمة VIP Spot تقدّم توصيات وتغطية احترافية لتداول الكريبتو في السوق الفوري (Spot) ضمن باقات اشتراك مصممة للمتداولين الجادين.",
    links: [
      { label: "VIP Spot", href: "/vip-spot" },
      { label: "الاشتراكات", href: "/subscriptions" },
    ],
  },
  {
    icon: "⚡",
    title: "VIP Futures",
    description:
      "خدمة VIP Futures تغطي تداول العقود الآجلة للكريبتو مع إدارة مخاطر واضحة وتحليلات تدعم قرارات التداول في الأسواق ذات الرافعة.",
    links: [
      { label: "VIP Futures", href: "/vip-futures" },
      { label: "الاشتراكات", href: "/subscriptions" },
    ],
  },
  {
    icon: "🛡️",
    title: "إدارة المخاطر",
    description:
      "إدارة المخاطر في الكريبتو تشمل تحديد حجم الصفقة، وقف الخسارة، تنويع المحفظة، وعدم المخاطرة بما لا تتحمل خسارته في سوق عالي التقلب.",
    links: [
      { label: "إدارة الحسابات", href: "/account-management" },
      { label: "الاشتراكات", href: "/subscriptions" },
    ],
  },
  {
    icon: "📰",
    title: "الأخبار المؤثرة على الكريبتو",
    description:
      "أخبار التنظيم والفيدرالي والتبنّي المؤسسي والاختراقات تؤثر مباشرة على سعر البيتكوين والإيثيريوم — المتابعة العاجلة ضرورية لكل متداول.",
    links: [
      { label: "أخبار الكريبتو", href: "/news/category/crypto" },
      { label: "جميع الأخبار", href: "/news" },
      { label: "أخبار البيتكوين", href: "/news/tag/bitcoin" },
    ],
  },
];
const faqItems = [
  {
    q: "ما هو سوق العملات الرقمية؟",
    a: "سوق عالمي يُتداول فيه أصول رقمية لامركزية على مدار الساعة، أشهرها البيتكوين والإيثيريوم والعملات البديلة.",
  },
  {
    q: "هل يوفر HasaN CharT World تحليلات وإشارات للكريبتو؟",
    a: "نعم، نوفر تحليل العملات الرقمية وإشارات الكريبتو وخدمات VIP Spot و VIP Futures ضمن باقات الاشتراك.",
  },
  {
    q: "ما الفرق بين VIP Spot و VIP Futures؟",
    a: "VIP Spot يغطي التداول الفوري للأصول الرقمية، بينما VIP Futures يغطي العقود الآجلة مع إدارة مخاطر مخصصة للرافعة.",
  },
  {
    q: "كيف أتابع الأخبار المؤثرة على الكريبتو؟",
    a: "يمكنك زيارة قسم أخبار الكريبتو أو تصفح وسوم البيتكوين والكريبتو ضمن صفحة الأخبار.",
  },
  {
    q: "كيف أبدأ بخدمات الكريبتو في المنصة؟",
    a: "أنشئ حساباً واستكشف تحليل العملات الرقمية أو الاشتراكات أو خدمات VIP Spot و VIP Futures.",
  },
];
const internalLinks = [
  { label: "الأصول والأسواق", href: "/assets" },
  { label: "الأسواق المالية", href: "/markets" },
  { label: "الفوركس", href: "/forex" },
  { label: "الأخبار", href: "/news" },
  { label: "التحليلات اليومية", href: "/daily-analysis" },
  { label: "طلب تحليل", href: "/analysis/request" },
  { label: "الاشتراكات", href: "/subscriptions" },
  { label: "VIP Spot", href: "/vip-spot" },
  { label: "VIP Futures", href: "/vip-futures" },
  { label: "إدارة الحسابات", href: "/account-management" },
  { label: "من نحن", href: "/about" },
  { label: "العلامة التجارية", href: "/brand" },
  { label: "الشركة", href: "/company" },
];
function CryptoSection({ icon, title, description, links }) {
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
export default function CryptoPageContent() {
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
              العملات الرقمية{" "}
            </span>{" "}
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">
              سوق العملات الرقمية
            </h1>{" "}
            <p className="ui-public-seo-body ui-public-seo-body--lg mx-auto mt-6 max-w-4xl">
              {" "}
              من تحليل البيتكوين والإيثيريوم إلى إشارات الكريبتو وخدمات VIP Spot
              و VIP Futures — HasaN CharT World تقدّم تغطية عربية احترافية لسوق
              الكريبتو مع أخبار وإدارة مخاطر.{" "}
            </p>{" "}
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              {" "}
              <Link
                href="/crypto-analysis"
                className="ui-public-seo-cta-primary"
              >
                {" "}
                تحليل الكريبتو{" "}
              </Link>{" "}
              <Link href="/vip-spot" className="ui-public-seo-cta-secondary">
                {" "}
                VIP Spot{" "}
              </Link>{" "}
            </div>{" "}
          </div>{" "}
        </section>{" "}
        <div className="space-y-6">
          {" "}
          {cryptoSections.map((section) => (
            <CryptoSection key={section.title} {...section} />
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
              إجابات عن العملات الرقمية في HasaN CharT World
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
              انتقل إلى صفحات HasaN CharT World المرتبطة بالكريبتو
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
