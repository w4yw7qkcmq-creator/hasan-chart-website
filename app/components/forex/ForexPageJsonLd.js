import { buildForexPageJsonLd, serializeJsonLd } from "../../../lib/seo";
const FOREX_TITLE = "HasaN CharT World | الفوركس";
const FOREX_DESCRIPTION =
  "تعرف على سوق الفوركس مع HasaN CharT World، من أزواج العملات والتحليل الفني والأساسي إلى الأخبار الاقتصادية، إدارة المخاطر، وإشارات التداول الاحترافية.";
export const FOREX_ITEM_LIST = [
  { name: "أزواج العملات", url: "/forex-signals" },
  { name: "الدولار الأمريكي", url: "/news/tag/forex" },
  { name: "التحليل الفني", url: "/daily-analysis" },
  { name: "التحليل الأساسي", url: "/analysis/request" },
  { name: "الأخبار الاقتصادية", url: "/news" },
  { name: "إشارات الفوركس", url: "/forex-signals" },
  { name: "VIP Spot", url: "/vip-spot" },
  { name: "VIP Futures", url: "/vip-futures" },
  { name: "إدارة الحسابات", url: "/account-management" },
  { name: "الأسواق المالية", url: "/markets" },
];
const FOREX_FAQ = [
  {
    q: "ما هو سوق الفوركس؟",
    a: "سوق تداول العملات الأجنبية العالمي، يُتداول فيه أزواج العملات على مدار 24 ساعة خلال أيام الأسبوع.",
  },
  {
    q: "هل يوفر HasaN CharT World إشارات فوركس؟",
    a: "نعم، نوفر إشارات فوركس وتحليلات فنية وأساسية وأخباراً اقتصادية مرتبطة بحركة أزواج العملات.",
  },
  {
    q: "ما أهم أزواج العملات؟",
    a: "أهمها EUR/USD وGBP/USD وUSD/JPY وUSD/CHF، إضافة إلى أزواج السلع مثل الذهب مقابل الدولار.",
  },
  {
    q: "كيف يؤثر الدولار الأمريكي على الفوركس؟",
    a: "الدولار محور السوق العالمي، وتغيرات أسعار الفائدة والتضخم والبيانات الأمريكية تؤثر على معظم الأزواج.",
  },
  {
    q: "كيف أبدأ بخدمات الفوركس في المنصة؟",
    a: "أنشئ حساباً واستكشف إشارات الفوركس أو التحليلات اليومية أو الاشتراكات وخدمات VIP.",
  },
];
export default function ForexPageJsonLd() {
  const jsonLd = buildForexPageJsonLd({
    path: "/forex",
    title: FOREX_TITLE,
    description: FOREX_DESCRIPTION,
    items: FOREX_ITEM_LIST,
    faq: FOREX_FAQ,
  });
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}
