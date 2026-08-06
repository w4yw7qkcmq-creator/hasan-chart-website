import Link from "next/link";
import Breadcrumbs from "../seo/Breadcrumbs";

const breadcrumbs = [
  { label: "الرئيسية", href: "/" },
  { label: "العلامة التجارية", href: "/brand" },
];

const coverageAreas = [
  { icon: "₿", title: "العملات الرقمية", text: "تحليلات وتنبيهات وتوصيات تغطي أهم أصول الكريبتو." },
  { icon: "💱", title: "الفوركس", text: "متابعة أزواج العملات والسيولة والتحركات اليومية." },
  { icon: "🥇", title: "الذهب", text: "قراءة فنية وسياقية لحركة الذهب والمعادن." },
  { icon: "📈", title: "المؤشرات", text: "تغطية للمؤشرات العالمية وحركة الأسواق العامة." },
  { icon: "📰", title: "الأخبار الاقتصادية", text: "أخبار عاجلة ومصنفة تساعد على فهم السياق السوقي." },
  { icon: "📝", title: "التحليلات", text: "تحليلات يومية وطلبات مخصصة من فريق خبراء." },
  { icon: "🔔", title: "التنبيهات السعرية", text: "تنبيهات فورية عند وصول السعر للمستويات المحددة." },
  { icon: "💎", title: "الاشتراكات", text: "باقات احترافية للوصول الكامل لخدمات المنصة." },
  { icon: "📂", title: "إدارة الحسابات", text: "خدمة متخصصة لإدارة حسابات التداول باحترافية." },
  { icon: "🤝", title: "برنامج الشركاء", text: "شراكة رسمية للترويج بمكافآت وشفافية." },
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
      <div className="text-center">
        <h2 className="text-3xl font-black text-white md:text-4xl">{title}</h2>
        {subtitle ? <p className="mt-3 text-slate-400">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function BrandPageContent() {
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
            <div className="mx-auto mb-6 grid h-24 w-24 place-items-center rounded-[28px] border border-cyan-300/30 bg-gradient-to-br from-blue-600/35 via-cyan-400/15 to-black/40 shadow-[0_0_50px_rgba(0,163,255,0.35)]">
              <span className="text-3xl font-black">HC</span>
            </div>
            <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-5 py-2 text-xs font-black text-cyan-200">
              العلامة التجارية الرسمية
            </span>
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">HasaN CharT World</h1>
            <p className="mx-auto mt-6 max-w-4xl text-lg leading-9 text-slate-300">
              HasaN CharT World علامة تجارية عربية متخصصة في متابعة وتحليل الأسواق المالية، تجمع
              بين الخبرة البشرية الطويلة والأدوات الذكية لخدمة المتداول العربي في مكان واحد.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/about"
                className="rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-8 py-4 font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.32)] transition hover:scale-[1.02]"
              >
                تعرف على المنصة
              </Link>
              <Link
                href="/subscriptions"
                className="rounded-2xl border border-cyan-300/20 bg-black/25 px-8 py-4 font-black text-cyan-100 transition hover:bg-cyan-400/10"
              >
                استكشف الخدمات
              </Link>
            </div>
          </div>
        </section>

        <section className="public-seo-card rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-2xl md:p-10">
          <h2 className="text-3xl font-black text-white">هوية العلامة التجارية</h2>
          <div className="mt-6 space-y-5 text-lg leading-9 text-slate-300">
            <p>
              HasaN CharT World ليست مجرد اسم تقني، بل علامة تجارية تمثل منصة عربية احترافية تخدم
              المتداولين والمستثمرين في المنطقة العربية. نبني هويتنا على الثقة والخبرة الميدانية
              والوضوح في تقديم التحليلات والأخبار والتنبيهات والخدمات الاحترافية.
            </p>
            <p>
              تغطي العلامة منصة متكاملة لمتابعة الأسواق المالية، وتجمع بين التحليل الفني، الأخبار
              الاقتصادية، التنبيهات السعرية، الاشتراكات، إدارة الحسابات، وبرنامج الشركاء ضمن تجربة
              واحدة موجهة للمتداول العربي.
            </p>
          </div>
        </section>

        <section className="public-seo-card rounded-[34px] border border-amber-300/20 bg-amber-400/10 p-8 shadow-2xl backdrop-blur-2xl md:p-10">
          <h2 className="text-3xl font-black text-amber-100">الخبراء أولاً، والذكاء الاصطناعي كأداة مساعدة</h2>
          <div className="mt-6 space-y-5 text-lg leading-9 text-amber-50/90">
            <p>
              التحليلات والتوصيات الأساسية في HasaN CharT World تصدر من خبراء لديهم خبرة طويلة في
              أسواق العملات الرقمية والفوركس والمعادن والمؤشرات. الخبرة البشرية هي الأساس في قراءة
              السياق، إدارة المخاطر، واتخاذ القرار.
            </p>
            <p>
              يُستخدم الذكاء الاصطناعي في بعض الخدمات كأداة مساعدة للمسح السريع أو تنظيم البيانات،
              وليس بديلاً عن الخبراء. لا نقدّم الذكاء الاصطناعي كحل خفي يحل محل التحليل البشري في
              التقارير أو التوصيات الرئيسية.
            </p>
          </div>
        </section>

        <SectionBlock title="مجالات التغطية" subtitle="أسواق وخدمات تحملها العلامة التجارية">
          <div className="grid gap-4 md:grid-cols-2">
            {coverageAreas.map((item) => (
              <article
                key={item.title}
                className="public-seo-card rounded-[24px] border border-cyan-300/15 bg-white/[0.045] p-5 shadow-xl backdrop-blur-2xl"
              >
                <div className="flex items-start gap-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-2xl">
                    {item.icon}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white">{item.title}</h3>
                    <p className="mt-2 leading-8 text-slate-300">{item.text}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </SectionBlock>

        <section className="public-seo-card rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-2xl md:p-10">
          <h2 className="text-center text-3xl font-black text-white">قيم العلامة التجارية</h2>
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {brandValues.map((item) => (
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

        <SectionBlock title="روابط العلامة التجارية" subtitle="انتقل إلى صفحات وخدمات HasaN CharT World">
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

        <section className="rounded-[34px] border border-cyan-300/20 bg-gradient-to-l from-blue-700/30 via-blue-600/20 to-cyan-400/10 p-8 text-center shadow-2xl md:p-10">
          <h2 className="text-3xl font-black text-white">HasaN CharT World — علامة عربية للأسواق المالية</h2>
          <p className="mx-auto mt-4 max-w-3xl text-lg leading-8 text-slate-200">
            اكتشف خدمات المنصة، تابع الأخبار والتحليلات، أو انضم إلى برنامج الشركاء عبر الروابط
            الرسمية داخل الموقع.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/register"
              className="rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-8 py-4 font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.32)]"
            >
              إنشاء حساب
            </Link>
            <Link
              href="/"
              className="rounded-2xl border border-cyan-300/20 bg-black/25 px-8 py-4 font-black text-cyan-100 transition hover:bg-cyan-400/10"
            >
              العودة للرئيسية
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
