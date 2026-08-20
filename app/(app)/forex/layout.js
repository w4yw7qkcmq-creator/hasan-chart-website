import ForexPageJsonLd from "../../components/forex/ForexPageJsonLd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_STATIC_MARKETING } from "../../../lib/public-cache-config";
export const revalidate = 3600;


export const metadata = buildPublicPageMetadata({
  path: "/forex",
  title: "HasaN CharT World | الفوركس",
  description:
    "تعرف على سوق الفوركس مع HasaN CharT World، من أزواج العملات والتحليل الفني والأساسي إلى الأخبار الاقتصادية، إدارة المخاطر، وإشارات التداول الاحترافية.",
  keywords: [
    "HasaN CharT World",
    "الفوركس",
    "تداول العملات",
    "أزواج العملات",
    "الدولار الأمريكي",
    "إشارات الفوركس",
    "تحليل الفوركس",
    "الأخبار الاقتصادية",
    "VIP Forex",
  ],
});

export default function ForexLayout({ children }) {
  return (
    <>
      <ForexPageJsonLd />
      {children}
    </>
  );
}
