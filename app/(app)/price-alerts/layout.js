import PriceAlertsPageJsonLd from "../../components/price-alerts/PriceAlertsPageJsonLd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_STATIC_MARKETING } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_STATIC_MARKETING;
export const metadata = buildPublicPageMetadata({
  path: "/price-alerts",
  title: "HasaN CharT World | التنبيهات السعرية",
  description:
    "استخدم التنبيهات السعرية في HasaN CharT World لمتابعة العملات الرقمية، الفوركس، الذهب والأسواق المالية عبر إشعارات المتصفح والبريد الإلكتروني.",
  keywords: [
    "HasaN CharT World",
    "التنبيهات السعرية",
    "تنبيه سعر",
    "إشعارات المتصفح",
    "تنبيهات الكريبتو",
    "تنبيهات الفوركس",
    "تنبيهات الذهب",
    "إدارة المخاطر",
  ],
});
export default function PriceAlertsLayout({ children }) {
  return (
    <>
      
      <PriceAlertsPageJsonLd /> {children}
    </>
  );
}
