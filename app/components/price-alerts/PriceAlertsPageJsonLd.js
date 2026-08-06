import { buildPriceAlertsPageJsonLd, serializeJsonLd } from "../../../lib/seo";
const PRICE_ALERTS_TITLE = "HasaN CharT World | التنبيهات السعرية";
const PRICE_ALERTS_DESCRIPTION =
  "استخدم التنبيهات السعرية في HasaN CharT World لمتابعة العملات الرقمية، الفوركس، الذهب والأسواق المالية عبر إشعارات المتصفح والبريد الإلكتروني.";
export const PRICE_ALERTS_ITEM_LIST = [
  { name: "التنبيهات السعرية", url: "/alerts" },
  { name: "تنبيهات الكريبتو", url: "/crypto" },
  { name: "تنبيهات الفوركس", url: "/forex" },
  { name: "تنبيهات الذهب", url: "/gold" },
  { name: "تنبيهات السلع", url: "/commodities" },
  { name: "إشعارات المتصفح", url: "/alerts" },
  { name: "التحليل الفني", url: "/technical-analysis" },
  { name: "التحليلات اليومية", url: "/daily-analysis" },
  { name: "الاشتراكات", url: "/subscriptions" },
  { name: "الأسواق المالية", url: "/markets" },
];
const PRICE_ALERTS_FAQ = [
  {
    q: "ما هي التنبيهات السعرية؟",
    a: "إشعارات تُرسل عند وصول السعر لمستوى محدد مسبقاً، لتساعدك على عدم تفويت الفرص أو تجاهل المخاطر.",
  },
  {
    q: "لماذا يحتاج المتداول إلى تنبيه سعري؟",
    a: "لأن الأسواق تتحرك على مدار الساعة ولا يمكن مراقبة كل أصل — التنبيهات تُعلمك فور تحقق الشرط.",
  },
  {
    q: "هل يدعم HasaN CharT World تنبيهات للكريبتو والفوركس والذهب؟",
    a: "نعم، يمكنك ضبط تنبيهات لأصول متعددة ضمن خدمات المنصة.",
  },
  {
    q: "كيف أستلم التنبيهات؟",
    a: "عبر إشعارات المتصفح والبريد الإلكتروني حسب إعداداتك في المنصة.",
  },
  {
    q: "كيف أبدأ باستخدام التنبيهات السعرية؟",
    a: "أنشئ حساباً وانتقل إلى صفحة التنبيهات أو الاشتراكات لضبط مستوياتك المفضلة.",
  },
];
export default function PriceAlertsPageJsonLd() {
  const jsonLd = buildPriceAlertsPageJsonLd({
    path: "/price-alerts",
    title: PRICE_ALERTS_TITLE,
    description: PRICE_ALERTS_DESCRIPTION,
    items: PRICE_ALERTS_ITEM_LIST,
    faq: PRICE_ALERTS_FAQ,
  });
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}
