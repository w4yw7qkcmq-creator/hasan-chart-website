import { buildCryptoPageJsonLd, serializeJsonLd } from "../../../lib/seo";

const CRYPTO_TITLE = "HasaN CharT World | العملات الرقمية";
const CRYPTO_DESCRIPTION =
  "تعرف على سوق العملات الرقمية مع HasaN CharT World، من تحليل البيتكوين والإيثيريوم إلى إشارات الكريبتو، VIP Spot، VIP Futures، الأخبار وإدارة المخاطر.";

export const CRYPTO_ITEM_LIST = [
  { name: "سوق العملات الرقمية", url: "/markets" },
  { name: "بيتكوين وإيثيريوم", url: "/news/tag/bitcoin" },
  { name: "تحليل العملات الرقمية", url: "/crypto-analysis" },
  { name: "إشارات الكريبتو", url: "/crypto-analysis" },
  { name: "VIP Spot", url: "/vip-spot" },
  { name: "VIP Futures", url: "/vip-futures" },
  { name: "إدارة المخاطر", url: "/account-management" },
  { name: "أخبار الكريبتو", url: "/news/category/crypto" },
  { name: "التحليلات اليومية", url: "/daily-analysis" },
  { name: "الفوركس", url: "/forex" },
];

const CRYPTO_FAQ = [
  {
    q: "ما هو سوق العملات الرقمية؟",
    a: "سوق عالمي يُتداول فيه أصول رقمية لامركزية على مدار الساعة، أشهرها البيتكوين والإيثيريوم والعملات البديلة.",
  },
  {
    q: "هل يوفر HasaN CharT World تحليلات وإشارات للكريبتو؟",
    a: "نعم، نوفر تحليل العملات الرقمية وإشارات الكريبتو وخدمات VIP Spot و VIP Futures ضمن باقات الاشتراك.",
  },
  {
    q: "ما الفرق بين VIP Spot و VIP Futures؟",
    a: "VIP Spot يغطي التداول الفوري للأصول الرقمية، بينما VIP Futures يغطي العقود الآجلة مع إدارة مخاطر مخصصة للرافعة.",
  },
  {
    q: "كيف أتابع الأخبار المؤثرة على الكريبتو؟",
    a: "يمكنك زيارة قسم أخبار الكريبتو أو تصفح وسوم البيتكوين والكريبتو ضمن صفحة الأخبار.",
  },
  {
    q: "كيف أبدأ بخدمات الكريبتو في المنصة؟",
    a: "أنشئ حساباً واستكشف تحليل العملات الرقمية أو الاشتراكات أو خدمات VIP Spot و VIP Futures.",
  },
];

export default function CryptoPageJsonLd() {
  const jsonLd = buildCryptoPageJsonLd({
    path: "/crypto",
    title: CRYPTO_TITLE,
    description: CRYPTO_DESCRIPTION,
    items: CRYPTO_ITEM_LIST,
    faq: CRYPTO_FAQ,
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}
