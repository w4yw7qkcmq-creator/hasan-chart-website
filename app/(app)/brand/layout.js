import BrandPageJsonLd from "../../components/brand/BrandPageJsonLd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_STATIC_MARKETING } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_STATIC_MARKETING;


export const metadata = buildPublicPageMetadata({
  path: "/brand",
  title: "HasaN CharT World | العلامة التجارية الرسمية",
  description:
    "HasaN CharT World منصة عربية للتحليلات المالية، توصيات التداول، الأخبار الاقتصادية، التنبيهات السعرية، وإدارة الحسابات.",
  keywords: [
    "HasaN CharT World",
    "العلامة التجارية",
    "HasaN CharT",
    "منصة تداول عربية",
    "تحليلات مالية",
    "توصيات التداول",
    "الأخبار الاقتصادية",
  ],
});

export default function BrandLayout({ children }) {
  return (
    <>
      <BrandPageJsonLd />
      {children}
    </>
  );
}
