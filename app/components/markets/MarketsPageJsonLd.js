import { buildMarketsPageJsonLd, serializeJsonLd } from "../../../lib/seo";

const MARKETS_TITLE = "HasaN CharT World | الأسواق المالية";
const MARKETS_DESCRIPTION =
  "تعرف على جميع الأسواق التي تغطيها منصة HasaN CharT World، بما في ذلك العملات الرقمية، الفوركس، الذهب، الأسهم، المؤشرات، النفط، الأخبار الاقتصادية، والتحليلات الاحترافية.";

export const MARKETS_ITEM_LIST = [
  { name: "العملات الرقمية", url: "/crypto-analysis" },
  { name: "الفوركس", url: "/forex-signals" },
  { name: "الذهب", url: "/forex-signals" },
  { name: "الفضة", url: "/forex-signals" },
  { name: "الأسهم", url: "/news/category/stocks" },
  { name: "المؤشرات العالمية", url: "/daily-analysis" },
  { name: "النفط والطاقة", url: "/news/category/commodities" },
  { name: "الأخبار الاقتصادية", url: "/news" },
  { name: "التحليل الفني", url: "/daily-analysis" },
  { name: "التحليل الأساسي", url: "/analysis/request" },
  { name: "التنبيهات السعرية", url: "/#alerts" },
  { name: "إدارة الحسابات", url: "/account-management-service" },
  { name: "خدمات المستثمرين", url: "/subscriptions" },
];

const MARKETS_FAQ = [
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

export default function MarketsPageJsonLd() {
  const jsonLd = buildMarketsPageJsonLd({
    path: "/markets",
    title: MARKETS_TITLE,
    description: MARKETS_DESCRIPTION,
    items: MARKETS_ITEM_LIST,
    faq: MARKETS_FAQ,
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}
