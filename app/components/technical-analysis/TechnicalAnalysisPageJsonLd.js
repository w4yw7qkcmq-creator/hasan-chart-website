import {
  buildTechnicalAnalysisPageJsonLd,
  serializeJsonLd,
} from "../../../lib/seo";
const TECHNICAL_ANALYSIS_TITLE = "HasaN CharT World | التحليل الفني";
const TECHNICAL_ANALYSIS_DESCRIPTION =
  "تعلم التحليل الفني مع HasaN CharT World، الدعوم والمقاومات، الشموع اليابانية، النماذج الفنية، SMC، Price Action وإدارة المخاطر.";
export const TECHNICAL_ANALYSIS_ITEM_LIST = [
  { name: "التحليل الفني", url: "/technical-analysis" },
  { name: "الدعوم والمقاومات", url: "/daily-analysis" },
  { name: "الشموع اليابانية", url: "/daily-analysis" },
  { name: "النماذج الفنية", url: "/daily-analysis" },
  { name: "SMC", url: "/trading-academy" },
  { name: "Price Action", url: "/daily-analysis" },
  { name: "التحليلات اليومية", url: "/daily-analysis" },
  { name: "طلب تحليل", url: "/analysis/request" },
  { name: "أكاديمية التداول", url: "/trading-academy" },
  { name: "الأسواق المالية", url: "/markets" },
];
const TECHNICAL_ANALYSIS_FAQ = [
  {
    q: "ما هو التحليل الفني؟",
    a: "منهج لدراسة حركة السعر على الشارت باستخدام الدعوم والمقاومات والاتجاهات والنماذج الفنية لتحديد نقاط الدخول والخروج.",
  },
  {
    q: "ما الفرق بين التحليل الفني والأساسي؟",
    a: "التحليل الفني يعتمد على الشارت وحركة السعر، بينما التحليل الأساسي يعتمد على الأخبار والبيانات الاقتصادية وتقييم الأصول.",
  },
  {
    q: "هل يستخدم HasaN CharT World التحليل الفني؟",
    a: "نعم، التحليلات اليومية وخدمات VIP وطلب التحليل تعتمد على منهج فني احترافي بإشراف خبراء.",
  },
  {
    q: "ما أهم أدوات التحليل الفني؟",
    a: "الدعوم والمقاومات، الاتجاهات، الشموع اليابانية، النماذج الفنية، SMC، وPrice Action.",
  },
  {
    q: "كيف أبدأ بتعلم التحليل الفني في المنصة؟",
    a: "استكشف التحليلات اليومية أو أكاديمية التداول أو طلب تحليل مخصص والاشتراكات.",
  },
];
export default function TechnicalAnalysisPageJsonLd() {
  const jsonLd = buildTechnicalAnalysisPageJsonLd({
    path: "/technical-analysis",
    title: TECHNICAL_ANALYSIS_TITLE,
    description: TECHNICAL_ANALYSIS_DESCRIPTION,
    items: TECHNICAL_ANALYSIS_ITEM_LIST,
    faq: TECHNICAL_ANALYSIS_FAQ,
  });
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}
