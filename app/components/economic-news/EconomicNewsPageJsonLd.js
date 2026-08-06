import { buildEconomicNewsPageJsonLd, serializeJsonLd } from "../../../lib/seo";
const ECONOMIC_NEWS_TITLE = "HasaN CharT World | الأخبار الاقتصادية";
const ECONOMIC_NEWS_DESCRIPTION =
  "تابع الأخبار الاقتصادية مع HasaN CharT World، قرارات الفيدرالي، التضخم، البطالة، NFP، الفائدة، GDP وتأثيرها على الفوركس والذهب والعملات الرقمية.";
export const ECONOMIC_NEWS_ITEM_LIST = [
  { name: "الأخبار الاقتصادية", url: "/news/category/economy" },
  { name: "الفيدرالي الأمريكي", url: "/news/tag/fed" },
  { name: "التضخم CPI و PPI", url: "/news/tag/inflation" },
  { name: "البطالة و NFP", url: "/news/category/economy" },
  { name: "الفائدة والبنوك المركزية", url: "/news/tag/fed" },
  { name: "الناتج المحلي GDP", url: "/news/category/economy" },
  { name: "تأثير على الفوركس", url: "/forex" },
  { name: "تأثير على الذهب", url: "/gold" },
  { name: "تأثير على الكريبتو", url: "/crypto" },
  { name: "التحليلات اليومية", url: "/daily-analysis" },
];
const ECONOMIC_NEWS_FAQ = [
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
export default function EconomicNewsPageJsonLd() {
  const jsonLd = buildEconomicNewsPageJsonLd({
    path: "/economic-news",
    title: ECONOMIC_NEWS_TITLE,
    description: ECONOMIC_NEWS_DESCRIPTION,
    items: ECONOMIC_NEWS_ITEM_LIST,
    faq: ECONOMIC_NEWS_FAQ,
  });
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}
