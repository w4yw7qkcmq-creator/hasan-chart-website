import Link from "next/link";
import Breadcrumbs from "../seo/Breadcrumbs";
import AssetAnalysisSection from "./AssetAnalysisSection";
import {
  AssetPageChartWidget,
  AssetPagePriceWidget,
} from "./AssetPageLiveWidgets";
function formatNewsDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ar-SY-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Damascus",
  }).format(date);
}
function FaqItem({ question, answer }) {
  return (
    <details className="public-seo-card group rounded-[24px] border admin-panel-border ui-glass-10 p-5 backdrop-blur-xl">
      {" "}
      <summary className="cursor-pointer list-none ui-public-seo-title text-lg marker:content-none">
        {" "}
        <span className="flex items-center justify-between gap-4">
          {" "}
          {question}{" "}
          <span className="admin-text-muted transition group-open:rotate-45">
            +
          </span>{" "}
        </span>{" "}
      </summary>{" "}
      <p className="ui-public-seo-body mt-4">{answer}</p>{" "}
    </details>
  );
} /** * @param {import("./configs/types").AssetHubConfig} config * @returns {"crypto"|"forex"|"metal"|"energy"|"indices"} */
function resolveTemplateCategory(config) {
  if (config.category === "global") {
    return config.id === "xauusd" ? "metal" : "forex";
  }
  return config.category;
}
/** @type {Record<string, Array<{ title: string, description: string }>>} */
const MOVEMENT_FACTORS = {
  crypto: [
    {
      title: "البيتكوين",
      description:
        "غالباً يقود اتجاه سوق الكريبتو؛ صعود BTC يدعم الأصول البديلة والعكس صحيح عند ضغط بيعي واسع.",
    },
    {
      title: "السيولة",
      description:
        "تدفقات المنصات المركزية، صناديق الاستثمار، وحركة المحافظ الكبيرة تؤثر مباشرة على زخم السعر.",
    },
    {
      title: "أخبار التنظيم",
      description:
        "قرارات الحكومات، موافقات ETF، وحظر المنصات قد تغيّر معنويات السوق بسرعة.",
    },
    {
      title: "الفائدة",
      description:
        "ارتفاع أسعار الفائدة يقلل الشهية للمخاطرة ويضغط على أصول النمو والكريبتو.",
    },
    {
      title: "السوق العام",
      description:
        "معنويات المخاطرة العالمية، أداء المؤشرات، والدولار ينعكسان على حركة معظم العملات الرقمية.",
    },
  ],
  forex: [
    {
      title: "الدولار",
      description:
        "قوة أو ضعف الدولار عبر مؤشر DXY يؤثر على معظم أزواج الفوركس مباشرة.",
    },
    {
      title: "الفائدة",
      description:
        "توقعات رفع أو خفض الفائدة تحرّك العملات قبل صدور القرار الفعلي.",
    },
    {
      title: "التضخم",
      description:
        "بيانات CPI وPCE تعيد تسعير توقعات السياسة النقدية وتؤثر على قوة العملة.",
    },
    {
      title: "البنوك المركزية",
      description:
        "تصريحات الفيدرالي، ECB، BoE، BoJ وغيرها تخلق تقلبات حادة في الأزواج.",
    },
    {
      title: "البيانات الاقتصادية",
      description:
        "النمو، التوظيف، ميزان التجارة، ومداخيل PMIs تدفع حركة قصيرة ومتوسطة المدى.",
    },
  ],
  metal: [
    {
      title: "الدولار",
      description:
        "علاقة عكسية شائعة بين الدولار والمعادن؛ قوة الدولار تضغط على الذهب والفضة غالباً.",
    },
    {
      title: "الفائدة",
      description:
        "ارتفاع العائد الحقيقي وأسعار السندات يقلل جاذبية المعادن كملاذ بدون عائد.",
    },
    {
      title: "التضخم",
      description:
        "المعادن تُنظر إليها كتحوط ضد التضخم، لذا بيانات الأسعار تؤثر على الطلب الاستثماري.",
    },
    {
      title: "المخاطر الجيوسياسية",
      description:
        "التوترات والحروب والأزمات تزيد الطلب على الملاذات الآمنة مثل الذهب.",
    },
  ],
  energy: [
    {
      title: "أوبك+",
      description:
        "قرارات الإنتاج والتخفيضات أو الزيادات تغيّر توقعات العرض بسرعة.",
    },
    {
      title: "المخزونات",
      description:
        "تقارير المخزونات الأمريكية والعالمية تعكس فائض أو نقص العرض الفعلي.",
    },
    {
      title: "الطلب العالمي",
      description:
        "نمو الصين والهند، مواسم السفر، والنشاط الصناعي يدفعان استهلاك الطاقة.",
    },
    {
      title: "الدولار",
      description:
        "تسعير النفط بالدولار يجعل حركته مرتبطة بقوة العملة الأمريكية.",
    },
  ],
  indices: [
    {
      title: "الأرباح",
      description:
        "نتائج الشركات الكبرى وتوصيات المحللين تعيد تسعير المؤشرات بسرعة.",
    },
    {
      title: "الفائدة",
      description:
        "تغيّر توقعات الفائدة يؤثر على تقييم الأسهم خاصة شركات النمو.",
    },
    {
      title: "السندات",
      description:
        "ارتفاع العوائد ينافس الأسهم على رأس المال ويضغط على المؤشرات.",
    },
    {
      title: "بيانات الاقتصاد",
      description:
        "GDP والتوظيف والتضخم يحددون مسار السياسة النقدية ومعنويات السوق.",
    },
  ],
};
/** @type {Array<{ icon: string, title: string, description: string, href?: string, cta?: string }>} */
function buildUsageSteps(config) {
  return [
    {
      icon: "📊",
      title: "متابعة السعر",
      description: `راقب السعر المباشر وشارت TradingView لـ ${config.symbol} في أعلى الصفحة لفهم الاتجاه اللحظي.`,
    },
    {
      icon: "📰",
      title: "قراءة الأخبار",
      description: `راجع قسم الأخبار المفلترة لـ ${config.name} لربط الأحداث الاقتصادية بحركة السعر.`,
      href: config.news.tagHref,
      cta: "أخبار الأصل",
    },
    {
      icon: "🧠",
      title: "طلب تحليل",
      description: `اطلب تحليلاً مخصصاً لـ ${config.symbol} من فريق HasaN CharT World عند الحاجة لرؤية أعمق.`,
      href: "/analysis/request",
      cta: "اطلب تحليل",
    },
    {
      icon: "🔔",
      title: "إنشاء تنبيه",
      description: `أنشئ تنبيهاً سعرياً لـ ${config.symbol} لتصلك إشعار عند وصول مستوى محدد.`,
      href: "/alerts",
      cta: "التنبيهات",
    },
    {
      icon: "💎",
      title: "الاشتراك في VIP",
      description: `استكشف VIP Spot و VIP Futures للحصول على توصيات وإشارات مرتبطة بسوق ${config.categoryLabel}.`,
      href: "/subscriptions",
      cta: "الاشتراكات",
    },
  ];
}
const SMART_INTERNAL_LINKS = [
  { label: "جميع الأصول", href: "/assets" },
  { label: "طلب تحليل", href: "/analysis/request" },
  { label: "التنبيهات السعرية", href: "/alerts" },
  { label: "الاشتراكات", href: "/subscriptions" },
  { label: "VIP Spot", href: "/vip-spot" },
  { label: "VIP Futures", href: "/vip-futures" },
];
/** @type {Record<string, Array<{ q: string, a: string }>>} */
const CATEGORY_FAQ = {
  crypto: [
    {
      q: "كيف أتابع {name} ({symbol}) بشكل يومي؟",
      a: "ابدأ بالسعر المباشر والشارت في هذه الصفحة، ثم راقب أخبار {symbol} والتحليلات اليومية. عند الحاجة لقراءة أعمق، اطلب تحليلاً مخصصاً أو فعّل تنبيهاً سعرياً.",
    },
    {
      q: "ما الذي يحرك {symbol} أكثر من غيره في سوق الكريبتو؟",
      a: "غالباً البيتكوين، السيولة على المنصات، أخبار التنظيم، والفائدة الأمريكية. كما أن معنويات المخاطرة العالمية تؤثر على معظم العملات الرقمية بما فيها {name}.",
    },
    {
      q: "هل توفر المنصة تحليلات وإشارات لـ {symbol}؟",
      a: "نعم، عبر التحليلات اليومية، طلب تحليل مخصص، وخدمات VIP Spot و VIP Futures. يمكنك أيضاً إنشاء تنبيه سعري لـ {symbol} من صفحة التنبيهات.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لـ {symbol}؟",
      a: "انتقل إلى صفحة التنبيهات، اختر زوج {symbol} أو الأصل المناسب، وحدد المستوى السعري الذي تريد الإشعار عنده. التنبيهات تساعدك على عدم تفويت الحركات المهمة.",
    },
    {
      q: "أين أجد أخبار {name}؟",
      a: "في قسم الأخبار المفلترة داخل هذه الصفحة، أو عبر أرشيف أخبار الكريبتو. ننصح بربط الأخبار بما تراه على الشارت لبناء قراءة أوضح.",
    },
  ],
  forex: [
    {
      q: "كيف أتابع زوج {name} ({symbol})؟",
      a: "استخدم السعر المباشر وشارت TradingView في هذه الصفحة، وراقب الأخبار الاقتصادية والبيانات التي تؤثر على العملتين. التحليلات اليومية وإشارات الفوركس تساعد على توقيت أفضل.",
    },
    {
      q: "ما أهم العوامل المؤثرة على {symbol}؟",
      a: "الدولار، أسعار الفائدة، التضخم، تصريحات البنوك المركزية، والبيانات الاقتصادية الكبرى. أحياناً تتحرك الأزواج بقوة قبل الأخبار بسبب التسعير المسبق للتوقعات.",
    },
    {
      q: "هل توفر المنصة تحليلات {symbol}؟",
      a: "نعم، عبر التحليلات اليومية، إشارات الفوركس، وطلب تحليل مخصص. يمكنك أيضاً إنشاء تنبيه سعري عند وصول الزوج لمستوياتك المحددة.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لـ {symbol}؟",
      a: "من صفحة التنبيهات، حدد الزوج والمستوى المطلوب. التنبيهات مفيدة خاصة عند متابعة مستويات دعم ومقاومة أو أخبار اقتصادية قادمة.",
    },
    {
      q: "أين أجد أخبار {name}؟",
      a: "في قسم الأخبار المفلترة هنا أو عبر أرشيف أخبار الفوركس. ربط الخبر بالرسم البياني يعطيك صورة أوضح لاتجاه {symbol}.",
    },
  ],
  metal: [
    {
      q: "كيف أتابع {name} ({symbol})؟",
      a: "ابدأ بالسعر المباشر والشارت في هذه الصفحة، وراقب الدولار والفائدة والأخبار الجيوسياسية. المعادن تتفاعل غالباً مع بيانات التضخم ومعنويات الملاذ الآمن.",
    },
    {
      q: "لماذا يرتبط {symbol} بالدولار والفائدة؟",
      a: "المعادن تُسعّر بالدولار ولا تدر عائداً مباشراً، لذا قوة الدولار وارتفاع العوائد قد يضغطان على السعر، بينما التضخم والمخاطر الجيوسياسية قد تدعمه.",
    },
    {
      q: "هل توفر المنصة تحليلات {symbol}؟",
      a: "نعم، عبر التحليلات اليومية، إشارات الفوركس، وطلب تحليل مخصص. يمكنك أيضاً ضبط تنبيه سعري لـ {symbol}.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لـ {symbol}؟",
      a: "انتقل إلى التنبيهات وحدد المستوى الذي تريد مراقبته. مفيد عند تتبع مناطق شراء أو بيع محتملة على {name}.",
    },
    {
      q: "أين أجد أخبار {name}؟",
      a: "في قسم الأخبار المفلترة في هذه الصفحة أو عبر أخبار المعادن والسلع. تابع أيضاً أخبار الفيدرالي والدولار لفهم السياق الأوسع.",
    },
  ],
  energy: [
    {
      q: "كيف أتابع {name} ({symbol})؟",
      a: "راقب السعر المباشر والشارت هنا، وتابع أخبار أوبك+ والمخزونات والطلب العالمي. النفط حساس جداً للأخبار اللحظية وتقارير المخزونات الأسبوعية.",
    },
    {
      q: "ما الذي يحرك {symbol} في المدى القصير؟",
      a: "قرارات أوبك+، بيانات المخزونات، توقعات الطلب، والدولار. كما أن التوترات الجيوسياسية في مناطق الإنتاج قد تسبب قفزات سعرية حادة.",
    },
    {
      q: "هل توفر المنصة تحليلات {symbol}؟",
      a: "نعم، عبر التحليلات اليومية وطلب تحليل مخصص وخدمات VIP. التنبيهات السعرية تساعد عند متابعة مستويات تقنية مهمة.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لـ {symbol}؟",
      a: "من صفحة التنبيهات، عيّن المستوى المطلوب لـ {symbol}. مفيد قبل صدور تقارير المخزونات أو اجتماعات أوبك.",
    },
    {
      q: "أين أجد أخبار {name}؟",
      a: "في قسم الأخبار المفلترة هنا أو عبر أرشيف أخبار النفط والسلع في المنصة.",
    },
  ],
  indices: [
    {
      q: "كيف أتابع مؤشر {name} ({symbol})؟",
      a: "استخدم السعر المباشر والشارت في هذه الصفحة، وراقب الأرباح والفائدة وبيانات الاقتصاد. المؤشرات تتأثر أيضاً بمعنويات المخاطرة العالمية.",
    },
    {
      q: "ما أهم محركات {symbol}؟",
      a: "نتائج الأرباح للشركات الكبرى، توقعات الفائدة، عوائد السندات، وبيانات النمو والتوظيف. التصريحات السياسية والجيوسياسية قد تضيف تقلبات حادة.",
    },
    {
      q: "هل توفر المنصة تحليلات {symbol}؟",
      a: "نعم، عبر التحليلات اليومية، التحليل الفني، وطلب تحليل مخصص. يمكنك ضبط تنبيهات عند مستويات مهمة للمؤشر.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لـ {symbol}؟",
      a: "من صفحة التنبيهات حدد المؤشر أو الأصل المرتبط والمستوى المطلوب. مفيد عند تداول المؤشرات أو الأصول المرتبطة بها.",
    },
    {
      q: "أين أجد أخبار {name}؟",
      a: "في قسم الأخبار المفلترة هنا أو عبر أخبار الأسهم والاقتصاد. ربط الأخبار بالشارت يساعد على فهم اتجاه {symbol}.",
    },
  ],
}; /** * @param {import("./configs/types").AssetHubConfig} config * @returns {Array<{ q: string, a: string }>} */
function getTemplateFaq(config) {
  const category = resolveTemplateCategory(config);
  const items = CATEGORY_FAQ[category] || CATEGORY_FAQ.crypto;
  return items.map((item) => ({
    q: item.q
      .replaceAll("{name}", config.name)
      .replaceAll("{symbol}", config.symbol),
    a: item.a
      .replaceAll("{name}", config.name)
      .replaceAll("{symbol}", config.symbol),
  }));
}
function MovementFactorCard({ title, description }) {
  return (
    <article className="rounded-[24px] border admin-panel-border ui-glass-10 p-5 backdrop-blur-xl">
      {" "}
      <h3 className="ui-public-seo-title text-lg">{title}</h3>{" "}
      <p className="mt-3 text-sm leading-7 ui-public-seo-body">
        {description}
      </p>{" "}
    </article>
  );
}
function UsageStepCard({ icon, title, description, href, cta }) {
  return (
    <article className="rounded-[24px] border admin-panel-border ui-glass-10 p-6 backdrop-blur-xl">
      {" "}
      <div className="mb-4 text-3xl">{icon}</div>{" "}
      <h3 className="ui-public-seo-title ui-public-seo-title--card text-xl">
        {title}
      </h3>{" "}
      <p className="mt-3 leading-8 ui-public-seo-body">{description}</p>{" "}
      {href && cta ? (
        <Link
          href={href}
          className="mt-5 inline-flex rounded-2xl border admin-panel-border admin-panel px-5 py-3 text-sm font-black no-underline transition hover:admin-panel"
        >
          {" "}
          {cta}{" "}
        </Link>
      ) : null}{" "}
    </article>
  );
} /** * @param {{ config: import("./configs/types").AssetHubConfig, newsItems?: Array<Record<string, unknown>> }} props */
function AssetNewsSection({ config, newsItems = [] }) {
  const headingId = `${config.id}-news-heading`;
  return (
    <section className="space-y-5" aria-labelledby={headingId}>
      {" "}
      <div className="flex flex-wrap items-end justify-between gap-4">
        {" "}
        <div>
          {" "}
          <h2
            id={headingId}
            className="ui-public-seo-title ui-public-seo-title--section"
          >
            {" "}
            آخر أخبار {config.name}{" "}
          </h2>{" "}
          <p className="ui-public-seo-subtitle mt-3">
            {" "}
            أخبار مفلترة لـ {config.symbol} من قسم الأخبار الاقتصادية.{" "}
          </p>{" "}
        </div>{" "}
        <Link
          href={config.news.tagHref}
          className="inline-flex items-center gap-2 rounded-2xl border admin-panel-border admin-panel px-6 py-3 text-sm font-black no-underline shadow-lg shadow-cyan-900/20 transition hover:admin-panel"
        >
          {" "}
          آخر أخبار هذا الأصل ←{" "}
        </Link>{" "}
      </div>{" "}
      {newsItems.length === 0 ? (
        <div className="public-seo-card rounded-[24px] border border-dashed admin-panel-border ui-glass-10 p-8 text-center">
          {" "}
          <p className="ui-public-seo-title text-lg">
            لا توجد أخبار {config.symbol} حالياً
          </p>{" "}
          <p className="ui-public-seo-subtitle mt-3">
            {" "}
            سيتم عرض آخر الأخبار المرتبطة بـ {config.name} هنا عند توفرها في قسم
            الأخبار.{" "}
          </p>{" "}
          <Link
            href={config.news.tagHref}
            className="mt-6 inline-flex rounded-2xl border admin-panel-border admin-panel px-6 py-3 font-black no-underline"
          >
            {" "}
            آخر أخبار هذا الأصل ←{" "}
          </Link>{" "}
        </div>
      ) : (
        <>
          {" "}
          <div className="grid gap-4 md:grid-cols-2">
            {" "}
            {newsItems.map((item) => (
              <article
                key={item.id}
                className="public-seo-card rounded-[24px] border admin-panel-border ui-glass-10 p-6 backdrop-blur-xl"
              >
                {" "}
                <div className="mb-3 flex items-center justify-between gap-3">
                  {" "}
                  <span className="rounded-full border admin-panel-border admin-panel px-3 py-1 text-xs font-black admin-text-muted">
                    {" "}
                    {config.symbol}{" "}
                  </span>{" "}
                  <time
                    className="text-xs ui-public-seo-subtitle"
                    dateTime={item.createdAt || undefined}
                  >
                    {" "}
                    {formatNewsDate(item.createdAt)}{" "}
                  </time>{" "}
                </div>{" "}
                <h3 className="ui-public-seo-title text-lg">
                  {" "}
                  <Link
                    href={item.href}
                    className="ui-public-seo-title no-underline hover:admin-text-muted"
                  >
                    {" "}
                    {item.title}{" "}
                  </Link>{" "}
                </h3>{" "}
                <p className="mt-3 line-clamp-3 text-sm leading-7 ui-public-seo-body">
                  {item.excerpt}
                </p>{" "}
                <Link
                  href={item.href}
                  className="mt-4 inline-flex text-sm font-black admin-text-muted no-underline hover:"
                >
                  {" "}
                  قراءة الخبر ←{" "}
                </Link>{" "}
              </article>
            ))}{" "}
          </div>{" "}
          <div className="flex justify-center pt-2">
            {" "}
            <Link
              href={config.news.tagHref}
              className="inline-flex items-center gap-2 rounded-2xl border admin-panel-border admin-panel px-6 py-3 text-sm font-black no-underline transition hover:admin-panel"
            >
              {" "}
              {config.news.archiveLabel} ←{" "}
            </Link>{" "}
          </div>{" "}
        </>
      )}{" "}
    </section>
  );
} /** * @param {{ config: import("./configs/types").AssetHubConfig, newsItems?: Array<Record<string, unknown>> }} props */
export default function AssetPageTemplate({ config, newsItems = [] }) {
  const accentRgb = config.hero.accentRgb || "34,211,238";
  const templateCategory = resolveTemplateCategory(config);
  const movementFactors =
    MOVEMENT_FACTORS[templateCategory] || MOVEMENT_FACTORS.crypto;
  const usageSteps = buildUsageSteps(config);
  const templateFaq = getTemplateFaq(config);
  return (
    <main
      className="ui-public-seo-page public-seo-page"
      style={{ "--ui-asset-accent-rgb": accentRgb }}
    >
      <div className="ui-asset-hub-page__backdrop pointer-events-none absolute inset-0" />
      <div className="ui-public-seo-page__grid pointer-events-none absolute inset-0" />
      <div className="relative z-10 mx-auto max-w-6xl space-y-8 px-4 py-12 md:px-6 md:py-16">
        {" "}
        <Breadcrumbs items={config.breadcrumbs} variant="dark" />{" "}
        <section className="public-seo-hero relative overflow-hidden rounded-[34px] border admin-panel-border admin-panel p-8 text-center shadow-2xl backdrop-blur-2xl md:p-12">
          {" "}
          <div className="relative z-10">
            {" "}
            <span className="inline-flex rounded-full border admin-panel-border admin-panel px-5 py-2 text-xs font-black admin-text-muted">
              {" "}
              {config.hero.badge}{" "}
            </span>{" "}
            <h1 className="mt-6 text-4xl font-black leading-tight md:text-6xl">
              {config.hero.title}
            </h1>{" "}
            <p className="ui-public-seo-body ui-public-seo-body--lg mx-auto mt-6 max-w-4xl">
              {" "}
              {config.hero.description}{" "}
            </p>{" "}
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              {" "}
              <Link
                href="/analysis/request"
                className="ui-public-seo-cta-primary no-underline"
              >
                {" "}
                اطلب تحليل لهذا الأصل{" "}
              </Link>{" "}
              <Link
                href="/alerts"
                className="rounded-2xl border admin-panel-border admin-panel px-8 py-4 font-black no-underline transition hover:admin-panel"
              >
                {" "}
                أنشئ تنبيه سعري{" "}
              </Link>{" "}
              <Link
                href="/assets"
                className="rounded-2xl border admin-panel-border admin-panel px-8 py-4 font-black no-underline transition hover:admin-panel"
              >
                {" "}
                شاهد جميع الأصول{" "}
              </Link>{" "}
            </div>{" "}
          </div>{" "}
        </section>{" "}
        <AssetPagePriceWidget config={config} />{" "}
        <AssetPageChartWidget config={config} />{" "}
        <section className="public-seo-card rounded-[34px] border admin-panel-border ui-glass-10 p-8 shadow-2xl backdrop-blur-2xl md:p-10">
          {" "}
          <div>
            {" "}
            <h2 className="ui-public-seo-title ui-public-seo-title--section">
              ملخص السوق
            </h2>{" "}
            <p className="mt-3 max-w-3xl text-lg leading-9 ui-public-seo-body">
              {" "}
              {config.description.marketSummary}{" "}
            </p>{" "}
          </div>{" "}
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {" "}
            <div className="rounded-2xl border admin-panel-border admin-panel p-5">
              {" "}
              <p className="text-sm font-black admin-text-muted">
                الزوج المرجعي
              </p>{" "}
              <p
                className="mt-2 ui-public-seo-title ui-public-seo-title--card text-xl"
                dir="ltr"
              >
                {" "}
                {config.pricePairLabel}{" "}
              </p>{" "}
            </div>{" "}
            <div className="rounded-2xl border admin-panel-border admin-panel p-5">
              {" "}
              <p className="text-sm font-black admin-text-muted">المنصة</p>{" "}
              <p className="mt-2 ui-public-seo-title ui-public-seo-title--card text-xl">
                {config.description.platform}
              </p>{" "}
            </div>{" "}
            <div className="rounded-2xl border admin-panel-border admin-panel p-5">
              {" "}
              <p className="text-sm font-black admin-text-muted">
                ساعات التداول
              </p>{" "}
              <p className="mt-2 ui-public-seo-title ui-public-seo-title--card text-xl">
                {config.description.tradingHours}
              </p>{" "}
            </div>{" "}
          </div>{" "}
          <div className="mt-6 flex flex-wrap gap-3">
            {" "}
            {config.links.marketSummary.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full border admin-panel-border admin-panel px-4 py-2 text-sm font-black no-underline"
              >
                {" "}
                {link.label}{" "}
              </Link>
            ))}{" "}
          </div>{" "}
        </section>{" "}
        <section className="public-seo-card rounded-[34px] border admin-panel-border ui-glass-10 p-8 shadow-2xl backdrop-blur-2xl md:p-10">
          {" "}
          <div className="text-center">
            {" "}
            <h2 className="ui-public-seo-title ui-public-seo-title--section">
              {" "}
              ماذا يؤثر على حركة هذا الأصل؟{" "}
            </h2>{" "}
            <p className="ui-public-seo-subtitle mt-3">
              {" "}
              عوامل رئيسية تؤثر على {config.name} ({config.symbol}) ضمن فئة{" "}
              {config.categoryLabel}{" "}
            </p>{" "}
          </div>{" "}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {" "}
            {movementFactors.map((factor) => (
              <MovementFactorCard
                key={factor.title}
                title={factor.title}
                description={factor.description}
              />
            ))}{" "}
          </div>{" "}
        </section>{" "}
        <AssetNewsSection config={config} newsItems={newsItems} />{" "}
        <AssetAnalysisSection config={config} />{" "}
        <section className="public-seo-card rounded-[34px] border admin-panel-border ui-glass-10 p-8 shadow-2xl backdrop-blur-2xl md:p-10">
          {" "}
          <div className="text-center">
            {" "}
            <h2 className="ui-public-seo-title ui-public-seo-title--section">
              كيف تستخدم هذه الصفحة؟
            </h2>{" "}
            <p className="ui-public-seo-subtitle mt-3">
              {" "}
              دليل سريع لاستخراج أقصى فائدة من مركز معلومات {config.name}{" "}
            </p>{" "}
          </div>{" "}
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {" "}
            {usageSteps.map((step) => (
              <UsageStepCard key={step.title} {...step} />
            ))}{" "}
          </div>{" "}
        </section>{" "}
        <section className="public-seo-card rounded-[34px] border admin-panel-border admin-panel p-8 text-center shadow-2xl backdrop-blur-2xl md:p-10">
          {" "}
          <h2 className="ui-public-seo-title ui-public-seo-title--card">
            ابدأ الآن مع {config.symbol}
          </h2>{" "}
          <p className="mx-auto mt-4 max-w-2xl ui-public-seo-body">
            {" "}
            حوّل المتابعة إلى قرار: اطلب تحليلاً، فعّل تنبيهاً، أو استكشف بقية
            مراكز الأصول.{" "}
          </p>{" "}
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
            {" "}
            <Link
              href="/analysis/request"
              className="rounded-2xl admin-panel px-8 py-4 font-black ui-public-seo-title no-underline shadow-[0_18px_50px_rgba(37,99,235,0.32)]"
            >
              {" "}
              اطلب تحليل لهذا الأصل{" "}
            </Link>{" "}
            <Link
              href="/alerts"
              className="rounded-2xl border admin-panel-border admin-panel px-8 py-4 font-black no-underline transition hover:admin-panel"
            >
              {" "}
              أنشئ تنبيه سعري{" "}
            </Link>{" "}
            <Link
              href="/assets"
              className="rounded-2xl border admin-panel-border admin-panel px-8 py-4 font-black no-underline transition hover:admin-panel"
            >
              {" "}
              شاهد جميع الأصول{" "}
            </Link>{" "}
          </div>{" "}
        </section>{" "}
        <section className="public-seo-card rounded-[34px] border admin-panel-border ui-glass-10 p-8 shadow-2xl backdrop-blur-2xl md:p-10">
          {" "}
          <div className="text-center">
            {" "}
            <h2 className="ui-public-seo-title ui-public-seo-title--section">
              الخدمات المرتبطة
            </h2>{" "}
            <p className="ui-public-seo-subtitle mt-3">
              خدمات HasaN CharT World لمتداولي {config.name}
            </p>{" "}
          </div>{" "}
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {" "}
            {config.services.map((service) => (
              <article
                key={service.title}
                className="rounded-[24px] border admin-panel-border ui-glass-10 p-6 backdrop-blur-xl"
              >
                {" "}
                <div className="mb-4 text-3xl">{service.icon}</div>{" "}
                <h3 className="ui-public-seo-title ui-public-seo-title--card text-xl">
                  {service.title}
                </h3>{" "}
                <p className="mt-3 leading-8 ui-public-seo-body">
                  {service.description}
                </p>{" "}
                <Link
                  href={service.href}
                  className="mt-5 inline-flex rounded-2xl border admin-panel-border admin-panel px-5 py-3 text-sm font-black no-underline transition hover:admin-panel"
                >
                  {" "}
                  {service.cta}{" "}
                </Link>{" "}
              </article>
            ))}{" "}
          </div>{" "}
        </section>{" "}
        <section className="space-y-5">
          {" "}
          <div className="text-center">
            {" "}
            <h2 className="ui-public-seo-title ui-public-seo-title--section">
              أصول مرتبطة
            </h2>{" "}
            <p className="ui-public-seo-subtitle mt-3">
              أصول وأسواق تؤثر أو تتأثر بحركة {config.name}
            </p>{" "}
          </div>{" "}
          <div className="grid gap-4 sm:grid-cols-2">
            {" "}
            {config.relatedAssets.map((asset) => (
              <Link
                key={asset.symbol}
                href={asset.href}
                className="public-seo-card rounded-[24px] border admin-panel-border ui-glass-10 p-6 no-underline backdrop-blur-xl transition hover:admin-panel-border"
              >
                {" "}
                <div className="flex items-start gap-4">
                  {" "}
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border admin-panel-border admin-panel text-sm font-black admin-text-muted">
                    {" "}
                    {asset.symbol}{" "}
                  </span>{" "}
                  <div>
                    {" "}
                    <h3 className="ui-public-seo-title text-lg">
                      {asset.name}
                    </h3>{" "}
                    <p className="mt-2 text-sm leading-7 ui-public-seo-body">
                      {asset.description}
                    </p>{" "}
                  </div>{" "}
                </div>{" "}
              </Link>
            ))}{" "}
          </div>{" "}
        </section>{" "}
        <section className="space-y-5">
          {" "}
          <div className="text-center">
            {" "}
            <h2 className="ui-public-seo-title ui-public-seo-title--section">
              الأسئلة الشائعة
            </h2>{" "}
            <p className="ui-public-seo-subtitle mt-3">
              إجابات عن {config.name} في HasaN CharT World
            </p>{" "}
          </div>{" "}
          <div className="space-y-3">
            {" "}
            {templateFaq.map((item) => (
              <FaqItem key={item.q} question={item.q} answer={item.a} />
            ))}{" "}
          </div>{" "}
        </section>{" "}
        <section className="space-y-5">
          {" "}
          <div className="text-center">
            {" "}
            <h2 className="ui-public-seo-title ui-public-seo-title--section">
              روابط داخلية
            </h2>{" "}
            <p className="ui-public-seo-subtitle mt-3">
              {" "}
              انتقل سريعاً إلى خدمات وصفحات HasaN CharT World المرتبطة بـ{" "}
              {config.name}{" "}
            </p>{" "}
          </div>{" "}
          <div className="flex flex-wrap justify-center gap-3">
            {" "}
            {SMART_INTERNAL_LINKS.map((link) => (
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
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {" "}
            {config.links.internal.map((link) => (
              <Link
                key={`${link.href}-${link.label}`}
                href={link.href}
                className="rounded-full border admin-panel-border admin-panel px-5 py-3 text-sm font-bold ui-public-seo-body no-underline transition hover:admin-panel-border hover:"
              >
                {" "}
                {link.label}{" "}
              </Link>
            ))}{" "}
          </div>{" "}
        </section>{" "}
        <section className="public-seo-card rounded-[34px] border admin-panel-border ui-glass-10 p-8 text-center shadow-2xl backdrop-blur-2xl md:p-10">
          {" "}
          <h2 className="ui-public-seo-title ui-public-seo-title--card">
            استكشف المزيد من الأصول
          </h2>{" "}
          <p className="mx-auto mt-4 max-w-2xl ui-public-seo-subtitle">
            {" "}
            تصفح دليل مراكز الأصول واكتشف المزيد من صفحات Asset Hub في HasaN
            CharT World.{" "}
          </p>{" "}
          <Link
            href="/assets"
            className="mt-6 inline-flex rounded-2xl admin-panel px-8 py-4 font-black ui-public-seo-title no-underline shadow-[0_18px_50px_rgba(37,99,235,0.32)] transition hover:opacity-95"
          >
            {" "}
            عرض جميع الأصول{" "}
          </Link>{" "}
        </section>{" "}
      </div>{" "}
    </main>
  );
}
