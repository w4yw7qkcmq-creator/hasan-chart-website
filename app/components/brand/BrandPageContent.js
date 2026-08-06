import Link from "next/link";
import Breadcrumbs from "../seo/Breadcrumbs";
const breadcrumbs = [
  { label: "الرئيسية", href: "/" },
  { label: "العلامة التجارية", href: "/brand" },
];
const coverageAreas = [
  {
    icon: "₿",
    title: "العملات الرقمية",
    text: "تحليلات وتنبيهات وتوصيات تغطي أهم أصول الكريبتو.",
  },
  {
    icon: "💱",
    title: "الفوركس",
    text: "متابعة أزواج العملات والسيولة والتحركات اليومية.",
  },
  {
    icon: "🥇",
    title: "الذهب",
    text: "قراءة فنية وسياقية لحركة الذهب والمعادن.",
  },
  {
    icon: "📈",
    title: "المؤشرات",
    text: "تغطية للمؤشرات العالمية وحركة الأسواق العامة.",
  },
  {
    icon: "📰",
    title: "الأخبار الاقتصادية",
    text: "أخبار عاجلة ومصنفة تساعد على فهم السياق السوقي.",
  },
  {
    icon: "📝",
    title: "التحليلات",
    text: "تحليلات يومية وطلبات مخصصة من فريق خبراء.",
  },
  {
    icon: "🔔",
    title: "التنبيهات السعرية",
    text: "تنبيهات فورية عند وصول السعر للمستويات المحددة.",
  },
  {
    icon: "💎",
    title: "الاشتراكات",
    text: "باقات احترافية للوصول الكامل لخدمات المنصة.",
  },
  {
    icon: "📂",
    title: "إدارة الحسابات",
    text: "خدمة متخصصة لإدارة حسابات التداول باحترافية.",
  },
  {
    icon: "🤝",
    title: "برنامج الشركاء",
    text: "شراكة رسمية للترويج بمكافآت وشفافية.",
  },
];
const internalLinks = [
  { label: "من نحن", href: "/about" },
  { label: "الأخبار", href: "/news" },
  { label: "التحليلات اليومية", href: "/daily-analysis" },
  { label: "الاشتراكات", href: "/subscriptions" },
  { label: "برنامج الشركاء", href: "/partner-center" },
  { label: "إدارة الحسابات", href: "/account-management" },
  { label: "طلب تحليل", href: "/analysis/request" },
  { label: "VIP Spot", href: "/vip-spot" },
  { label: "VIP Futures", href: "/vip-futures" },
];
const brandValues = [
  "خبرة بشرية ميدانية في الأسواق",
  "شفافية في تقديم الخدمات",
  "واجهة عربية سهلة ومتخصصة",
  "تغطية متعددة للأسواق",
  "تطوير مستمر للمنصة",
  "دعم فني عبر القنوات الرسمية",
];
function SectionBlock({ title, subtitle, children }) {
  return (
    <section className="space-y-5">
      {" "}
      <div className="text-center">
        {" "}
        <h2 className="ui-public-seo-title ui-public-seo-title--section">
          {title}
        </h2>{" "}
        {subtitle ? (
          <p className="ui-public-seo-subtitle mt-3">{subtitle}</p>
        ) : null}{" "}
      </div>{" "}
      {children}{" "}
    </section>
  );
}
export default function BrandPageContent() {
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
          <div className="ui-public-seo-hero-glow ui-public-seo-hero-glow--primary ui-public-seo-hero-glow--left-lg" />{" "}
          <div className="absolute bottom-0 right-20 h-72 w-72 rounded-full admin-panel blur-3xl" />{" "}
          <div className="relative z-10">
            {" "}
            <div className="ui-public-seo-badge">
              {" "}
              <span className="text-3xl font-black">HC</span>{" "}
            </div>{" "}
            <span className="inline-flex rounded-full border admin-panel-border admin-panel px-5 py-2 text-xs font-black admin-text-muted">
              {" "}
              العلامة التجارية الرسمية{" "}
            </span>{" "}
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">
              HasaN CharT World
            </h1>{" "}
            <p className="ui-public-seo-body ui-public-seo-body--lg mx-auto mt-6 max-w-4xl">
              {" "}
              HasaN CharT World علامة تجارية عربية متخصصة في متابعة وتحليل
              الأسواق المالية، تجمع بين الخبرة البشرية الطويلة والأدوات الذكية
              لخدمة المتداول العربي في مكان واحد.{" "}
            </p>{" "}
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              {" "}
              <Link href="/about" className="ui-public-seo-cta-primary">
                {" "}
                تعرف على المنصة{" "}
              </Link>{" "}
              <Link
                href="/subscriptions"
                className="ui-public-seo-cta-secondary"
              >
                {" "}
                استكشف الخدمات{" "}
              </Link>{" "}
            </div>{" "}
          </div>{" "}
        </section>{" "}
        <section className="ui-public-seo-card public-seo-card">
          {" "}
          <h2 className="ui-public-seo-title ui-public-seo-title--section">
            هوية العلامة التجارية
          </h2>{" "}
          <div className="ui-public-seo-body ui-public-seo-body--lg mt-6 space-y-5">
            {" "}
            <p>
              {" "}
              HasaN CharT World ليست مجرد اسم تقني، بل علامة تجارية تمثل منصة
              عربية احترافية تخدم المتداولين والمستثمرين في المنطقة العربية.
              نبني هويتنا على الثقة والخبرة الميدانية والوضوح في تقديم التحليلات
              والأخبار والتنبيهات والخدمات الاحترافية.{" "}
            </p>{" "}
            <p>
              {" "}
              تغطي العلامة منصة متكاملة لمتابعة الأسواق المالية، وتجمع بين
              التحليل الفني، الأخبار الاقتصادية، التنبيهات السعرية، الاشتراكات،
              إدارة الحسابات، وبرنامج الشركاء ضمن تجربة واحدة موجهة للمتداول
              العربي.{" "}
            </p>{" "}
          </div>{" "}
        </section>{" "}
        <section className="public-seo-card ui-panel-warning md:p-10">
          {" "}
          <h2 className="text-3xl font-black ui-panel-warning__title">
            الخبراء أولاً، والذكاء الاصطناعي كأداة مساعدة
          </h2>{" "}
          <div className="mt-6 space-y-5 text-lg leading-9 ui-panel-warning__body">
            {" "}
            <p>
              {" "}
              التحليلات والتوصيات الأساسية في HasaN CharT World تصدر من خبراء
              لديهم خبرة طويلة في أسواق العملات الرقمية والفوركس والمعادن
              والمؤشرات. الخبرة البشرية هي الأساس في قراءة السياق، إدارة
              المخاطر، واتخاذ القرار.{" "}
            </p>{" "}
            <p>
              {" "}
              يُستخدم الذكاء الاصطناعي في بعض الخدمات كأداة مساعدة للمسح السريع
              أو تنظيم البيانات، وليس بديلاً عن الخبراء. لا نقدّم الذكاء
              الاصطناعي كحل خفي يحل محل التحليل البشري في التقارير أو التوصيات
              الرئيسية.{" "}
            </p>{" "}
          </div>{" "}
        </section>{" "}
        <SectionBlock
          title="مجالات التغطية"
          subtitle="أسواق وخدمات تحملها العلامة التجارية"
        >
          {" "}
          <div className="grid gap-4 md:grid-cols-2">
            {" "}
            {coverageAreas.map((item) => (
              <article
                key={item.title}
                className="ui-public-seo-card ui-public-seo-card--compact public-seo-card"
              >
                {" "}
                <div className="flex items-start gap-4">
                  {" "}
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border admin-panel-border admin-panel text-2xl">
                    {" "}
                    {item.icon}{" "}
                  </div>{" "}
                  <div>
                    {" "}
                    <h3 className="ui-public-seo-title ui-public-seo-title--card text-xl">
                      {item.title}
                    </h3>{" "}
                    <p className="ui-public-seo-body mt-2">{item.text}</p>{" "}
                  </div>{" "}
                </div>{" "}
              </article>
            ))}{" "}
          </div>{" "}
        </SectionBlock>{" "}
        <section className="ui-public-seo-card public-seo-card">
          {" "}
          <h2 className="text-center ui-public-seo-title ui-public-seo-title--section">
            قيم العلامة التجارية
          </h2>{" "}
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {" "}
            {brandValues.map((item) => (
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
        <SectionBlock
          title="روابط العلامة التجارية"
          subtitle="انتقل إلى صفحات وخدمات HasaN CharT World"
        >
          {" "}
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
        </SectionBlock>{" "}
        <section className="ui-public-seo-cta-band ui-public-seo-cta-band--full">
          {" "}
          <h2 className="ui-public-seo-title ui-public-seo-title--section">
            HasaN CharT World — علامة عربية للأسواق المالية
          </h2>{" "}
          <p className="mx-auto mt-4 max-w-3xl text-lg leading-8 ui-public-seo-body">
            {" "}
            اكتشف خدمات المنصة، تابع الأخبار والتحليلات، أو انضم إلى برنامج
            الشركاء عبر الروابط الرسمية داخل الموقع.{" "}
          </p>{" "}
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
            {" "}
            <Link href="/register" className="ui-public-seo-cta-primary">
              {" "}
              إنشاء حساب{" "}
            </Link>{" "}
            <Link href="/" className="ui-public-seo-cta-secondary">
              {" "}
              العودة للرئيسية{" "}
            </Link>{" "}
          </div>{" "}
        </section>{" "}
      </div>{" "}
    </main>
  );
}
