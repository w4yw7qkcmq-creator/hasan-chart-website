import GoldPageJsonLd from "../../components/gold/GoldPageJsonLd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_STATIC_MARKETING } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_STATIC_MARKETING;


export const metadata = buildPublicPageMetadata({
  path: "/gold",
  title: "HasaN CharT World | الذهب",
  description:
    "تابع تحليلات الذهب مع HasaN CharT World، من حركة الدولار والفائدة والتضخم إلى التحليل الفني، الأخبار، الإشارات وإدارة المخاطر.",
  keywords: [
    "HasaN CharT World",
    "الذهب",
    "XAU",
    "تداول الذهب",
    "تحليل الذهب",
    "أخبار الذهب",
    "الدولار الأمريكي",
    "التضخم",
    "إشارات الذهب",
  ],
});

export default function GoldLayout({ children }) {
  return (
    <>
      <GoldPageJsonLd />
      {children}
    </>
  );
}
