import { buildMarketsPageJsonLd, serializeJsonLd } from "../../../lib/seo";
import { getAssetsIndexJsonLdItems } from "./assetIndexHelpers";

const PAGE_TITLE = "HasaN CharT World | مراكز الأصول — دليل Asset Hub";
const PAGE_DESCRIPTION =
  "دليل شامل لجميع مراكز الأصول في HasaN CharT World: العملات الرقمية، الفوركس، المعادن، الطاقة، والمؤشرات — مع روابط مباشرة لكل Asset Hub.";

export default function AssetsIndexJsonLd() {
  const jsonLd = buildMarketsPageJsonLd({
    path: "/assets",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    items: getAssetsIndexJsonLdItems(),
    itemListName: "مراكز الأصول في HasaN CharT World",
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}
