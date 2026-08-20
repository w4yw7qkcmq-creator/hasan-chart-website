import StocksPageJsonLd from "../../components/stocks/StocksPageJsonLd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_STATIC_MARKETING } from "../../../lib/public-cache-config";
export const revalidate = 3600;


export const metadata = buildPublicPageMetadata({
  path: "/stocks",
  title: "HasaN CharT World | الأسهم والمؤشرات",
  description:
    "تابع تحليلات الأسهم والمؤشرات مع HasaN CharT World، أخبار السوق الأمريكي، ناسداك، داو جونز، S&P 500، أرباح الشركات والتحليل الفني.",
  keywords: [
    "HasaN CharT World",
    "الأسهم",
    "المؤشرات",
    "S&P 500",
    "Nasdaq",
    "Dow Jones",
    "تحليل الأسهم",
    "أخبار الأسهم",
    "أرباح الشركات",
    "أسهم التكنولوجيا",
  ],
});

export default function StocksLayout({ children }) {
  return (
    <>
      <StocksPageJsonLd />
      {children}
    </>
  );
}
