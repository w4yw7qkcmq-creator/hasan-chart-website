import Link from "next/link";
import Breadcrumbs from "../seo/Breadcrumbs";
const breadcrumbs = [
  { label: "الرئيسية", href: "/" },
  { label: "من نحن", href: "/about" },
];
const services = [
  { icon: "📊", title: "الأسعار المباشرة", href: "/#prices" },
  { icon: "🔔", title: "التنبيهات السعرية", href: "/#alerts" },
  { icon: "📝", title: "التحليلات اليومية", href: "/daily-analysis" },
  { icon: "🧠", title: "طلب تحليل عملة", href: "/analysis/request" },
  { icon: "📰", title: "الأخبار الاقتصادية", href: "/news" },
  { icon: "📂", title: "إدارة الحسابات", href: "/account-management-service" },
  { icon: "💎", title: "الاشتراكات الاحترافية", href: "/subscriptions" },
  { icon: "🤝", title: "برنامج الشركاء", href: "/partner-center" },
  { icon: "🎓", title: "أكاديمية التداول", href: "/trading-academy" },
];
const markets = [
  { icon: "₿", title: "العملات الرقمية" },
  { icon: "💱", title: "الفوركس" },
  { icon: "📈", title: "الأسهم" },
  { icon: "🥇", title: "الذهب" },
  { icon: "🥈", title: "الفضة" },
  { icon: "🛢️", title: "النفط" },
  { icon: "🌍", title: "المؤشرات العالمية" },
];
const strengths = [
  "منصة عربية متخصصة",
  "تحديثات لحظية",
  "أخبار اقتصادية",
  "تحليلات احترافية",
  "واجهة سهلة",
  "حماية بيانات المستخدمين",
  "دعم فني سريع",
  "تطوير مستمر",
];
const stats = [
  { label: "عدد المستخدمين", value: "12,500+" },
  { label: "عدد التحليلات", value: "8,400+" },
  { label: "عدد التنبيهات", value: "36,000+" },
  { label: "عدد الأخبار", value: "4,200+" },
];
const internalLinks = [
  { label: "الخدمات", href: "/#services" },
  { label: "الأخبار", href: "/news" },
  { label: "التحليلات اليومية", href: "/daily-analysis" },
  { label: "برنامج الشركاء", href: "/partner-center" },
  { label: "الاشتراكات", href: "/subscriptions" },
  { label: "تواصل معنا", href: "/about#contact" },
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
function InfoCard({ icon, title, href }) {
  const className =
    "public-seo-card group rounded-[24px] border admin-panel-border ui-glass-045 p-5 shadow-xl backdrop-blur-2xl transition hover:admin-panel-border hover:admin-panel";
  const content = (
    <>
      {" "}
      <div className="grid h-12 w-12 place-items-center rounded-2xl border admin-panel-border admin-panel text-2xl">
        {" "}
        {icon}{" "}
      </div>{" "}
      <h3 className="mt-4 ui-public-seo-title text-lg">{title}</h3>{" "}
      {href ? (
        <span className="mt-2 inline-flex text-sm font-bold admin-text-muted transition group-hover:admin-text-muted">
          {" "}
          استكشف ←{" "}
        </span>
      ) : null}{" "}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={`${className} block no-underline`}>
        {" "}
        {content}{" "}
      </Link>
    );
  }
  return <article className={className}>{content}</article>;
}
export default function AboutPageContent() {
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
            <span className="inline-flex rounded-full border admin-panel-border admin-panel px-5 py-2 text-xs font-black admin-text-muted">
              {" "}
              من نحن{" "}
            </span>{" "}
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">
              منصة HasaN CharT World
            </h1>{" "}
            <p className="ui-public-seo-body ui-public-seo-body--lg mx-auto mt-6 max-w-4xl">
              {" "}
              HasaN CharT World هي منصة عربية احترافية متخصصة في متابعة وتحليل
              الأسواق المالية، تقدم للمتداولين أدوات ذكية تساعدهم على اتخاذ
              قرارات استثمارية أفضل من خلال التحليلات الاحترافية والأخبار
              الاقتصادية والتنبيهات السعرية وإدارة الحسابات.{" "}
            </p>{" "}
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              {" "}
              <Link href="/register" className="ui-public-seo-cta-primary">
                {" "}
                ابدأ الآن{" "}
              </Link>{" "}
              <Link href="/#services" className="ui-public-seo-cta-secondary">
                {" "}
                استكشف الخدمات{" "}
              </Link>{" "}
            </div>{" "}
          </div>{" "}
        </section>{" "}
        <section className="ui-public-seo-card public-seo-card">
          {" "}
          <h2 className="ui-public-seo-title ui-public-seo-title--section">
            مهمتنا
          </h2>{" "}
          <p className="mt-6 text-lg leading-9 ui-public-seo-body">
            {" "}
            هدفنا في HasaN CharT World هو توفير بيئة متكاملة للمتداول العربي
            تجمع جميع الأدوات التي يحتاجها داخل منصة واحدة: متابعة الأسعار،
            قراءة السوق، التحليل، التنبيه، وإدارة الحسابات. نؤمن أن المتداول
            العربي يستحق منصة تتحدث لغته، تفهم سياقه الزمني، وتقدم له خدمات
            احترافية بشفافية ودون تعقيد.{" "}
          </p>{" "}
        </section>{" "}
        <section className="ui-public-seo-card public-seo-card">
          {" "}
          <h2 className="ui-public-seo-title ui-public-seo-title--section">
            رؤيتنا
          </h2>{" "}
          <p className="mt-6 text-lg leading-9 ui-public-seo-body">
            {" "}
            أن تصبح HasaN CharT World من أكبر المنصات العربية المتخصصة في
            الأسواق المالية والتداول والاستثمار، وأن نكون المرجع الأول للمتداول
            الذي يبحث عن تحليل موثوق، أخبار دقيقة، وأدوات عملية تساعده على النمو
            بثقة وانضباط.{" "}
          </p>{" "}
        </section>{" "}
        <SectionBlock
          title="ماذا نقدم؟"
          subtitle="خدمات متكاملة داخل منصة واحدة"
        >
          {" "}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {" "}
            {services.map((service) => (
              <InfoCard key={service.title} {...service} />
            ))}{" "}
          </div>{" "}
        </SectionBlock>{" "}
        <SectionBlock
          title="الأسواق التي نغطيها"
          subtitle="تغطية واسعة لأهم أسواق المال"
        >
          {" "}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {" "}
            {markets.map((market) => (
              <InfoCard
                key={market.title}
                icon={market.icon}
                title={market.title}
              />
            ))}{" "}
          </div>{" "}
        </SectionBlock>{" "}
        <section className="ui-public-seo-card public-seo-card">
          {" "}
          <h2 className="text-center ui-public-seo-title ui-public-seo-title--section">
            لماذا HasaN CharT World؟
          </h2>{" "}
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {" "}
            {strengths.map((item) => (
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
          title="إحصائيات احترافية"
          subtitle="أرقام تعكس نمو مجتمع المنصة"
        >
          {" "}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {" "}
            {stats.map((stat) => (
              <article
                key={stat.label}
                className="ui-public-seo-card ui-public-seo-card--compact public-seo-card text-center"
              >
                {" "}
                <p className="text-3xl font-black admin-text-muted md:text-4xl">
                  {stat.value}
                </p>{" "}
                <p className="mt-3 text-sm font-bold ui-public-seo-subtitle">
                  {stat.label}
                </p>{" "}
              </article>
            ))}{" "}
          </div>{" "}
        </SectionBlock>{" "}
        <section className="ui-public-seo-cta-band ui-public-seo-cta-band--full">
          {" "}
          <h2 className="ui-public-seo-title ui-public-seo-title--section">
            ابدأ رحلتك مع HasaN CharT World اليوم
          </h2>{" "}
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 ui-public-seo-body">
            {" "}
            انضم إلى مجتمع المتداولين العرب واستفد من التحليلات والأخبار
            والتنبيهات والخدمات الاحترافية في مكان واحد.{" "}
          </p>{" "}
          <div className="mt-8">
            {" "}
            <Link
              href="/register"
              className="inline-flex ui-public-seo-cta-primary"
            >
              {" "}
              إنشاء حساب{" "}
            </Link>{" "}
          </div>{" "}
        </section>{" "}
        <SectionBlock
          title="روابط مهمة"
          subtitle="انتقل مباشرة إلى أقسام المنصة"
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
        <section id="contact" className="ui-public-seo-card public-seo-card">
          {" "}
          <h2 className="ui-public-seo-title ui-public-seo-title--section">
            تواصل معنا
          </h2>{" "}
          <p className="ui-public-seo-body ui-public-seo-body--lg mt-4">
            {" "}
            فريق HasaN CharT World متاح عبر القنوات الرسمية التالية:{" "}
          </p>{" "}
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {" "}
            <a
              href="https://t.me/HasaNCharTSupport"
              target="_blank"
              rel="noopener noreferrer"
              className="ui-public-seo-contact-link"
            >
              {" "}
              <span className="font-bold">الدعم الفني على Telegram</span>{" "}
              <span className="admin-text-muted">←</span>{" "}
            </a>{" "}
            <a
              href="mailto:support@hasanchartworld.com"
              className="ui-public-seo-contact-link"
            >
              {" "}
              <span className="font-bold">
                support@hasanchartworld.com
              </span>{" "}
              <span className="admin-text-muted">←</span>{" "}
            </a>{" "}
          </div>{" "}
        </section>{" "}
      </div>{" "}
    </main>
  );
}
