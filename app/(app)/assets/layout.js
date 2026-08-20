import AssetsIndexJsonLd from "../../components/asset-hub/AssetsIndexJsonLd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_STATIC_MARKETING } from "../../../lib/public-cache-config";
export const revalidate = 3600;


const PAGE_TITLE = "HasaN CharT World | مراكز الأصول — دليل Asset Hub";
const PAGE_DESCRIPTION =
  "دليل شامل لجميع مراكز الأصول في HasaN CharT World: العملات الرقمية، الفوركس، المعادن، الطاقة، والمؤشرات — مع روابط مباشرة لكل Asset Hub.";
const PAGE_KEYWORDS = [
  "HasaN CharT World",
  "مراكز الأصول",
  "Asset Hub",
  "العملات الرقمية",
  "الفوركس",
  "المعادن",
  "المؤشرات",
  "دليل الأصول",
];

export const metadata = buildPublicPageMetadata({
  path: "/assets",
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  keywords: PAGE_KEYWORDS,
});

export default function AssetsLayout({ children }) {
  return (
    <>
      <AssetsIndexJsonLd />
      {children}
    </>
  );
}
