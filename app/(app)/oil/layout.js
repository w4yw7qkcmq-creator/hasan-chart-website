import OilPageJsonLd from "../../components/oil/OilPageJsonLd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_STATIC_MARKETING } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_STATIC_MARKETING;


export const metadata = buildPublicPageMetadata({
  path: "/oil",
  title: "HasaN CharT World | النفط والطاقة",
  description:
    "تابع تحليلات النفط والطاقة مع HasaN CharT World، خام برنت، WTI، أخبار أوبك، المخزونات الأمريكية، التضخم، الدولار والتحليل الفني.",
  keywords: [
    "HasaN CharT World",
    "النفط",
    "الطاقة",
    "خام برنت",
    "WTI",
    "أوبك",
    "مخزونات النفط",
    "تحليل النفط",
    "أخبار النفط",
  ],
});

export default function OilLayout({ children }) {
  return (
    <>
      <OilPageJsonLd />
      {children}
    </>
  );
}
