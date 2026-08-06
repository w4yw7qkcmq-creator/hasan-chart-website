import Link from "next/link";
import Breadcrumbs from "../seo/Breadcrumbs";

const breadcrumbs = [
  { label: "الرئيسية", href: "/" },
  { label: "الأسواق المالية", href: "/markets" },
  { label: "التحليل الفني", href: "/technical-analysis" },
];

const technicalSections = [
  {
    icon: "📊",
    title: "ما هو التحليل الفني؟",
    description:
      "التحليل الفني منهج لدراسة حركة السعر على الشارت — يعتمد على أن السعر يعكس كل المعلومات المتاحة، ويستخدم الدعوم والمقاومات والاتجاهات لتحديد نقاط الدخول والخروج.",
    links: [
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "الأسواق المالية", href: "/markets" },
    ],
  },
  {
    icon: "📏",
    title: "الدعوم والمقاومات",
    description:
      "مستويات الدعم والمقاومة من أساسيات التحليل الفني — المناطق التي يتوقف عندها السعر أو ينعكس، وتُعاد اختبارها مراراً.",
    links: [
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "طلب تحليل", href: "/analysis/request" },
    ],
  },
  {
    icon: "📈",
    title: "الاتجاهات والقنوات السعرية",
    description:
      "تحديد الاتجاه صاعد أو هابط أو عرضي، ورسم القنوات السعرية يساعد على توقع حركة السعر ضمن نطاق محدد.",
    links: [
      { label: "الفوركس", href: "/forex" },
      { label: "الذهب", href: "/gold" },
    ],
  },
  {
    icon: "🕯️",
    title: "الشموع اليابانية",
    description:
      "الشموع اليابانية تعرض فتح وإغلاق وأعلى وأدنى السعر — أنماط مثل المطرقة والابتلاع والنجمة تساعد على قراءة زخم السوق.",
    links: [
      { label: "أكاديمية التداول", href: "/trading-academy" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
    ],
  },
  {
    icon: "🔷",
    title: "النماذج الفنية",
    description:
      "النماذج الفنية مثل الرأس والكتفين والمثلثات والأعلام تساعد على توقع استمرار أو انعكاس الاتجاه بعد اكتمال النموذج.",
    links: [
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "الأسهم", href: "/stocks" },
    ],
  },
  {
    icon: "🌊",
    title: "السيولة ومناطق الدخول",
    description:
      "مناطق السيولة حيث يتجمع أوامر البيع والشراء — المتداول المحترف يبحث عن مناطق الدخول بعد اختبار السيولة أو كسرها.",
    links: [
      { label: "العملات الرقمية", href: "/crypto" },
      { label: "VIP Spot", href: "/vip-spot" },
    ],
  },
  {
    icon: "💎",
    title: "Smart Money Concept SMC",
    description:
      "مفهوم الأموال الذكية يدرس كيف تتحرك المؤسسات الكبرى — كسر الهيكل، مناطق الطلب والعرض، واختبار السيولة.",
    links: [
      { label: "أكاديمية التداول", href: "/trading-academy" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
    ],
  },
  {
    icon: "⚡",
    title: "Price Action",
    description:
      "Price Action قراءة حركة السعر الخام دون مؤشرات كثيرة — الاعتماد على الشموع والمستويات والزخم لاتخاذ القرار.",
    links: [
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "إشارات الفوركس", href: "/forex" },
    ],
  },
  {
    icon: "🛡️",
    title: "إدارة المخاطر",
    description:
      "التحليل الفني بدون إدارة مخاطر ناقص — تحديد حجم الصفقة ووقف الخسارة ونسبة المخاطرة إلى العائد ضرورية لكل صفقة.",
    links: [
      { label: "الاشتراكات", href: "/subscriptions" },
      { label: "VIP Futures", href: "/vip-futures" },
    ],
  },
  {
    icon: "⚖️",
    title: "الفرق بين التحليل الفني والتحليل الأساسي",
    description:
      "التحليل الفني يدرس الشارت وحركة السعر، والتحليل الأساسي يقرأ الأخبار والبيانات الاقتصادية — الجمع بينهما يعطي صورة أوضح.",
    links: [
      { label: "الأخبار الاقتصادية", href: "/economic-news" },
      { label: "طلب تحليل", href: "/analysis/request" },
    ],
  },
  {
    icon: "🎯",
    title: "كيف يستخدم HasaN CharT World التحليل الفني",
    description:
      "في HasaN CharT World نقدّم تحليلات فنية يومية وخدمات VIP وطلب تحليل مخصص — كلها بإشراف خبراء يطبقون منهجاً فنياً احترافياً.",
    links: [
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "VIP Spot", href: "/vip-spot" },
      { label: "أكاديمية التداول", href: "/trading-academy" },
    ],
  },
];

