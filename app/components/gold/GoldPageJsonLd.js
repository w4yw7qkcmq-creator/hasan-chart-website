import { buildGoldPageJsonLd, serializeJsonLd } from "../../../lib/seo";
const GOLD_TITLE = "HasaN CharT World | الذهب";
const GOLD_DESCRIPTION =
  "تابع تحليلات الذهب مع HasaN CharT World، من حركة الدولار والفائدة والتضخم إلى التحليل الفني، الأخبار، الإشارات وإدارة المخاطر.";
export const GOLD_ITEM_LIST = [
  { name: "سوق الذهب", url: "/markets" },
  { name: "الدولار الأمريكي والذهب", url: "/forex" },
  { name: "الفائدة والتضخم", url: "/news/tag/inflation" },
  { name: "التحليل الفني للذهب", url: "/daily-analysis" },
  { name: "أخبار الذهب", url: "/news/tag/gold" },
  { name: "إشارات الذهب", url: "/forex-signals" },
  { name: "إدارة المخاطر", url: "/account-management" },
  { name: "VIP Spot", url: "/vip-spot" },
  { name: "VIP Futures", url: "/vip-futures" },
  { name: "طلب تحليل", url: "/analysis/request" },
];
const GOLD_FAQ = [
  {
    q: "ما هو سوق الذهب؟",
    a: "سوق عالمي يُتداول فيه المعدن الأصفر XAU كملاذ آمن وتحوّط ضد التضخم وعدم اليقين الاقتصادي.",
  },
  {
    q: "لماذا يتحرك الذهب؟",
    a: "يتحرك الذهب بتأثير الدولار الأمريكي وأسعار الفائدة والتضخم والأخبار الجيوسياسية والطلب المؤسسي.",
  },
  {
    q: "هل يوفر HasaN CharT World تحليلات وإشارات للذهب؟",
    a: "نعم، نوفر تحليلات فنية وأخباراً وإشارات مرتبطة بحركة الذهب ضمن خدمات الفوركس والتحليلات اليومية.",
  },
  {
    q: "كيف يرتبط الذهب بالدولار الأمريكي؟",
    a: "عادةً يتحرك الذهب عكس الدولار، فضعف الدولار يدعم الذهب والعكس صحيح في معظم الظروف.",
  },
  {
    q: "كيف أبدأ بمتابعة الذهب في المنصة؟",
    a: "أنشئ حساباً واستكشف التحليلات اليومية أو أخبار الذهب أو إشارات الفوركس والاشتراكات.",
  },
];
export default function GoldPageJsonLd() {
  const jsonLd = buildGoldPageJsonLd({
    path: "/gold",
    title: GOLD_TITLE,
    description: GOLD_DESCRIPTION,
    items: GOLD_ITEM_LIST,
    faq: GOLD_FAQ,
  });
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}
