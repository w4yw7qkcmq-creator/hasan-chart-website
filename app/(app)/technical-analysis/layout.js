import TechnicalAnalysisPageJsonLd from "../../components/technical-analysis/TechnicalAnalysisPageJsonLd";
import { buildPublicPageMetadata } from "../../../lib/seo";
import { REVALIDATE_STATIC_MARKETING } from "../../../lib/public-cache-config";
export const revalidate = REVALIDATE_STATIC_MARKETING;


export const metadata = buildPublicPageMetadata({
  path: "/technical-analysis",
  title: "HasaN CharT World | التحليل الفني",
  description:
    "تعلم التحليل الفني مع HasaN CharT World، الدعوم والمقاومات، الشموع اليابانية، النماذج الفنية، SMC، Price Action وإدارة المخاطر.",
  keywords: [
    "HasaN CharT World",
    "التحليل الفني",
    "الدعوم والمقاومات",
    "الشموع اليابانية",
    "SMC",
    "Price Action",
    "النماذج الفنية",
    "إدارة المخاطر",
    "التحليلات اليومية",
  ],
});

export default function TechnicalAnalysisLayout({ children }) {
  return (
    <>
      <TechnicalAnalysisPageJsonLd />
      {children}
    </>
  );
}