const faqItems = [
  {
    q: "ما هو التحليل الفني؟",
    a: "منهج لدراسة حركة السعر على الشارت باستخدام الدعوم والمقاومات والاتجاهات والنماذج الفنية لتحديد نقاط الدخول والخروج.",
  },
  {
    q: "ما الفرق بين التحليل الفني والأساسي؟",
    a: "التحليل الفني يعتمد على الشارت وحركة السعر، بينما التحليل الأساسي يعتمد على الأخبار والبيانات الاقتصادية وتقييم الأصول.",
  },
  {
    q: "هل يستخدم HasaN CharT World التحليل الفني؟",
    a: "نعم، التحليلات اليومية وخدمات VIP وطلب التحليل تعتمد على منهج فني احترافي بإشراف خبراء.",
  },
  {
    q: "ما أهم أدوات التحليل الفني؟",
    a: "الدعوم والمقاومات، الاتجاهات، الشموع اليابانية، النماذج الفنية، SMC، وPrice Action.",
  },
  {
    q: "كيف أبدأ بتعلم التحليل الفني في المنصة؟",
    a: "استكشف التحليلات اليومية أو أكاديمية التداول أو طلب تحليل مخصص والاشتراكات.",
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
  { label: "الأخبار", href: "/news" },
  { label: "التحليلات اليومية", href: "/daily-analysis" },
  { label: "طلب تحليل", href: "/analysis/request" },
  { label: "الاشتراكات", href: "/subscriptions" },
  { label: "VIP Spot", href: "/vip-spot" },
  { label: "VIP Futures", href: "/vip-futures" },
  { label: "أكاديمية التداول", href: "/trading-academy" },
  { label: "من نحن", href: "/about" },
  { label: "العلامة التجارية", href: "/brand" },
  { label: "الشركة", href: "/company" },
];

function TechnicalSection({ icon, title, description, links }) {
  return (
    <section className="public-seo-card rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-2xl md:p-10">
      <div className="flex items-start gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-3xl">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-black text-white md:text-3xl">{title}</h2>
          <p className="mt-4 text-lg leading-9 text-slate-300">{description}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-100 no-underline transition hover:border-cyan-300/40 hover:bg-cyan-400/20 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FaqItem({ question, answer }) {
  return (
    <details className="public-seo-card group rounded-[24px] border border-cyan-300/15 bg-white/[0.04] p-5 backdrop-blur-xl">
      <summary className="cursor-pointer list-none text-lg font-black text-white marker:content-none">
        <span className="flex items-center justify-between gap-4">
          {question}
          <span className="text-cyan-300 transition group-open:rotate-45">+</span>
        </span>
      </summary>
      <p className="mt-4 leading-8 text-slate-300">{answer}</p>
    </details>
  );
}

export default function TechnicalAnalysisPageContent() {
  return (
    <main className="public-seo-page relative min-h-screen overflow-hidden bg-[#020617] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(0,102,255,0.35),transparent_30%),radial-gradient(circle_at_86%_35%,rgba(34,211,238,0.16),transparent_30%),linear-gradient(135deg,#020617,#07142f_48%,#030712)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.13] bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:76px_76px]" />

      <div className="relative z-10 mx-auto max-w-6xl space-y-8 px-4 py-12 md:px-6 md:py-16">
        <Breadcrumbs items={breadcrumbs} variant="dark" />

        <section className="public-seo-hero relative overflow-hidden rounded-[34px] border border-cyan-300/15 bg-gradient-to-br from-[#07142f]/85 via-[#040b1c]/90 to-[#020617]/95 p-8 text-center shadow-2xl backdrop-blur-2xl md:p-12">
          <div className="relative z-10">
            <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-5 py-2 text-xs font-black text-cyan-200">
              التحليل الفني
            </span>
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">التحليل الفني</h1>
            <p className="mx-auto mt-6 max-w-4xl text-lg leading-9 text-slate-300">
              من الدعوم والمقاومات والشموع اليابانية إلى SMC وPrice Action — HasaN CharT World
              تقدّم تغطية عربية احترافية للتحليل الفني مع إدارة مخاطر وتحليلات يومية.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/daily-analysis"
                className="rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-8 py-4 font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.32)]"
              >
                التحليلات اليومية
              </Link>
              <Link
                href="/trading-academy"
                className="rounded-2xl border border-cyan-300/20 bg-black/25 px-8 py-4 font-black text-cyan-100 transition hover:bg-cyan-400/10"
              >
                أكاديمية التداول
              </Link>
            </div>
          </div>
        </section>

        <div className="space-y-6">
          {technicalSections.map((section) => (
            <TechnicalSection key={section.title} {...section} />
          ))}
        </div>

        <section className="space-y-5">
          <div className="text-center">
            <h2 className="text-3xl font-black text-white md:text-4xl">الأسئلة الشائعة</h2>
            <p className="mt-3 text-slate-400">إجابات عن التحليل الفني في HasaN CharT World</p>
          </div>
          <div className="space-y-3">
            {faqItems.map((item) => (
              <FaqItem key={item.q} question={item.q} answer={item.a} />
            ))}
          </div>
        </section>

        <section className="space-y-5">
          <div className="text-center">
            <h2 className="text-3xl font-black text-white md:text-4xl">روابط داخلية</h2>
            <p className="mt-3 text-slate-400">انتقل إلى صفحات HasaN CharT World المرتبطة بالتحليل الفني</p>
          </div>
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
        </section>
      </div>
    </main>
  );
}
