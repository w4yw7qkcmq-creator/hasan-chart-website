import CryptoPageJsonLd from "../../components/crypto/CryptoPageJsonLd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_STATIC_MARKETING } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_STATIC_MARKETING;
export const metadata = buildPublicPageMetadata({
  path: "/crypto",
  title: "HasaN CharT World | العملات الرقمية",
  description:
    "تعرف على سوق العملات الرقمية مع HasaN CharT World، من تحليل البيتكوين والإيثيريوم إلى إشارات الكريبتو، VIP Spot، VIP Futures، الأخبار وإدارة المخاطر.",
  keywords: [
    "HasaN CharT World",
    "العملات الرقمية",
    "البيتكوين",
    "الإيثريوم",
    "الكريبتو",
    "تحليل العملات الرقمية",
    "أخبار الكريبتو",
    "تداول الكريبتو",
    "VIP Crypto",
  ],
});
export default function CryptoLayout({ children }) {
  return (
    <>
      
      <CryptoPageJsonLd /> {children}
    </>
  );
}
