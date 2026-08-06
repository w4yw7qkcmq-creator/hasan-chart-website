import CompanyPageJsonLd from "../../components/company/CompanyPageJsonLd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_STATIC_MARKETING } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_STATIC_MARKETING;
export const metadata = buildPublicPageMetadata({
  path: "/company",
  title: "HasaN CharT World | الشركة",
  description:
    "صفحة الشركة الرسمية لمنصة HasaN CharT World، المتخصصة في التحليلات المالية، الأخبار الاقتصادية، التنبيهات السعرية، توصيات التداول، إدارة الحسابات، وخدمات المستثمرين.",
  keywords: [
    "HasaN CharT World",
    "الشركة",
    "منصة تداول عربية",
    "تحليلات مالية",
    "الأخبار الاقتصادية",
    "إدارة الحسابات",
    "توصيات التداول",
  ],
});
export default function CompanyLayout({ children }) {
  return (
    <>
      
      <CompanyPageJsonLd /> {children}
    </>
  );
}
