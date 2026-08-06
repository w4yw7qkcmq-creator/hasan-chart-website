import { buildCompanyPageJsonLd, serializeJsonLd } from "../../../lib/seo";

const COMPANY_TITLE = "HasaN CharT World | الشركة";
const COMPANY_DESCRIPTION =
  "صفحة الشركة الرسمية لمنصة HasaN CharT World، المتخصصة في التحليلات المالية، الأخبار الاقتصادية، التنبيهات السعرية، توصيات التداول، إدارة الحسابات، وخدمات المستثمرين.";

const COMPANY_FAQ = [
  {
    q: "ما هي HasaN CharT World؟",
    a: "منصة عربية متخصصة في متابعة وتحليل الأسواق المالية، تقدم تحليلات، أخبار اقتصادية، تنبيهات سعرية، اشتراكات، وإدارة حسابات للمتداولين والمستثمرين.",
  },
  {
    q: "هل التحليلات تعتمد على الذكاء الاصطناعي فقط؟",
    a: "لا. التحليلات والتوصيات الأساسية تصدر عن خبراء بشريين بخبرة ميدانية. الذكاء الاصطناعي أداة مساعدة في بعض الخدمات وليس بديلاً عن الخبراء.",
  },
  {
    q: "ما الأسواق التي تغطيها الشركة؟",
    a: "نغطي العملات الرقمية، الفوركس، الذهب، الفضة، الأسهم، المؤشرات، النفط، والأخبار الاقتصادية المرتبطة بها.",
  },
  {
    q: "كيف يمكن التواصل مع الشركة؟",
    a: "عبر قناة الدعم الرسمية على Telegram والبريد support@hasanchartworld.com والقنوات المذكورة في صفحة الشركة.",
  },
  {
    q: "هل الخدمات متاحة قبل التسجيل؟",
    a: "بعض المحتوى والصفحات العامة متاحة للجميع. الخدمات الكاملة تتطلب إنشاء حساب والاشتراك في الباقات المناسبة.",
  },
];

export default function CompanyPageJsonLd() {
  const jsonLd = buildCompanyPageJsonLd({
    path: "/company",
    title: COMPANY_TITLE,
    description: COMPANY_DESCRIPTION,
    faq: COMPANY_FAQ,
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}
