const { hasClearDevelopment } = require("./evidence-sufficiency");

const INSTRUMENT_ARABIC = Object.freeze({
  gold: "الذهب",
  oil: "النفط",
  bitcoin: "البيتكوين",
  nasdaq: "ناسdaq",
  dow: "داو جونز",
  sp500: "S&P 500",
  nvidia: "إنفيديا",
});

const ORGANIZATION_ARABIC = Object.freeze([
  { pattern: /bank of korea/i, label: "بنك كوريا" },
  { pattern: /bank of japan|\bboj\b/i, label: "بنك اليابان" },
  { pattern: /federal reserve|\bfed\b/i, label: "الاحتياطي الفيدرالي" },
  { pattern: /ecb|european central bank/i, label: "البنك المركزي الأوروبي" },
  { pattern: /treasury/i, label: "وزارة الخزانة الأمريكية" },
  { pattern: /coinbase/i, label: "كوينبيس" },
  { pattern: /paramount/i, label: "باراماونت" },
  { pattern: /supreme court/i, label: "المحكمة العليا" },
  { pattern: /sec\b/i, label: "هيئة SEC" },
  { pattern: /mufg/i, label: "MUFG" },
  { pattern: /standard chartered/i, label: "ستاندرد تشارترد" },
  { pattern: /visa|mastercard/i, label: "شركات بطاقات ائتمان" },
  { pattern: /lakers|76ers/i, label: "LA Lakers" },
  { pattern: /ford\b/i, label: "فورد" },
  { pattern: /pboc|people'?s bank of china/i, label: "البنك المركزي الصيني" },
  { pattern: /spacex/i, label: "SpaceX" },
  { pattern: /main street|comcast|charter/i, label: "شركات إعلام واتصالات" },
  { pattern: /california ag|rob bonta/i, label: "المدعي العام Rob Bonta" },
  { pattern: /gemini/i, label: "Gemini" },
  { pattern: /strategy\b/i, label: "Strategy" },
  { pattern: /pakistan/i, label: "Pakistan" },
  { pattern: /political group|stand with crypto/i, label: "جماعة سياسية للعملات الرقمية" },
  { pattern: /tanker|ukmto/i, label: "ناقلة" },
]);

const TITLE_ACTION_ARABIC = Object.freeze([
  { pattern: /rate call|interest rate|rate decision/i, label: "قرار أسعار الفائدة" },
  { pattern: /coin toss|split on|economists split/i, label: "تباين توقعات الاقتصاديين" },
  { pattern: /decline|fell|drop|slip|retreat/i, label: "تراجع" },
  { pattern: /rise|rally|gain|surge|jump/i, label: "ارتفاع" },
  { pattern: /hike odds|rate hike|hike/i, label: "احتمال رفع الفائدة" },
  { pattern: /buyback/i, label: "إعادة شراء سندات" },
  { pattern: /sanction/i, label: "عقوبات" },
  { pattern: /tariff/i, label: "رسوم جمركية" },
  { pattern: /earnings|beat|miss|guidance/i, label: "نتائج أرباح" },
  { pattern: /final hurdle|buying|m&a|merger|acquisition|antitrust/i, label: "صفقة أو تحدٍ تنظيمي" },
  { pattern: /cancel|cancels/i, label: "إلغاء" },
  { pattern: /softens|tone/i, label: "تخفيف موقف" },
  { pattern: /underpaid|licensing fees/i, label: "دعوى ترخيص" },
  { pattern: /debuts|launch|introduc/i, label: "إطلاق" },
  { pattern: /investigate|probe|subpoena/i, label: "تحقيق رقابي" },
  { pattern: /stablecoin/i, label: "عملة مستقرة" },
  { pattern: /keynote|speech/i, label: "كلمة رسمية" },
  { pattern: /worth|billion|million/i, label: "تقييم مالي" },
  { pattern: /sue|sues|lawsuit/i, label: "دعوى قضائية" },
  { pattern: /hit fresh records|hit record/i, label: "مستويات قياسية" },
  { pattern: /expected to set|reference rate/i, label: "تحديد سعر مرجعي" },
  { pattern: /plans to|plan to/i, label: "خطة" },
  { pattern: /struck|strike/i, label: "تعرض لضربة" },
  { pattern: /raises|raise/i, label: "رفع تمويل" },
  { pattern: /licensing regime|registration deadline/i, label: "نظام ترخيص" },
  { pattern: /political group|backing/i, label: "دعم سياسي" },
  { pattern: /crosshair|trade-war|tariff/i, label: "توتر تجاري" },
]);

function isPredominantlyArabic(text = "") {
  const arabic = (String(text || "").match(/[\u0600-\u06FF]/g) || []).length;
  const latin = (String(text || "").match(/[A-Za-z]/g) || []).length;
  return arabic >= 12 && arabic >= latin;
}

function resolveOrganizationArabic(title = "", organizations = []) {
  for (const org of organizations) {
    const label = String(org || "").trim();
    if (label) {
      const mapped = ORGANIZATION_ARABIC.find((entry) => entry.pattern.test(label));
      if (mapped) return mapped.label;
    }
  }
  for (const entry of ORGANIZATION_ARABIC) {
    if (entry.pattern.test(title)) return entry.label;
  }
  return "";
}

function resolveSubjectArabic(evidence = {}, facts = {}) {
  const title = String(evidence.title || "");
  const primaryPerson = (facts.people || [])[0];
  if (primaryPerson?.name) {
    const role = primaryPerson.arabicRole ? `${primaryPerson.arabicRole} ` : "";
    return `${role}${primaryPerson.name}`.trim();
  }
  const org = resolveOrganizationArabic(title, facts.organizations || []);
  if (org) return org;
  const instrument = (facts.instruments || [])[0];
  if (instrument && INSTRUMENT_ARABIC[instrument]) return INSTRUMENT_ARABIC[instrument];
  if (/bitcoin|btc/i.test(title)) return "البيتكوين";
  if (/gold/i.test(title)) return "الذهب";
  if (/oil|crude|brent|wti/i.test(title)) return "النفط";
  if (/dollar/i.test(title)) return "الدولار";
  if (/yen/i.test(title)) return "الين";
  if (/yield|treasury/i.test(title)) return "عائد سندات الخزانة";
  if (/paramount|ellison|ceo/i.test(title)) return resolveOrganizationArabic(title, []) || "باراماونt";
  if (/visa|mastercard/i.test(title)) return "شركات بطاقات ائتمان";
  if (/ford\b/i.test(title)) return "فورد";
  if (/sec\b|situational awareness/i.test(title)) return "هيئة SEC";
  if (/crypto political|stand with crypto/i.test(title)) return "جماعة سياسية للعملات الرقمية";
  if (/main street|comcast|charter/i.test(title)) return "شركات إعلام واتصالات";
  return "";
}

function resolveActionArabic(title = "", snippet = "") {
  const combined = `${title} ${snippet}`;
  for (const entry of TITLE_ACTION_ARABIC) {
    if (entry.pattern.test(combined)) return entry.label;
  }
  return hasClearDevelopment(combined) ? "تطور وارد في المصدر" : "";
}

function buildFallbackHeadline(subjectArabic = "", actionArabic = "") {
  if (subjectArabic && actionArabic) {
    return `${subjectArabic}: ${actionArabic}`.slice(0, 140);
  }
  if (subjectArabic) {
    return `${subjectArabic}: ${actionArabic || "تطور وفق المصدر"}`.slice(0, 140);
  }
  return actionArabic || "تطور مالي وفق المصدر";
}

function buildFallbackBody(subjectArabic = "", actionArabic = "", evidence = {}, facts = {}) {
  const snippet = String(evidence.description || evidence.contentEncoded || "").trim();
  const numbers = (facts.numbers || [])
    .slice(0, 4)
    .map((entry) => String(entry.raw || entry).trim())
    .filter(Boolean);
  const primaryPerson = (facts.people || [])[0];
  const parts = [];

  if (primaryPerson?.name && /\bsaid\b|\bsays\b|\bwarns\b|\bannounces\b|\breports\b/i.test(`${evidence.title} ${snippet}`)) {
    parts.push(
      `أشار ${primaryPerson.arabicRole || "مسؤول"} ${primaryPerson.name} إلى التطور الوارد في المصدر دون إضافة سياق جديد.`
    );
  } else if (subjectArabic && actionArabic) {
    parts.push(`أفاد المصدر عن ${actionArabic} مرتبط بـ${subjectArabic}.`);
  } else if (actionArabic) {
    parts.push(`أفاد المصدر عن ${actionArabic}.`);
  }

  if (snippet.length >= 24 && /[\u0600-\u06FF]/.test(snippet)) {
    parts.push(`وورد في الملخص: ${snippet.replace(/https?:\/\/\S+/g, "").slice(0, 160)}`);
  } else if (actionArabic && subjectArabic) {
    parts.push(`يرتبط التطور بـ${subjectArabic}.`);
  }

  if (numbers.length) {
    parts.push(`وتضمن المصدر الأرقام: ${numbers.join("، ")}.`);
  }

  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 320);
}

