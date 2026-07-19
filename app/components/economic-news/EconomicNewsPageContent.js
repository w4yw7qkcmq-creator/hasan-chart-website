import Link from "next/link";
import Breadcrumbs from "../seo/Breadcrumbs";

const breadcrumbs = [
  { label: "الرئيسية", href: "/" },
  { label: "الأسواق المالية", href: "/markets" },
  { label: "الأخبار الاقتصادية", href: "/economic-news" },
];

const economicSections = [
  {
    icon: "📰",
    title: "ما هي الأخبار الاقتصادية؟",
    description:
      "الأخبار الاقتصادية تشمل بيانات ومؤشرات تصدر عن الحكومات والبنوك المركزية — عند صدورها تحرك الفوركس والذهب والأسهم والكريبتو خلال دقائق.",
    links: [
      { label: "الأخبار الاقتصادية", href: "/news/category/economy" },
      { label: "جميع الأخبار", href: "/news" },
    ],
  },
  {
    icon: "🏛️",
    title: "أخبار الفيدرالي الأمريكي",
    description:
      "البنك الفيدرالي الأمريكي يحدد مسار الفائدة والسياسة النقدية — كل كلمة من رئيس الفيدرالي أو قرار FOMC تحرك الأسواق العالمية.",
    links: [
      { label: "أخبار الفيدرالي", href: "/news/tag/fed" },
      { label: "الفوركس", href: "/forex" },
    ],
  },
  {
    icon: "📈",
    title: "التضخم وبيانات CPI و PPI",
    description:
      "مؤشرات التضخم CPI و PPI تقيس ارتفاع الأسعار — بيانات أعلى من التوقعات تدعم تشديد الفائدة وتؤثر على الدولار والذهب.",
    links: [
      { label: "أخبار التضخم", href: "/news/tag/inflation" },
      { label: "الذهب", href: "/gold" },
    ],
  },
  {
    icon: "👥",
    title: "البطالة و NFP",
    description:
      "تقرير الوظائف غير الزراعية NFP من أهم بيانات الشهر — يعكس قوة سوق العمل الأمريكي ويؤثر على توقعات الفيدرالي والدولار.",
    links: [
      { label: "أخبار الاقتصاد", href: "/news/category/economy" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
    ],
  },
  {
    icon: "💹",
    title: "الفائدة وقرارات البنوك المركزية",
    description:
      "قرارات رفع أو خفض الفائدة من الفيدرالي والبنك المركزي الأوروبي وغيرها تحدد تكلفة المال وتؤثر على جميع الأصول المالية.",
    links: [
      { label: "أخبار الفيدرالي", href: "/news/tag/fed" },
      { label: "أخبار الأسواق", href: "/news/category/stocks" },
    ],
  },
  {
    icon: "🌐",
    title: "الناتج المحلي GDP",
    description:
      "بيانات الناتج المحلي GDP تقيس نمو الاقتصاد — نمو قوي يدعم الأسهم والدولار، والانكماش يثير مخاوف الركود.",
    links: [
      { label: "أخبار الاقتصاد", href: "/news/category/economy" },
      { label: "الأسهم", href: "/stocks" },
    ],
  },
  {
    icon: "💱",
    title: "تأثير الأخبار على الفوركس",
    description:
      "الأخبار الاقتصادية القوية تحرك الدولار وأزواج العملات — المتداول يحتاج فهم التوقعات مقابل النتائج الفعلية.",
    links: [
      { label: "الفوركس", href: "/forex" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
    ],
  },
  {
    icon: "🥇",
    title: "تأثير الأخبار على الذهب",
    description:
      "الذهب يتأثر بالتضخم والفائدة والدولار — أخبار التضخم المرتفعة أو ضعف الدولار تدعم الذهب غالباً.",
    links: [
      { label: "الذهب", href: "/gold" },
      { label: "أخبار الذهب", href: "/news/tag/gold" },
    ],
  },
  {
    icon: "₿",
    title: "تأثير الأخبار على العملات الرقمية",
    description:
      "الكريبتو يتأثر بالماكرو والفائدة والسيولة — قرارات الفيدرالي وبيانات التضخم تؤثر على شهية المخاطرة في السوق.",
    links: [
      { label: "العملات الرقمية", href: "/crypto" },
      { label: "أخبار الكريبتو", href: "/news/category/crypto" },
    ],
  },
  {
    icon: "📅",
    title: "التقويم الاقتصادي",
    description:
      "التقويم الاقتصادي يعرض مواعيد صدور البيانات المهمة — المتداول المحترف يعرف مسبقاً متى تتحرك الأسواق.",
    links: [
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "أخبار الاقتصاد", href: "/news/category/economy" },
    ],
  },
  {
    icon: "🛡️",
    title: "إدارة المخاطر وقت الأخبار",
    description:
      "وقت صدور الأخبار المهمة تزداد التقلبات — إدارة المخاطر تشمل تقليل حجم الصفقة أو الانتظار بعد الصدور.",
    links: [
      { label: "الاشتراكات", href: "/subscriptions" },
      { label: "VIP Futures", href: "/vip-futures" },
    ],
  },
];

const faqItems = [
  {
    q: "ما هي الأخبار الاقتصادية؟",
    a: "بيانات ومؤشرات اقتصادية تصدر عن الحكومات والبنوك المركزية وتؤثر على الأسواق المالية عند صدورها.",
  },
  {
    q: "ما أهم الأخبار الاقتصادية للمتداول؟",
    a: "قرارات الفيدرالي، بيانات التضخم CPI و PPI، تقرير NFP للوظائف، بيانات GDP، وقرارات الفائدة.",
  },
  {
    q: "كيف تؤثر الأخبار على الفوركس والذهب؟",
    a: "الأخبار القوية تحرك الدولار والفائدة والتضخم، مما ينعكس على أزواج العملات والذهب مباشرة.",
  },
  {
    q: "هل يوفر HasaN CharT World تغطية للأخبار الاقتصادية؟",
    a: "نعم، نوفر أخباراً اقتصادية مصنّفة وتحليلات يومية تربط الأخبار بحركة الأسواق.",
  },
  {
    q: "كيف أتابع الأخبار الاقتصادية في المنصة؟",
    a: "أنشئ حساباً واستكشف قسم الأخبار الاقتصادية أو التحليلات اليومية أو صفحات الأسواق المتخصصة.",
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
  { label: "الأخبار", href: "/news" },
  { label: "أخبار الاقتصاد", href: "/news/category/economy" },
  { label: "أخبار الأسواق", href: "/news/category/stocks" },
  { label: "التحليلات اليومية", href: "/daily-analysis" },
  { label: "طلب تحليل", href: "/analysis/request" },
  { label: "الاشتراكات", href: "/subscriptions" },
  { label: "VIP Spot", href: "/vip-spot" },
  { label: "VIP Futures", href: "/vip-futures" },
  { label: "من نحن", href: "/about" },
  { label: "العلامة التجارية", href: "/brand" },
  { label: "الشركة", href: "/company" },
];

function EconomicSection({ icon, title, description, links }) {
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

export default function EconomicNewsPageContent() {
  return (
    <main className="public-seo-page relative min-h-screen overflow-hidden bg-[#020617] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(0,102,255,0.35),transparent_30%),radial-gradient(circle_at_86%_35%,rgba(34,211,238,0.16),transparent_30%),linear-gradient(135deg,#020617,#07142f_48%,#030712)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.13] bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:76px_76px]" />

      <div className="relative z-10 mx-auto max-w-6xl space-y-8 px-4 py-12 md:px-6 md:py-16">
        <Breadcrumbs items={breadcrumbs} variant="dark" />

        <section className="public-seo-hero relative overflow-hidden rounded-[34px] border border-cyan-300/15 bg-gradient-to-br from-[#07142f]/85 via-[#040b1c]/90 to-[#020617]/95 p-8 text-center shadow-2xl backdrop-blur-2xl md:p-12">
          <div className="relative z-10">
            <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-5 py-2 text-xs font-black text-cyan-200">
              الأخبار الاقتصادية
            </span>
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">الأخبار الاقتصادية</h1>
            <p className="mx-auto mt-6 max-w-4xl text-lg leading-9 text-slate-300">
              من قرارات الفيدرالي والتضخم وNFP إلى GDP وتأثيرها على الفوركس والذهب والكريبتو —
              HasaN CharT World تقدّم تغطية عربية احترافية للأخبار الاقتصادية وإدارة المخاطر.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/news/category/economy"
                className="rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-8 py-4 font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.32)]"
              >
                أخبار الاقتصاد
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
          {economicSections.map((section) => (
            <EconomicSection key={section.title} {...section} />
          ))}
        </div>

        <section className="space-y-5">
          <div className="text-center">
            <h2 className="text-3xl font-black text-white md:text-4xl">الأسئلة الشائعة</h2>
            <p className="mt-3 text-slate-400">إجابات عن الأخبار الاقتصادية في HasaN CharT World</p>
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
            <p className="mt-3 text-slate-400">انتقل إلى صفحات HasaN CharT World المرتبطة بالأخبار الاقتصادية</p>
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
