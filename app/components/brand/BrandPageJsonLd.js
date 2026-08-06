import { buildBrandPageJsonLd, serializeJsonLd } from "../../../lib/seo";

const BRAND_TITLE = "HasaN CharT World | العلامة التجارية الرسمية";
const BRAND_DESCRIPTION =
  "HasaN CharT World منصة عربية للتحليلات المالية، توصيات التداول، الأخبار الاقتصادية، التنبيهات السعرية، وإدارة الحسابات.";

export default function BrandPageJsonLd() {
  const jsonLd = buildBrandPageJsonLd({
    path: "/brand",
    title: BRAND_TITLE,
    description: BRAND_DESCRIPTION,
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}
