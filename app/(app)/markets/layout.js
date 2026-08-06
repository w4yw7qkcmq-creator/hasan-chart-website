import MarketsPageJsonLd from "../../components/markets/MarketsPageJsonLd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_STATIC_MARKETING } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_STATIC_MARKETING;
export const metadata = buildPublicPageMetadata({
  path: "/markets",
  title: "HasaN CharT World | الأسواق المالية",
  description:
    "تعرف على جميع الأسواق التي تغطيها منصة HasaN CharT World، بما في ذلك العملات الرقمية، الفوركس، الذهب، الأسهم، المؤشرات، النفط، الأخبار الاقتصادية، والتحليلات الاحترافية.",
  keywords: [
    "HasaN CharT World",
    "الأسواق المالية",
    "العملات الرقمية",
    "الفوركس",
    "الذهب",
    "الأسهم",
    "المؤشرات",
    "النفط",
    "الأخبار الاقتصادية",
    "تحليلات مالية",
  ],
});
export default function MarketsLayout({ children }) {
  return (
    <>
      
      <MarketsPageJsonLd /> {children}
    </>
  );
}
