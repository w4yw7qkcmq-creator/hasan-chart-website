import Link from "next/link";
import Breadcrumbs from "../seo/Breadcrumbs";

const breadcrumbs = [
  { label: "الرئيسية", href: "/" },
  { label: "الأسواق المالية", href: "/markets" },
  { label: "النفط والطاقة", href: "/oil" },
];

const oilSections = [
  {
    icon: "🛢️",
    title: "ما هو سوق النفط؟",
    description:
      "سوق النفط من أهم أسواق الطاقة في العالم، يُتداول فيه خام برنت وWTI كمعيارين رئيسيين لأسعار الطاقة، ويؤثر مباشرة على التضخم والاقتصاد العالمي.",
    links: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "السلع العالمية", href: "/commodities" },
    ],
  },
  {
    icon: "⚖️",
    title: "خام برنت و WTI",
    description:
      "خام برنت معيار النفط العالمي من بحر الشمال، وWTI النفط الأمريكي من تكساس — غالباً يتحركان معاً مع فروقات جغرافية وتكاليف النقل.",
    links: [
      { label: "أخبار النفط", href: "/news/category/commodities" },
      { label: "وسم النفط", href: "/news/tag/oil" },
    ],
  },
  {
    icon: "📊",
    title: "العرض والطلب",
    description:
      "أسعار النفط تتحرك أساساً بتوازن العرض والطلب — النمو الاقتصادي يزيد الطلب، بينما زيادة الإنتاج أو الركود تضغط على الأسعار.",
    links: [
      { label: "أخبار الاقتصاد", href: "/news/category/economy" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
    ],
  },
  {
    icon: "🌐",
    title: "أوبك وقرارات الإنتاج",
    description:
      "أوبك+ تتحكم في جزء كبير من إمدادات النفط العالمية — قرارات خفض أو زيادة الإنتاج تحرك السوق فور صدورها.",
    links: [
      { label: "أخبار السلع", href: "/news/category/commodities" },
      { label: "أخبار النفط", href: "/news/category/commodities" },
    ],
  },
  {
    icon: "📦",
    title: "المخزونات الأمريكية",
    description:
      "تقرير مخزونات النفط الأمريكية (EIA) من أهم البيانات الأسبوعية — ارتفاع المخزونات يضغط على الأسعار والانخفاض يدعمها.",
    links: [
      { label: "وسم النفط", href: "/news/tag/oil" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
    ],
  },
  {
    icon: "💵",
    title: "تأثير الدولار والفائدة",
    description:
      "النفط يُسعّر بالدولار — ضعف الدولار يدعم الأسعار والعكس صحيح. ارتفاع الفائدة يبطئ النمو ويضغط على الطلب على الطاقة.",
    links: [
      { label: "الفوركس", href: "/forex" },
      { label: "أخبار الفيدرالي", href: "/news/tag/fed" },
      { label: "الذهب", href: "/gold" },
    ],
  },
  {
    icon: "📈",
    title: "النفط والتضخم",
    description:
      "أسعار النفط مكون رئيسي في التضخم العالمي — ارتفاع النفط يزيد تكاليف النقل والصناعة، وانخفاضه يخفف ضغوط التضخم.",
    links: [
      { label: "أخبار التضخم", href: "/news/tag/inflation" },
      { label: "السلع العالمية", href: "/commodities" },
    ],
  },
  {
    icon: "📉",
    title: "التحليل الفني للنفط",
    description:
      "التحليل الفني للنفط يدرس شارتات برنت وWTI والاتجاهات ومستويات الدعم والمقاومة لتحديد نقاط الدخول والخروج.",
    links: [
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "طلب تحليل", href: "/analysis/request" },
    ],
  },
  {
    icon: "📰",
    title: "أخبار النفط والطاقة",
    description:
      "أخبار النفط والطاقة العاجلة والمصنّفة تساعد المتداول على فهم ما يحرك السوق قبل صدور البيانات أو بعدها مباشرة.",
    links: [
      { label: "أخبار النفط", href: "/news/category/commodities" },
      { label: "أخبار السلع", href: "/news/category/commodities" },
      { label: "وسم النفط", href: "/news/tag/oil" },
      { label: "جميع الأخبار", href: "/news" },
    ],
  },
  {
    icon: "🛡️",
    title: "إدارة المخاطر",
    description:
      "إدارة المخاطر في تداول النفط تشمل تحديد حجم الصفقة، وقف الخسارة، مراقبة الأخبار الجيوسياسية، وعدم المبالغة في الرافعة.",
    links: [
      { label: "الاشتراكات", href: "/subscriptions" },
      { label: "VIP Futures", href: "/vip-futures" },
    ],
  },
];