function buildDeterministicArabicFallback(evidence = {}, facts = {}) {
  const title = String(evidence.title || "").trim();
  const snippet = String(evidence.description || evidence.contentEncoded || "").trim();
  if (!title || title.length < 10) {
    return {
      headline: "",
      body: "",
      usedFacts: [],
      usedEntities: [],
      confidence: "fallback_insufficient",
      insufficientEvidence: true,
      fallback: true,
    };
  }

  const subjectArabic = resolveSubjectArabic(evidence, facts);
  const actionArabic = resolveActionArabic(title, snippet);
  const headline = buildFallbackHeadline(subjectArabic, actionArabic);
  let body = buildFallbackBody(subjectArabic, actionArabic, evidence, facts);

  if (!isPredominantlyArabic(`${headline} ${body}`)) {
    const numbers = (facts.numbers || [])
      .slice(0, 4)
      .map((entry) => String(entry.raw || entry).trim())
      .filter(Boolean);
    body = `أفاد المصدر عن ${actionArabic || "تطور"}${subjectArabic ? ` يتعلق بـ${subjectArabic}` : ""}.${
      numbers.length ? ` وورد ${numbers.join(" و")}.` : ""
    }`.slice(0, 320);
  }

  if (!headline || body.length < 20 || !isPredominantlyArabic(`${headline} ${body}`)) {
    return {
      headline: "",
      body: "",
      usedFacts: [],
      usedEntities: [],
      confidence: "fallback_insufficient",
      insufficientEvidence: true,
      fallback: true,
    };
  }

  return {
    headline,
    body,
    usedFacts: [title, snippet].filter(Boolean),
    usedEntities: [
      ...(facts.people || []).map((person) => person.name).filter(Boolean),
      ...(facts.organizations || []),
    ],
    confidence: "deterministic_arabic_fallback",
    insufficientEvidence: false,
    fallback: true,
  };
}

function needsDeterministicArabicFallback(editorial = {}, evidenceSufficiencyLevel = "") {
  const { isEvidenceSufficientForEditorial } = require("./evidence-sufficiency");
  if (!isEvidenceSufficientForEditorial(evidenceSufficiencyLevel)) return false;
  if (editorial.timeout) return false;
  if (!editorial.headline || !editorial.body) return true;
  if (editorial.insufficientEvidence) return true;
  if (["ai_invalid", "ai_failed", "ai_non_arabic"].includes(editorial.confidence)) return true;
  const arabic = (String(editorial.headline || "") + String(editorial.body || "")).match(/[\u0600-\u06FF]/g)?.length || 0;
  const latin = (String(editorial.headline || "") + String(editorial.body || "")).match(/[A-Za-z]/g)?.length || 0;
  if (latin > arabic * 1.2) return true;
  return false;
}

module.exports = {
  buildDeterministicArabicFallback,
  needsDeterministicArabicFallback,
  isPredominantlyArabic,
  resolveSubjectArabic,
  resolveActionArabic,
};
