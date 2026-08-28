import AboutPageJsonLd from "../../components/about/AboutPageJsonLd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_STATIC_MARKETING } from "../../../lib/public-cache-config";
export const revalidate = 3600;


export const metadata = buildPublicPageMetadata({
  path: "/about",
  title: "من نحن | HasaN CharT World",
  description:
    "تعرف على منصة HasaN CharT World، المنصة العربية المتخصصة في التحليلات المالية والأخبار الاقتصادية والتنبيهات السعرية وإدارة الحسابات وبرنامج الشركاء.",
  keywords: [
    "HasaN CharT World",
    "من نحن",
    "منصة تداول عربية",
    "تحليلات العملات الرقمية",
    "الفوركس",
    "الأسهم",
    "الأخبار الاقتصادية",
    "التنبيهات السعرية",
  ],
});

export default function AboutLayout({ children }) {
  return (
    <>
      <AboutPageJsonLd />
      {children}
    </>
  );
}
