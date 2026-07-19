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

export default function GoldPageContent() {
  return (
    <main className="public-seo-page relative min-h-screen overflow-hidden bg-[#020617] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(0,102,255,0.35),transparent_30%),radial-gradient(circle_at_86%_35%,rgba(34,211,238,0.16),transparent_30%),linear-gradient(135deg,#020617,#07142f_48%,#030712)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.13] bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:76px_76px]" />

      <div className="relative z-10 mx-auto max-w-6xl space-y-8 px-4 py-12 md:px-6 md:py-16">
        <Breadcrumbs items={breadcrumbs} variant="dark" />

        <section className="public-seo-hero relative overflow-hidden rounded-[34px] border border-cyan-300/15 bg-gradient-to-br from-[#07142f]/85 via-[#040b1c]/90 to-[#020617]/95 p-8 text-center shadow-2xl backdrop-blur-2xl md:p-12">
          <div className="relative z-10">
            <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-5 py-2 text-xs font-black text-cyan-200">
              الذهب
            </span>
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">سوق الذهب</h1>
            <p className="mx-auto mt-6 max-w-4xl text-lg leading-9 text-slate-300">
              من حركة الدولار والفائدة والتضخم إلى التحليل الفني والأخبار والإشارات — HasaN CharT
              World تقدّم تغطية عربية احترافية لسوق الذهب XAU مع إدارة مخاطر واضحة.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/daily-analysis"
                className="rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-8 py-4 font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.32)]"
              >
                التحليلات اليومية
              </Link>
              <Link
                href="/news/tag/gold"
                className="rounded-2xl border border-cyan-300/20 bg-black/25 px-8 py-4 font-black text-cyan-100 transition hover:bg-cyan-400/10"
              >
                أخبار الذهب
              </Link>
            </div>
          </div>
        </section>

        <div className="space-y-6">
          {goldSections.map((section) => (
            <GoldSection key={section.title} {...section} />
          ))}
        </div>

        <section className="space-y-5">
          <div className="text-center">
            <h2 className="text-3xl font-black text-white md:text-4xl">الأسئلة الشائعة</h2>
            <p className="mt-3 text-slate-400">إجابات عن سوق الذهب في HasaN CharT World</p>
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
            <p className="mt-3 text-slate-400">انتقل إلى صفحات HasaN CharT World المرتبطة بالذهب</p>
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
