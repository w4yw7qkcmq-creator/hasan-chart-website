import CommoditiesPageJsonLd from "../../components/commodities/CommoditiesPageJsonLd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_STATIC_MARKETING } from "../../../lib/public-cache-config";
export const revalidate = 3600;


export const metadata = buildPublicPageMetadata({
  path: "/commodities",
  title: "HasaN CharT World | السلع العالمية",
  description:
    "تابع تحليلات السلع العالمية مع HasaN CharT World، الذهب، الفضة، النفط، الغاز الطبيعي، السلع الزراعية، أخبار الطاقة، التضخم والتحليل الفني.",
  keywords: [
    "HasaN CharT World",
    "السلع العالمية",
    "الذهب",
    "الفضة",
    "النفط",
    "الغاز الطبيعي",
    "السلع الزراعية",
    "التضخم",
    "تحليل السلع",
  ],
});

export default function CommoditiesLayout({ children }) {
  return (
    <>
      <CommoditiesPageJsonLd />
      {children}
    </>
  );
}
