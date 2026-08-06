import Link from "next/link";
import Breadcrumbs from "../seo/Breadcrumbs";

const breadcrumbs = [
  { label: "الرئيسية", href: "/" },
  { label: "الشركة", href: "/company" },
];

const values = [
  "الشفافية في تقديم الخدمات والتحليلات",
  "الخبرة البشرية قبل أي أداة تقنية",
  "الجودة في المحتوى والمتابعة",
  "احترام وقت المتداول العربي",
  "الأمان وحماية بيانات المستخدمين",
  "التطوير المستمر للمنصة",
];

const offerings = [
  { icon: "📊", title: "تحليلات مالية احترافية", text: "دراسات وتحليلات يصدرها خبراء بخبرة ميدانية طويلة." },
  { icon: "📰", title: "أخبار اقتصادية", text: "تغطية عاجلة ومصنفة لأهم الأحداث المؤثرة في الأسواق." },
  { icon: "🔔", title: "تنبيهات سعرية", text: "إشعارات فورية عند وصول الأسعار للمستويات المحددة." },
  { icon: "💎", title: "اشتراكات وتوصيات", text: "باقات VIP Spot و VIP Futures وخدمات متقدمة للمتداولين." },
  { icon: "📂", title: "إدارة الحسابات", text: "خدمة متخصصة لإدارة حسابات التداول باحترافية." },
  { icon: "🤝", title: "برنامج الشركاء", text: "شراكة رسمية مع مكافآت وشفافية في التتبع." },
];

const markets = [
  "العملات الرقمية",
  "الفوركس",
  "الذهب",
  "الفضة",
  "الأسهم",
  "المؤشرات",
  "النفط",
  "الأخبار الاقتصادية",
];

const internalLinks = [
  { label: "من نحن", href: "/about" },
  { label: "العلامة التجارية", href: "/brand" },
  { label: "الأخبار", href: "/news" },
  { label: "التحليلات اليومية", href: "/daily-analysis" },
  { label: "الاشتراكات", href: "/subscriptions" },
  { label: "برنامج الشركاء", href: "/partner-center" },
  { label: "طلب تحليل", href: "/analysis/request" },
  { label: "إدارة الحسابات", href: "/account-management" },
  { label: "VIP Spot", href: "/vip-spot" },
  { label: "VIP Futures", href: "/vip-futures" },
  { label: "تواصل معنا", href: "/about#contact" },
];

const faqItems = [
  {
    q: "ما هي HasaN CharT World؟",
    a: "منصة عربية متخصصة في متابعة وتحليل الأسواق المالية، تقدم تحليلات، أخبار اقتصادية، تنبيهات سعرية، اشتراكات، وإدارة حسابات للمتداولين والمستثمرين.",
  },
  {
    q: "هل التحليلات تعتمد على الذكاء الاصطناعي فقط؟",
    a: "لا. التحليلات والتوصيات الأساسية تصدر عن خبراء بشريين بخبرة ميدانية. الذكاء الاصطناعي أداة مساعدة في بعض الخدمات وليس بديلاً عن الخبراء.",
  },
  {
    q: "ما الأسواق التي تغطيها الشركة؟",
    a: "نغطي العملات الرقمية، الفوركس، الذهب، الفضة، الأسهم، المؤشرات، النفط، والأخبار الاقتصادية المرتبطة بها.",
  },
  {
    q: "كيف يمكن التواصل مع الشركة؟",
    a: "عبر قناة الدعم الرسمية على Telegram والبريد support@hasanchartworld.com والقنوات المذكورة في قسم التواصل.",
  },
  {
    q: "هل الخدمات متاحة قبل التسجيل؟",
    a: "بعض المحتوى والصفحات العامة متاحة للجميع. الخدمات الكاملة تتطلب إنشاء حساب والاشتراك في الباقات المناسبة.",
  },
];

