import { buildAboutPageJsonLd, serializeJsonLd } from "../../../lib/seo";

const ABOUT_TITLE = "من نحن | HasaN CharT World";
const ABOUT_DESCRIPTION =
  "تعرف على منصة HasaN CharT World، المنصة العربية المتخصصة في التحليلات المالية والأخبار الاقتصادية والتنبيهات السعرية وإدارة الحسابات وبرنامج الشركاء.";

export default function AboutPageJsonLd() {
  const jsonLd = buildAboutPageJsonLd({
    path: "/about",
    title: ABOUT_TITLE,
    description: ABOUT_DESCRIPTION,
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}