const faqItems = [
  {
    q: "ما هو سوق النفط؟",
    a: "سوق عالمي يُتداول فيه خام برنت وWTI كأهم معيارين لأسعار الطاقة، ويؤثر على الاقتصاد العالمي والتضخم.",
  },
  {
    q: "ما الفرق بين خام برنت و WTI؟",
    a: "برنت معيار النفط العالمي من بحر الشمال، وWTI النفط الأمريكي من تكساس — غالباً يتحركان معاً مع فروقات جغرافية.",
  },
  {
    q: "ما العوامل التي تحرك أسعار النفط؟",
    a: "العرض والطلب، قرارات أوبك، المخزونات الأمريكية، الدولار، الفائدة، التضخم، والأخبار الجيوسياسية.",
  },
  {
    q: "هل يوفر HasaN CharT World تحليلات للنفط؟",
    a: "نعم، نوفر تحليلات فنية وأخباراً مرتبطة بالنفط والطاقة ضمن التحليلات اليومية وقسم الأخبار.",
  },
  {
    q: "كيف أبدأ بمتابعة النفط في المنصة؟",
    a: "أنشئ حساباً واستكشف أخبار النفط أو التحليلات اليومية أو طلب تحليل مخصص والاشتراكات.",
  },
];

const internalLinks = [
  { label: "الأصول والأسواق", href: "/assets" },
  { label: "الأسواق المالية", href: "/markets" },
  { label: "السلع العالمية", href: "/commodities" },
  { label: "الذهب", href: "/gold" },
  { label: "الفوركس", href: "/forex" },
  { label: "العملات الرقمية", href: "/crypto" },
  { label: "الأسهم الأمريكية", href: "/stocks" },
  { label: "الأخبار", href: "/news" },
  { label: "أخبار النفط", href: "/news/category/commodities" },
  { label: "أخبار السلع", href: "/news/category/commodities" },
  { label: "وسم النفط", href: "/news/tag/oil" },
  { label: "التحليلات اليومية", href: "/daily-analysis" },
  { label: "طلب تحليل", href: "/analysis/request" },
  { label: "الاشتراكات", href: "/subscriptions" },
  { label: "VIP Spot", href: "/vip-spot" },
  { label: "VIP Futures", href: "/vip-futures" },
  { label: "من نحن", href: "/about" },
  { label: "العلامة التجارية", href: "/brand" },
  { label: "الشركة", href: "/company" },
];

function OilSection({ icon, title, description, links }) {
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

export default function OilPageContent() {
  return (
    <main className="public-seo-page relative min-h-screen overflow-hidden bg-[#020617] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(0,102,255,0.35),transparent_30%),radial-gradient(circle_at_86%_35%,rgba(34,211,238,0.16),transparent_30%),linear-gradient(135deg,#020617,#07142f_48%,#030712)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.13] bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:76px_76px]" />

      <div className="relative z-10 mx-auto max-w-6xl space-y-8 px-4 py-12 md:px-6 md:py-16">
        <Breadcrumbs items={breadcrumbs} variant="dark" />

        <section className="public-seo-hero relative overflow-hidden rounded-[34px] border border-cyan-300/15 bg-gradient-to-br from-[#07142f]/85 via-[#040b1c]/90 to-[#020617]/95 p-8 text-center shadow-2xl backdrop-blur-2xl md:p-12">
          <div className="relative z-10">
            <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-5 py-2 text-xs font-black text-cyan-200">
              النفط والطاقة
            </span>
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">سوق النفط والطاقة</h1>
            <p className="mx-auto mt-6 max-w-4xl text-lg leading-9 text-slate-300">
              من خام برنت وWTI إلى أوبك والمخزونات الأمريكية والتضخم والدولار — HasaN CharT World
              تقدّم تغطية عربية احترافية لسوق النفط والطاقة مع تحليلات وأخبار وإدارة مخاطر.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/news/category/commodities"
                className="rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-8 py-4 font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.32)]"
              >
                أخبار النفط
              </Link>
              <Link
                href="/daily-analysis"
                className="rounded-2xl border border-cyan-300/20 bg-black/25 px-8 py-4 font-black text-cyan-100 transition hover:bg-cyan-400/10"
              >
                التحليلات اليومية
              </Link>
            </div>
          </div>
        </section>

        <div className="space-y-6">
          {oilSections.map((section) => (
            <OilSection key={section.title} {...section} />
          ))}
        </div>

        <section className="space-y-5">
          <div className="text-center">
            <h2 className="text-3xl font-black text-white md:text-4xl">الأسئلة الشائعة</h2>
            <p className="mt-3 text-slate-400">إجابات عن النفط والطاقة في HasaN CharT World</p>
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
            <p className="mt-3 text-slate-400">انتقل إلى صفحات HasaN CharT World المرتبطة بالنفط</p>
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
