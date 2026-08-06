import { buildCommoditiesPageJsonLd, serializeJsonLd } from "../../../lib/seo";
const COMMODITIES_TITLE = "HasaN CharT World | السلع العالمية";
const COMMODITIES_DESCRIPTION =
  "تابع تحليلات السلع العالمية مع HasaN CharT World، الذهب، الفضة، النفط، الغاز الطبيعي، السلع الزراعية، أخبار الطاقة، التضخم والتحليل الفني.";
export const COMMODITIES_ITEM_LIST = [
  { name: "الذهب", url: "/gold" },
  { name: "الفضة", url: "/gold" },
  { name: "النفط والطاقة", url: "/oil" },
  { name: "الغاز الطبيعي", url: "/news/category/commodities" },
  { name: "السلع الزراعية", url: "/news/category/commodities" },
  { name: "أخبار السلع", url: "/news/category/commodities" },
  { name: "أخبار النفط", url: "/news/category/commodities" },
  { name: "أخبار الذهب", url: "/news/tag/gold" },
  { name: "التحليل الفني", url: "/daily-analysis" },
  { name: "الأسواق المالية", url: "/markets" },
];
const COMMODITIES_FAQ = [
  {
    q: "ما هي السلع في الأسواق المالية؟",
    a: "أصول مادية تُتداول في الأسواق العالمية مثل الذهب والفضة والنفط والغاز والقمح، وتُعد مؤشرات اقتصادية مهمة.",
  },
  {
    q: "ما أهم السلع التي تغطيها المنصة؟",
    a: "نغطي المعادن الثمينة والطاقة والسلع الزراعية مع تحليلات وأخبار مرتبطة بكل فئة.",
  },
  {
    q: "كيف يؤثر التضخم على أسعار السلع؟",
    a: "التضخم المرتفع يدعم عادةً الذهب والسلع كمخزن للقيمة، بينما يؤثر على الطلب على الطاقة والزراعة.",
  },
  {
    q: "هل يوفر HasaN CharT World تحليلات للسلع؟",
    a: "نعم، نوفر تحليلات فنية وأخباراً مرتبطة بالسلع ضمن صفحات الذهب والنفط والتحليلات اليومية.",
  },
  {
    q: "كيف أبدأ بمتابعة السلع في المنصة؟",
    a: "أنشئ حساباً واستكشف صفحات الذهب والنفط أو أخبار السلع أو التحليلات اليومية والاشتراكات.",
  },
];
export default function CommoditiesPageJsonLd() {
  const jsonLd = buildCommoditiesPageJsonLd({
    path: "/commodities",
    title: COMMODITIES_TITLE,
    description: COMMODITIES_DESCRIPTION,
    items: COMMODITIES_ITEM_LIST,
    faq: COMMODITIES_FAQ,
  });
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}
