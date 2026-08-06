import { buildOilPageJsonLd, serializeJsonLd } from "../../../lib/seo";
const OIL_TITLE = "HasaN CharT World | النفط والطاقة";
const OIL_DESCRIPTION =
  "تابع تحليلات النفط والطاقة مع HasaN CharT World، خام برنت، WTI، أخبار أوبك، المخزونات الأمريكية، التضخم، الدولار والتحليل الفني.";
export const OIL_ITEM_LIST = [
  { name: "سوق النفط", url: "/markets" },
  { name: "خام برنت", url: "/news/category/commodities" },
  { name: "WTI", url: "/news/category/commodities" },
  { name: "العرض والطلب", url: "/commodities" },
  { name: "أوبك", url: "/news/category/commodities" },
  { name: "المخزونات الأمريكية", url: "/news/tag/oil" },
  { name: "الدولار والفائدة", url: "/forex" },
  { name: "النفط والتضخم", url: "/news/tag/inflation" },
  { name: "التحليل الفني", url: "/daily-analysis" },
  { name: "أخبار النفط", url: "/news/category/commodities" },
];
const OIL_FAQ = [
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
export default function OilPageJsonLd() {
  const jsonLd = buildOilPageJsonLd({
    path: "/oil",
    title: OIL_TITLE,
    description: OIL_DESCRIPTION,
    items: OIL_ITEM_LIST,
    faq: OIL_FAQ,
  });
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}
