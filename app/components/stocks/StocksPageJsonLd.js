import { buildStocksPageJsonLd, serializeJsonLd } from "../../../lib/seo";

const STOCKS_TITLE = "HasaN CharT World | الأسهم والمؤشرات";
const STOCKS_DESCRIPTION =
  "تابع تحليلات الأسهم والمؤشرات مع HasaN CharT World، أخبار السوق الأمريكي، ناسداك، داو جونز، S&P 500، أرباح الشركات والتحليل الفني.";

export const STOCKS_ITEM_LIST = [
  { name: "سوق الأسهم", url: "/markets" },
  { name: "S&P 500", url: "/daily-analysis" },
  { name: "Nasdaq", url: "/daily-analysis" },
  { name: "Dow Jones", url: "/daily-analysis" },
  { name: "أسهم التكنولوجيا", url: "/news/category/stocks" },
  { name: "أرباح الشركات", url: "/news/category/stocks" },
  { name: "الفائدة والتضخم", url: "/news/tag/inflation" },
  { name: "التحليل الفني", url: "/daily-analysis" },
  { name: "أخبار الأسهم", url: "/news/category/stocks" },
  { name: "وسم الأسهم", url: "/news/tag/stocks" },
];

const STOCKS_FAQ = [
  {
    q: "ما هو سوق الأسهم؟",
    a: "سوق يتيح تداول حصص الشركات المدرجة في البورصات، ويعكس توقعات المستثمرين للنمو والأرباح والاقتصاد.",
  },
  {
    q: "ما أهم المؤشرات الأمريكية؟",
    a: "أهمها S&P 500 وNasdaq وDow Jones — كل منها يمثل قطاعاً أو حجماً مختلفاً من السوق الأمريكي.",
  },
  {
    q: "هل يوفر HasaN CharT World تحليلات للأسهم؟",
    a: "نعم، نوفر تحليلات فنية وأخباراً مرتبطة بالأسهم الأمريكية والمؤشرات الرئيسية.",
  },
  {
    q: "كيف تؤثر أرباح الشركات على السوق؟",
    a: "نتائج الأرباح الفصلية تحرك أسعار الأسهم بقوة، خاصة للشركات القيادية عند تجاوز أو إخفاق التوقعات.",
  },
  {
    q: "كيف أبدأ بمتابعة الأسهم في المنصة؟",
    a: "أنشئ حساباً واستكشف التحليلات اليومية أو أخبار الأسهم أو طلب تحليل مخصص والاشتراكات.",
  },
];

export default function StocksPageJsonLd() {
  const jsonLd = buildStocksPageJsonLd({
    path: "/stocks",
    title: STOCKS_TITLE,
    description: STOCKS_DESCRIPTION,
    items: STOCKS_ITEM_LIST,
    faq: STOCKS_FAQ,
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}
