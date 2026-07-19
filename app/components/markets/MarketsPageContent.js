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

export default function MarketsPageContent() {
  return (
    <main className="public-seo-page relative min-h-screen overflow-x-hidden overflow-y-visible bg-[#020617] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(0,102,255,0.35),transparent_30%),radial-gradient(circle_at_86%_35%,rgba(34,211,238,0.16),transparent_30%),linear-gradient(135deg,#020617,#07142f_48%,#030712)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.13] bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:76px_76px]" />

      <div className="relative z-10 mx-auto max-w-6xl space-y-8 px-4 py-12 md:px-6 md:py-16">
        <Breadcrumbs items={breadcrumbs} variant="dark" />

        <section className="public-seo-hero relative overflow-hidden rounded-[34px] border border-cyan-300/15 bg-gradient-to-br from-[#07142f]/85 via-[#040b1c]/90 to-[#020617]/95 p-8 text-center shadow-2xl backdrop-blur-2xl md:p-12">
          <div className="relative z-10">
            <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-5 py-2 text-xs font-black text-cyan-200">
              الأسواق المالية
            </span>
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">الأسواق التي نغطيها</h1>
            <p className="mx-auto mt-6 max-w-4xl text-lg leading-9 text-slate-300">
              منصة HasaN CharT World تقدم تغطية متكاملة للأسواق المالية العالمية: من العملات الرقمية
              والفوركس إلى الذهب والأسهم والمؤشرات والنفط، مع أخبار اقتصادية وتحليلات وتنبيهات
              وخدمات للمستثمرين.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/assets"
                className="rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-8 py-4 font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.32)]"
              >
                دليل مراكز الأصول
              </Link>
              <Link
                href="/news"
                className="rounded-2xl border border-cyan-300/20 bg-black/25 px-8 py-4 font-black text-cyan-100 transition hover:bg-cyan-400/10"
              >
                أخبار الأسواق
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

        <section className="public-seo-card rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-2xl md:p-10">
          <h2 className="text-3xl font-black text-white">مقدمة عن الأسواق المالية</h2>
          <div className="mt-6 space-y-5 text-lg leading-9 text-slate-300">
            <p>
              الأسواق المالية ليست رقماً واحداً على الشاشة، بل منظومة مترابطة من أصول وأخبار
              وسيولة وتوقعات. في HasaN CharT World نغطي هذه الأسواق لأن المتداول العربي يحتاج
              رؤية شاملة وليس أداة منفصلة لكل سوق.
            </p>
            <p>
              نربط بين التحليل الفني والأساسي، وبين الأخبار الاقتصادية والتنبيهات السعرية،
              وبين خدمات الاشتراك وإدارة الحسابات — كل ذلك ضمن منصة عربية واحدة يقودها فريق
              خبراء بخبرة ميدانية طويلة.
            </p>
          </div>
        </section>

        <div className="space-y-6">
          {marketSections.map((section) => (
            <MarketSection key={section.title} {...section} />
          ))}
        </div>

        <section className="public-seo-card rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-2xl md:p-10">
          <h2 className="text-center text-3xl font-black text-white">لماذا نغطي هذه الأسواق؟</h2>
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {whyCover.map((item) => (
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

        <section className="space-y-5">
          <div className="text-center">
            <h2 className="text-3xl font-black text-white md:text-4xl">الأسئلة الشائعة</h2>
            <p className="mt-3 text-slate-400">إجابات عن تغطية الأسواق في HasaN CharT World</p>
          </div>
          <div className="space-y-3">
            {faqItems.map((item) => (
              <FaqItem key={item.q} question={item.q} answer={item.a} />
            ))}
          </div>
        </section>

        <section className="space-y-5">
          <div className="text-center">
            <h2 className="text-3xl font-black text-white md:text-4xl">روابط المنصة</h2>
            <p className="mt-3 text-slate-400">انتقل إلى صفحات HasaN CharT World الرسمية</p>
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
