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
      <div className="text-center">
        <h2 className="text-3xl font-black text-white md:text-4xl">{title}</h2>
        {subtitle ? <p className="mt-3 text-slate-400">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function InfoCard({ icon, title, href }) {
  const className =
    "public-seo-card group rounded-[24px] border border-cyan-300/15 bg-white/[0.045] p-5 shadow-xl backdrop-blur-2xl transition hover:border-cyan-300/35 hover:bg-cyan-400/10";

  const content = (
    <>
      <div className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-2xl">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-black text-white">{title}</h3>
      {href ? (
        <span className="mt-2 inline-flex text-sm font-bold text-cyan-300 transition group-hover:text-cyan-200">
          استكشف ←
        </span>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`${className} block no-underline`}>
        {content}
      </Link>
    );
  }

  return <article className={className}>{content}</article>;
}

export default function AboutPageContent() {
  return (
    <main className="public-seo-page relative min-h-screen overflow-hidden bg-[#020617] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(0,102,255,0.35),transparent_30%),radial-gradient(circle_at_86%_35%,rgba(34,211,238,0.16),transparent_30%),linear-gradient(135deg,#020617,#07142f_48%,#030712)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.13] bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:76px_76px]" />

      <div className="relative z-10 mx-auto max-w-6xl space-y-8 px-4 py-12 md:px-6 md:py-16">
        <Breadcrumbs items={breadcrumbs} variant="dark" />

        <section className="public-seo-hero relative overflow-hidden rounded-[34px] border border-cyan-300/15 bg-gradient-to-br from-[#07142f]/85 via-[#040b1c]/90 to-[#020617]/95 p-8 text-center shadow-2xl backdrop-blur-2xl md:p-12">
          <div className="absolute -left-24 top-10 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl" />
          <div className="absolute bottom-0 right-20 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative z-10">
            <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-5 py-2 text-xs font-black text-cyan-200">
              من نحن
            </span>
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">منصة HasaN CharT World</h1>
            <p className="mx-auto mt-6 max-w-4xl text-lg leading-9 text-slate-300">
              HasaN CharT World هي منصة عربية احترافية متخصصة في متابعة وتحليل الأسواق المالية، تقدم
              للمتداولين أدوات ذكية تساعدهم على اتخاذ قرارات استثمارية أفضل من خلال التحليلات
              الاحترافية والأخبار الاقتصادية والتنبيهات السعرية وإدارة الحسابات.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/register"
                className="rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-8 py-4 font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.32)] transition hover:scale-[1.02]"
              >
                ابدأ الآن
              </Link>
              <Link
                href="/#services"
                className="rounded-2xl border border-cyan-300/20 bg-black/25 px-8 py-4 font-black text-cyan-100 transition hover:bg-cyan-400/10"
              >
                استكشف الخدمات
              </Link>
            </div>
          </div>
        </section>

        <section className="public-seo-card rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-2xl md:p-10">
          <h2 className="text-3xl font-black text-white">مهمتنا</h2>
          <p className="mt-6 text-lg leading-9 text-slate-300">
            هدفنا في HasaN CharT World هو توفير بيئة متكاملة للمتداول العربي تجمع جميع الأدوات التي
            يحتاجها داخل منصة واحدة: متابعة الأسعار، قراءة السوق، التحليل، التنبيه، وإدارة الحسابات.
            نؤمن أن المتداول العربي يستحق منصة تتحدث لغته، تفهم سياقه الزمني، وتقدم له خدمات احترافية
            بشفافية ودون تعقيد.
          </p>
        </section>

        <section className="public-seo-card rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-2xl md:p-10">
          <h2 className="text-3xl font-black text-white">رؤيتنا</h2>
          <p className="mt-6 text-lg leading-9 text-slate-300">
            أن تصبح HasaN CharT World من أكبر المنصات العربية المتخصصة في الأسواق المالية والتداول
            والاستثمار، وأن نكون المرجع الأول للمتداول الذي يبحث عن تحليل موثوق، أخبار دقيقة، وأدوات
            عملية تساعده على النمو بثقة وانضباط.
          </p>
        </section>

        <SectionBlock title="ماذا نقدم؟" subtitle="خدمات متكاملة داخل منصة واحدة">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <InfoCard key={service.title} {...service} />
            ))}
          </div>
        </SectionBlock>

        <SectionBlock title="الأسواق التي نغطيها" subtitle="تغطية واسعة لأهم أسواق المال">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {markets.map((market) => (
              <InfoCard key={market.title} icon={market.icon} title={market.title} />
            ))}
          </div>
        </SectionBlock>

        <section className="public-seo-card rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-2xl md:p-10">
          <h2 className="text-center text-3xl font-black text-white">لماذا HasaN CharT World؟</h2>
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {strengths.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-slate-200"
              >
                <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-cyan-400/10 text-cyan-300">
                  ✓
                </span>
                <span className="leading-8 font-bold">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <SectionBlock title="إحصائيات احترافية" subtitle="أرقام تعكس نمو مجتمع المنصة">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <article
                key={stat.label}
                className="public-seo-card rounded-[24px] border border-cyan-300/15 bg-white/[0.045] p-6 text-center shadow-xl backdrop-blur-2xl"
              >
                <p className="text-3xl font-black text-cyan-200 md:text-4xl">{stat.value}</p>
                <p className="mt-3 text-sm font-bold text-slate-400">{stat.label}</p>
              </article>
            ))}
          </div>
        </SectionBlock>

        <section className="rounded-[34px] border border-cyan-300/20 bg-gradient-to-l from-blue-700/30 via-blue-600/20 to-cyan-400/10 p-8 text-center shadow-2xl md:p-10">
          <h2 className="text-3xl font-black text-white">ابدأ رحلتك مع HasaN CharT World اليوم</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-slate-200">
            انضم إلى مجتمع المتداولين العرب واستفد من التحليلات والأخبار والتنبيهات والخدمات
            الاحترافية في مكان واحد.
          </p>
          <div className="mt-8">
            <Link
              href="/register"
              className="inline-flex rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-8 py-4 font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.32)]"
            >
              إنشاء حساب
            </Link>
          </div>
        </section>

        <SectionBlock title="روابط مهمة" subtitle="انتقل مباشرة إلى أقسام المنصة">
          <div className="flex flex-wrap justify-center gap-3">
            {internalLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-5 py-3 text-sm font-black text-cyan-100 no-underline transition hover:border-cyan-300/40 hover:bg-cyan-400/20 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </SectionBlock>

        <section
          id="contact"
          className="public-seo-card rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-2xl md:p-10"
        >
          <h2 className="text-3xl font-black text-white">تواصل معنا</h2>
          <p className="mt-4 text-lg leading-9 text-slate-300">
            فريق HasaN CharT World متاح عبر القنوات الرسمية التالية:
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <a
              href="https://t.me/HasaNCharTSupport"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-white no-underline transition hover:border-cyan-300/35 hover:bg-cyan-400/10"
            >
              <span className="font-bold">الدعم الفني على Telegram</span>
              <span className="text-cyan-300">←</span>
            </a>
            <a
              href="mailto:support@hasanchartworld.com"
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-white no-underline transition hover:border-cyan-300/35 hover:bg-cyan-400/10"
            >
              <span className="font-bold">support@hasanchartworld.com</span>
              <span className="text-cyan-300">←</span>
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