const contactChannels = [
  {
    label: "الدعم الفني — Telegram",
    href: "https://t.me/HasaNCharTSupport",
    external: true,
  },
  {
    label: "القناة الرسمية — Telegram",
    href: "https://t.me/HsaNCharT",
    external: true,
  },
  {
    label: "منصة X",
    href: "https://x.com/HasanChart",
    external: true,
  },
  {
    label: "support@hasanchartworld.com",
    href: "mailto:support@hasanchartworld.com",
    external: false,
  },
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

function ProseCard({ title, children }) {
  return (
    <section className="public-seo-card rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-2xl md:p-10">
      <h2 className="text-3xl font-black text-white">{title}</h2>
      <div className="mt-6 space-y-5 text-lg leading-9 text-slate-300">{children}</div>
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

export default function CompanyPageContent() {
  return (
    <main className="public-seo-page relative min-h-screen overflow-hidden bg-[#020617] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(0,102,255,0.35),transparent_30%),radial-gradient(circle_at_86%_35%,rgba(34,211,238,0.16),transparent_30%),linear-gradient(135deg,#020617,#07142f_48%,#030712)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.13] bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:76px_76px]" />

      <div className="relative z-10 mx-auto max-w-6xl space-y-8 px-4 py-12 md:px-6 md:py-16">
        <Breadcrumbs items={breadcrumbs} variant="dark" />

        <section className="public-seo-hero relative overflow-hidden rounded-[34px] border border-cyan-300/15 bg-gradient-to-br from-[#07142f]/85 via-[#040b1c]/90 to-[#020617]/95 p-8 text-center shadow-2xl backdrop-blur-2xl md:p-12">
          <div className="relative z-10">
            <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-5 py-2 text-xs font-black text-cyan-200">
              الشركة الرسمية
            </span>
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">HasaN CharT World</h1>
            <p className="mx-auto mt-6 max-w-4xl text-lg leading-9 text-slate-300">
              صفحة الشركة الرسمية لمنصة عربية متخصصة في التحليلات المالية، الأخبار الاقتصادية، التنبيهات
              السعرية، توصيات التداول، إدارة الحسابات، وخدمات المستثمرين في الأسواق العالمية.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/about"
                className="rounded-2xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-8 py-4 font-black text-white shadow-[0_18px_50px_rgba(37,99,235,0.32)]"
              >
                من نحن
              </Link>
              <Link
                href="/brand"
                className="rounded-2xl border border-cyan-300/20 bg-black/25 px-8 py-4 font-black text-cyan-100 transition hover:bg-cyan-400/10"
              >
                العلامة التجارية
              </Link>
            </div>
          </div>
        </section>

        <ProseCard title="من نحن كشركة">
          <p>
            HasaN CharT World شركة رقمية عربية تقدم منصة متكاملة لمتابعة الأسواق المالية. نعمل على
            تمكين المتداول والمستثمر العربي من الوصول إلى تحليلات موثوقة، أخبار دقيقة، وتنبيهات
            عملية ضمن بيئة واحدة سهلة الاستخدام.
          </p>
          <p>
            نؤمن بأن المتداول العربي يحتاج شريكاً يفهم لغته وسياقه الزمني وأسواقه، لا مجرد أدوات
            مترجمة أو وعود سريعة. لذلك بنينا HasaN CharT World على خبرة ميدانية حقيقية وفريق يتابع
            الأسواق يومياً.
          </p>
        </ProseCard>

        <div className="grid gap-6 md:grid-cols-2">
          <ProseCard title="رؤيتنا">
            <p>
              أن تصبح HasaN CharT World من أكبر المنصات العربية المتخصصة في الأسواق المالية
              والتداول والاستثمار، وأن نكون المرجع الأول للمتداول الذي يبحث عن جودة وشفافية
              وخبرة بشرية حقيقية.
            </p>
          </ProseCard>
          <ProseCard title="رسالتنا">
            <p>
              توفير بيئة متكاملة تجمع التحليل، الأخبار، التنبيهات، الاشتراكات، وإدارة الحسابات
              في منصة عربية واحدة، مع الحفاظ على معايير عالية من الجودة والمسؤولية تجاه المستخدم.
            </p>
          </ProseCard>
        </div>

        <section className="public-seo-card rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-2xl md:p-10">
          <h2 className="text-center text-3xl font-black text-white">قيمنا</h2>
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {values.map((item) => (
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

        <ProseCard title="لماذا تأسست HasaN CharT World؟">
          <p>
            تأسست المنصة استجابة لحاجة المتداول العربي إلى مكان واحد يجمع الأدوات التي يحتاجها
            يومياً: متابعة الأسعار، قراءة الأخبار، طلب التحليل، تلقي التنبيهات، والوصول إلى خدمات
            احترافية دون التنقل بين منصات متفرقة بجودة متباينة.
          </p>
          <p>
            رأينا أن كثيراً من العروض في السوق تعتمد على الضجيج أكثر من الخبرة، فقررنا بناء شركة
            تركز على التحليل البشري، الشفافية، والمتابعة الحقيقية للمستخدم بعد الاشتراك.
          </p>
        </ProseCard>

        <SectionBlock title="ماذا نقدم للمستثمرين والمتداولين؟" subtitle="خدمات مصممة لاحتياجات السوق العربي">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {offerings.map((item) => (
              <article
                key={item.title}
                className="public-seo-card rounded-[24px] border border-cyan-300/15 bg-white/[0.045] p-5 shadow-xl backdrop-blur-2xl"
              >
                <div className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-2xl">
                  {item.icon}
                </div>
                <h3 className="mt-4 text-xl font-black text-white">{item.title}</h3>
                <p className="mt-2 leading-8 text-slate-300">{item.text}</p>
              </article>
            ))}
          </div>
        </SectionBlock>

        <SectionBlock title="الأسواق التي نغطيها" subtitle="تغطية واسعة لأهم فئات الأصول">
          <div className="flex flex-wrap justify-center gap-3">
            {markets.map((market) => (
              <span
                key={market}
                className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-5 py-3 text-sm font-black text-cyan-100"
              >
                {market}
              </span>
            ))}
          </div>
        </SectionBlock>

        <ProseCard title="فريق العمل والخبرات">
          <p>
            يعمل في HasaN CharT World فريق من المحللين وخبراء الأسواق الذين اكتسبوا خبرتهم من
            متابعة أسواق العملات الرقمية والفوركس والمعادن والمؤشرات على مدار سنوات. الخبرة
            الميدانية هي أساس كل تحليل أو توصية رئيسية ننشرها.
          </p>
          <p>
            يعمل الفريق بآلية مراجعة داخلية قبل نشر التحليلات المهمة، مع التركيز على إدارة
            المخاطر والوضوح في شرح السيناريوهات بدلاً من الوعود السريعة.
          </p>
        </ProseCard>

        <section className="rounded-[34px] border border-amber-300/20 bg-amber-400/10 p-8 shadow-2xl backdrop-blur-2xl md:p-10">
          <h2 className="text-3xl font-black text-amber-100">دور الذكاء الاصطناعي داخل الشركة</h2>
          <div className="mt-6 space-y-5 text-lg leading-9 text-amber-50/90">
            <p>
              نستخدم الذكاء الاصطناعي كأداة مساعدة في بعض الخدمات — مثل المسح السريع أو تنظيم
              البيانات — ولا نعتمد عليه كمصدر وحيد للقرار.
            </p>
            <p>
              التحليلات والتوصيات الأساسية تصدر عن خبراء السوق. الذكاء الاصطناعي لا يُقدّم كبديل
              خفي عن الخبرة البشرية في التقارير أو التوصيات الرئيسية.
            </p>
          </div>
        </section>

        <ProseCard title="التزامنا بالشفافية والجودة">
          <p>
            نلتزم بشرح خدماتنا بوضوح، والإفصاح عن طبيعة التحليلات والاشتراكات، وتقديم قنوات دعم
            رسمية للمستخدمين. الجودة عندنا تعني محتوى مدروس، متابعة بعد التفعيل، وتحسين مستمر
            بناءً على ملاحظات المجتمع.
          </p>
        </ProseCard>

        <section
          id="contact"
          className="public-seo-card rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-2xl md:p-10"
        >
          <h2 className="text-3xl font-black text-white">وسائل التواصل الرسمية</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {contactChannels.map((channel) =>
              channel.external ? (
                <a
                  key={channel.href}
                  href={channel.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-white no-underline transition hover:border-cyan-300/35 hover:bg-cyan-400/10"
                >
                  <span className="font-bold">{channel.label}</span>
                  <span className="text-cyan-300">←</span>
                </a>
              ) : (
                <a
                  key={channel.href}
                  href={channel.href}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-white no-underline transition hover:border-cyan-300/35 hover:bg-cyan-400/10"
                >
                  <span className="font-bold">{channel.label}</span>
                  <span className="text-cyan-300">←</span>
                </a>
              )
            )}
          </div>
        </section>

        <SectionBlock title="الأسئلة الشائعة" subtitle="إجابات مباشرة عن الشركة وخدماتها">
          <div className="space-y-3">
            {faqItems.map((item) => (
              <FaqItem key={item.q} question={item.q} answer={item.a} />
            ))}
          </div>
        </SectionBlock>

        <SectionBlock title="روابط الشركة" subtitle="صفحات وخدمات HasaN CharT World">
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
      </div>
    </main>
  );
}
