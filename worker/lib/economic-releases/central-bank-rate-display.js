const { CANONICAL_EVENT_DEFINITIONS } = require("./canonical-events");

/** @typedef {{ publicEventTitleAr: string, publicIssuerAr: string, publicCountryAr: string, publicFlag: string }} CentralBankRateDisplay */

/** @type {Record<string, CentralBankRateDisplay>} */
const CENTRAL_BANK_RATE_PUBLIC_DISPLAY = {
  US_FED_RATE_DECISION: {
    publicEventTitleAr: "قرار الفائدة الأمريكية",
    publicIssuerAr: "الفيدرالي الأمريكي",
    publicCountryAr: "الولايات المتحدة",
    publicFlag: "🇺🇸",
  },
  UK_BOE_RATE_DECISION: {
    publicEventTitleAr: "قرار الفائدة البريطانية",
    publicIssuerAr: "بنك إنجلترا",
    publicCountryAr: "المملكة المتحدة",
    publicFlag: "🇬🇧",
  },
  EZ_ECB_RATE_DECISION: {
    publicEventTitleAr: "قرار الفائدة الأوروبية",
    publicIssuerAr: "البنك المركزي الأوروبي",
    publicCountryAr: "منطقة اليورو",
    publicFlag: "🇪🇺",
  },
  JP_BOJ_RATE_DECISION: {
    publicEventTitleAr: "قرار الفائدة اليابانية",
    publicIssuerAr: "بنك اليابان",
    publicCountryAr: "اليابان",
    publicFlag: "🇯🇵",
  },
  CA_BOC_RATE_DECISION: {
    publicEventTitleAr: "قرار الفائدة الكندية",
    publicIssuerAr: "بنك كندا",
    publicCountryAr: "كندا",
    publicFlag: "🇨🇦",
  },
  AU_RBA_RATE_DECISION: {
    publicEventTitleAr: "قرار الفائدة الأسترالية",
    publicIssuerAr: "البنك الاحتياطي الأسترالي",
    publicCountryAr: "أستراليا",
    publicFlag: "🇦🇺",
  },
  NZ_RBNZ_RATE_DECISION: {
    publicEventTitleAr: "قرار الفائدة النيوزيلندية",
    publicIssuerAr: "البنك الاحتياطي النيوزيلندي",
    publicCountryAr: "نيوزيلندا",
    publicFlag: "🇳🇿",
  },
  CH_SNB_RATE_DECISION: {
    publicEventTitleAr: "قرار الفائدة السويسرية",
    publicIssuerAr: "البنك الوطني السويسري",
    publicCountryAr: "سويسرا",
    publicFlag: "🇨🇭",
  },
};

const ENGLISH_INSTITUTION_FRAGMENT =
  /\b(England|Reserve|Central Bank|Federal Reserve|ECB|BOE|BOJ|RBA|RBNZ|SNB|BOC|FOMC|Bank of England|Bank of Japan)\b/i;

function isCentralBankRateDecisionEvent(eventType) {
  if (!eventType) {
    return false;
  }
  if (CENTRAL_BANK_RATE_PUBLIC_DISPLAY[eventType]) {
    return true;
  }
  const def = CANONICAL_EVENT_DEFINITIONS[eventType];
  return def?.eventType === "rate_decision";
}

function resolveCentralBankRatePublicDisplay(eventType) {
  if (!eventType) {
    return null;
  }
  return CENTRAL_BANK_RATE_PUBLIC_DISPLAY[eventType] || null;
}

function resolveCentralBankPublicCountryLine(eventType, fallbackCountryLine) {
  const display = resolveCentralBankRatePublicDisplay(eventType);
  if (display) {
    return `${display.publicCountryAr} ${display.publicFlag}`.trim();
  }
  return fallbackCountryLine;
}

/**
 * Public headline for Telegram two-part template (headline — country).
 * Event semantics first; country/flag on countryLine.
 */
function resolveCentralBankPublicEventTitle(eventType, fallbackTitle = null) {
  const display = resolveCentralBankRatePublicDisplay(eventType);
  if (display) {
    return display.publicEventTitleAr;
  }
  return fallbackTitle;
}

/**
 * Single-line public title when only one headline slot is available.
 */
function resolveCentralBankSingleLinePublicTitle(eventType) {
  const display = resolveCentralBankRatePublicDisplay(eventType);
  if (!display) {
    return null;
  }
  return `${display.publicEventTitleAr} — ${display.publicIssuerAr} ${display.publicFlag}`;
}

function assertNoEnglishInstitutionLeakage(eventType, headline) {
  const display = resolveCentralBankRatePublicDisplay(eventType);
  if (!display || !headline) {
    return headline;
  }
  if (ENGLISH_INSTITUTION_FRAGMENT.test(String(headline))) {
    return display.publicEventTitleAr;
  }
  return headline;
}

function resolvePublicCanonicalDisplayName(eventType, fallbackTitle = null) {
  const titled = resolveCentralBankPublicEventTitle(eventType, fallbackTitle);
  return assertNoEnglishInstitutionLeakage(eventType, titled);
}

module.exports = {
  CENTRAL_BANK_RATE_PUBLIC_DISPLAY,
  ENGLISH_INSTITUTION_FRAGMENT,
  isCentralBankRateDecisionEvent,
  resolveCentralBankRatePublicDisplay,
  resolveCentralBankPublicCountryLine,
  resolveCentralBankPublicEventTitle,
  resolveCentralBankSingleLinePublicTitle,
  assertNoEnglishInstitutionLeakage,
  resolvePublicCanonicalDisplayName,
};
