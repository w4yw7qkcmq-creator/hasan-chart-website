import EconomicNewsPageJsonLd from "../../components/economic-news/EconomicNewsPageJsonLd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_STATIC_MARKETING } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_STATIC_MARKETING;
export const metadata = buildPublicPageMetadata({
  path: "/economic-news",
  title: "HasaN CharT World | الأخبار الاقتصادية",
  description:
    "تابع الأخبار الاقتصادية مع HasaN CharT World، قرارات الفيدرالي، التضخم، البطالة، NFP، الفائدة، GDP وتأثيرها على الفوركس والذهب والعملات الرقمية.",
  keywords: [
    "HasaN CharT World",
    "الأخبار الاقتصادية",
    "الفيدرالي",
    "التضخم",
    "CPI",
    "PPI",
    "NFP",
    "البطالة",
    "الفائدة",
    "GDP",
    "التقويم الاقتصادي",
  ],
});
export default function EconomicNewsLayout({ children }) {
  return (
    <>
      
      <EconomicNewsPageJsonLd /> {children}
    </>
  );
}
